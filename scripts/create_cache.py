# coding: utf-8

"""This script create a cache from a list of OPI"""
import os
import math
from pathlib import Path
import glob
from random import randrange
import argparse
import json
import multiprocessing
import gdal
import numpy as np

cpu_dispo = multiprocessing.cpu_count()

parser = argparse.ArgumentParser()
parser.add_argument("-i", "--input",
                    required=True,
                    help="input OPI pattern")
parser.add_argument("-c", "--cache",
                    help="cache directory (default: cache)",
                    type=str,
                    default="cache")
parser.add_argument("-o", "--overviews",
                    help="params for the mosaic (default: ressources/LAMB93_5cm.json)",
                    type=str,
                    default="ressources/LAMB93_5cm.json")
parser.add_argument("-t", "--table",
                    help="graph table (default: graphe_pcrs56_zone_test)",
                    type=str,
                    default="graphe_pcrs56_zone_test")
parser.add_argument("-l", "--level",
                    help="level range for the calculation (default: values from ressources file)"
                    " (e.g., 15 19)",
                    type=int,
                    nargs='+')
parser.add_argument("-v", "--verbose",
                    help="verbose (default: 0)",
                    type=int,
                    default=0)
args = parser.parse_args()

verbose = args.verbose

user = os.getenv('PGUSER', default='postgres')
host = os.getenv('PGHOST', default='localhost')
database = os.getenv('PGDATABASE', default='pcrs')
password = os.getenv('PGPASSWORD', default='postgres')  # En dur, pas top...
port = os.getenv('PGPORT', default='5432')

NB_BANDS = 3
PNG_DRIVER = gdal.GetDriverByName('png')


def cut_opi_1tile(opi, dst_dir, tile, spatial_ref, nb_bands):
    """Cut and reseample a specified image at a given level"""
    if verbose > 0:
        print("~~~cut_opi_1tile")

    input_image = gdal.Open(opi['path'])
    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   tile['size']['width'],
                                                   tile['size']['height'],
                                                   nb_bands,
                                                   gdal.GDT_Byte)
    target_ds.SetGeoTransform((tile['origin']['x'],
                               tile['resolution'],
                               0,
                               tile['origin']['y'],
                               0,
                               -tile['resolution']))
    target_ds.SetProjection(spatial_ref)
    target_ds.FlushCache()

    # on reech l'OPI dans cette image
    gdal.Warp(target_ds, input_image)

    # on export en png (todo: gerer le niveau de Q)
    # pylint: disable=unused-variable
    dst_ds = PNG_DRIVER.CreateCopy(dst_dir + "/" + opi['name'] + ".png", target_ds)
    target_ds = None
    dst_ds = None  # noqa: F841
    # pylint: enable=unused-variable


def create_blank_tile(overviews, tile, nb_bands, spatial_ref):
    """Return a blank georef image for a tile."""
    origin_x = overviews['crs']['boundingBox']['xmin']\
        + tile['x'] * tile['resolution'] * overviews['tileSize']['width']
    origin_y = overviews['crs']['boundingBox']['ymax']\
        - tile['y'] * tile['resolution'] * overviews['tileSize']['height']
    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   overviews['tileSize']['width'],
                                                   overviews['tileSize']['height'],
                                                   nb_bands,
                                                   gdal.GDT_Byte)
    target_ds.SetGeoTransform((origin_x, tile['resolution'], 0,
                               origin_y, 0, -tile['resolution']))
    target_ds.SetProjection(spatial_ref)
    target_ds.FlushCache()
    return target_ds


def get_tile_limits(filename):
    """Return tms limits for a georef image at a given level"""
    if verbose > 0:
        print("~~~get_tile_limits:", end='')
    src_image = gdal.Open(filename)
    geo_trans = src_image.GetGeoTransform()
    ul_x = geo_trans[0]
    ul_y = geo_trans[3]
    x_dist = geo_trans[1]
    y_dist = geo_trans[5]
    lr_x = ul_x + src_image.RasterXSize * x_dist
    lr_y = ul_y + src_image.RasterYSize * y_dist

    tile_limits = {}
    tile_limits['LowerCorner'] = [ul_x, lr_y]
    tile_limits['UpperCorner'] = [lr_x, ul_y]

    if verbose > 0:
        print(" DONE")
    return tile_limits


def get_tilebox(input_filename, overviews):
    """Get the Min/MaxTileRow/Col for a specified image at all level"""
    if verbose > 0:
        print("~~~get_tilebox")

    tilebox = {}

    tile_limits = get_tile_limits(input_filename)

    if "LowerCorner" not in overviews['dataSet']['boundingBox']:
        overviews['dataSet']['boundingBox'] = tile_limits
    else:
        overviews['dataSet']['boundingBox']['LowerCorner'][0]\
            = min(tile_limits['LowerCorner'][0],
                  overviews['dataSet']['boundingBox']['LowerCorner'][0])
        overviews['dataSet']['boundingBox']['LowerCorner'][1]\
            = min(tile_limits['LowerCorner'][1],
                  overviews['dataSet']['boundingBox']['LowerCorner'][1])
        overviews['dataSet']['boundingBox']['UpperCorner'][0]\
            = max(tile_limits['LowerCorner'][0],
                  overviews['dataSet']['boundingBox']['UpperCorner'][0])
        overviews['dataSet']['boundingBox']['UpperCorner'][1]\
            = max(tile_limits['LowerCorner'][1],
                  overviews['dataSet']['boundingBox']['UpperCorner'][1])

    for tile_z in range(overviews['level']['computed'][0], overviews['level']['computed'][1] + 1):
        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - tile_z)

        min_tile_col = math.floor(round((tile_limits['LowerCorner'][0] -
                                         overviews['crs']['boundingBox']['xmin'])
                                        / (resolution * overviews['tileSize']['width']), 8))
        min_tile_row = math.floor(round((overviews['crs']['boundingBox']['ymax'] -
                                         tile_limits['UpperCorner'][1])
                                        / (resolution * overviews['tileSize']['height']), 8))
        max_tile_col = math.ceil(round((tile_limits['UpperCorner'][0] -
                                        overviews['crs']['boundingBox']['xmin'])
                                       / (resolution * overviews['tileSize']['width']), 8)) - 1
        max_tile_row = math.ceil(round((overviews['crs']['boundingBox']['ymax'] -
                                        tile_limits['LowerCorner'][1])
                                       / (resolution * overviews['tileSize']['height']), 8)) - 1

        tilebox_z = {
            'MinTileCol': min_tile_col,
            'MinTileRow': min_tile_row,
            'MaxTileCol': max_tile_col,
            'MaxTileRow': max_tile_row
        }
        tilebox[str(tile_z)] = tilebox_z

        if str(tile_z) not in overviews['dataSet']['limits']:
            overviews['dataSet']['limits'][str(tile_z)] = {
                'MinTileCol': min_tile_col,
                'MinTileRow': min_tile_row,
                'MaxTileCol': max_tile_col,
                'MaxTileRow': max_tile_row
            }
        else:
            overviews['dataSet']['limits'][str(tile_z)]['MinTileCol']\
                = min(min_tile_col,
                      overviews['dataSet']['limits'][str(tile_z)]['MinTileCol'])
            overviews['dataSet']['limits'][str(tile_z)]['MinTileRow']\
                = min(min_tile_row,
                      overviews['dataSet']['limits'][str(tile_z)]['MinTileRow'])
            overviews['dataSet']['limits'][str(tile_z)]['MaxTileCol']\
                = max(max_tile_col,
                      overviews['dataSet']['limits'][str(tile_z)]['MaxTileCol'])
            overviews['dataSet']['limits'][str(tile_z)]['MaxTileRow']\
                = max(max_tile_row,
                      overviews['dataSet']['limits'][str(tile_z)]['MaxTileRow'])
    return tilebox


def cut_image_1arg(arg):
    """Cut a given image in all corresponding tiles for all level"""
    if verbose > 0:
        print("~~~cut_image_1arg")

    overviews = arg['overviews']
    tilebox = arg['tileBox']

    # for z in tiles:
    for level in range(overviews['level']['computed'][0], overviews['level']['computed'][1] + 1):
        print('  (', arg['opi']['name'], ') level : ', level, sep="")

        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - level)

        for tile_x in range(tilebox[str(level)]['MinTileCol'],
                            tilebox[str(level)]['MaxTileCol'] + 1):
            for tile_y in range(tilebox[str(level)]['MinTileRow'],
                                tilebox[str(level)]['MaxTileRow'] + 1):
                tile_param = {
                    'origin': {
                        'x': overviews['crs']['boundingBox']['xmin']
                             + tile_x * resolution * overviews['tileSize']['width'],  # noqa: E131
                        'y': overviews['crs']['boundingBox']['ymax']
                             - tile_y * resolution * overviews['tileSize']['height']  # noqa: E131
                    },
                    'size': overviews['tileSize'],
                    'resolution': resolution
                }

                tile_dst_dir = args.cache + '/' + str(level) + '/' + str(tile_y) + '/' + str(tile_x)
                # si necessaire on cree le dossier de la tuile
                Path(tile_dst_dir).mkdir(parents=True, exist_ok=True)

                cut_opi_1tile(arg['opi'],
                              tile_dst_dir,
                              tile_param,
                              arg['spatialRef'],
                              arg['nbBands'])


def update_graph_and_ortho(filename, gdal_img, color, nb_bands):
    """application du masque"""
    opi = gdal.Open(filename)
    for i in range(nb_bands):
        opi_i = opi.GetRasterBand(i + 1).ReadAsArray()
        opi_i[(gdal_img['mask'] == 0)] = 0

        ortho_i = gdal_img['ortho'].GetRasterBand(i + 1).ReadAsArray()

        ortho_i[(gdal_img['mask'] != 0)] = 0
        gdal_img['ortho'].GetRasterBand(i + 1).WriteArray(np.add(opi_i, ortho_i))

        graph_i = gdal_img['graph'].GetRasterBand(i + 1).ReadAsArray()

        graph_i[(gdal_img['mask'] != 0)] = color[i]
        gdal_img['graph'].GetRasterBand(i + 1).WriteArray(graph_i)


def create_ortho_and_graph_1arg(arg):
    """Creation of the ortho and the graph images on a specified tile"""
    if verbose > 0:
        print("~~~create_ortho_and_graph_1arg")

    overviews = arg['overviews']

    if arg['advancement'] != 0:
        print("█", end='', flush=True)

    # on cree le graphe et l'ortho
    img_ortho = create_blank_tile(overviews, arg['tile'], 3, arg['spatialRef'])
    img_graph = create_blank_tile(overviews, arg['tile'], 3, arg['spatialRef'])

    tile_dir = args.cache + \
        '/' + str(arg['tile']['level']) + \
        '/' + str(arg['tile']['y']) + \
        '/' + str(arg['tile']['x'])

    is_empty = True

    for filename in glob.glob(tile_dir + '/*.png'):
        stem = Path(filename).stem
        color = overviews["list_OPI"][stem]

        # on cree une image mono canal pour la tuile
        mask = create_blank_tile(overviews, arg['tile'], 3, arg['spatialRef'])

        # on rasterise la partie du graphe qui concerne ce cliche
        db_graph = gdal.OpenEx(arg['conn_string'], gdal.OF_VECTOR)
        gdal.Rasterize(mask,
                       db_graph,
                       SQLStatement='select geom from '
                       + args.table + ' where cliche = \'' + stem + '\' ')
        img_mask = mask.GetRasterBand(1).ReadAsArray()
        # si le mask est vide, on a termine
        val_max = np.amax(img_mask)
        if val_max > 0:
            is_empty = False
            update_graph_and_ortho(filename,
                                   {'ortho': img_ortho, 'graph': img_graph, 'mask': img_mask},
                                   color,
                                   arg['nbBands'])

    if not is_empty:
        # pylint: disable=unused-variable
        dst_ortho = PNG_DRIVER.CreateCopy(tile_dir + "/ortho.png", img_ortho)
        dst_graph = PNG_DRIVER.CreateCopy(tile_dir + "/graph.png", img_graph)
        dst_ortho = None  # noqa: F841
        dst_graph = None  # noqa: F841
        # pylint: enable=unused-variable
    img_ortho = None
    img_graph = None


def new_color(image, mtd):
    """Choix d'une couleur non encore utilisée pour une image donnée"""

    color = [randrange(255), randrange(255), randrange(255)]
    while (color[0] in mtd)\
            and (color[1] in mtd[color[0]])\
            and (color[2] in mtd[color[0]][color[1]]):
        color = [randrange(255), randrange(255), randrange(255)]
    if color[0] not in mtd:
        mtd[color[0]] = {}
    if color[1] not in mtd[color[0]]:
        mtd[color[0]][color[1]] = {}

    mtd[color[0]][color[1]][color[2]] = image
    return color


def progress_bar(nb_steps, nb_tiles, args_create_ortho_and_graph):
    """préparation pour l'écriture de la barre d'avancement"""
    if nb_tiles < nb_steps:
        nb_steps = nb_tiles

    print("   0" + nb_steps * "_" + "100")

    for i in range(nb_tiles):
        args_create_ortho_and_graph[i]['advancement'] = 0
        if math.floor(i % (nb_tiles / nb_steps)) == 0:
            args_create_ortho_and_graph[i]['advancement'] = 1


def tiling(list_filename, overviews, spatial_ref_wkt):
    """tuilage d'une liste d'image suivant le fichier overviews renseigné"""
    print(" Préparation")
    mtd = {}
    opi_already_calculated = []
    args_cut_image = []
    for filename in list_filename:
        opi = Path(filename).stem
        if opi in overviews['list_OPI'].keys():
            # OPI déja traitée
            opi_already_calculated.append(opi)
        else:
            print('  image :', filename)

            args_cut_image.append({
                'opi': {
                    'path': filename,
                    'name': opi
                },
                'spatialRef': spatial_ref_wkt,
                'overviews': overviews,
                'tileBox': get_tilebox(filename, overviews),
                'nbBands': NB_BANDS
            })

            # on ajout l'OPI traitée a la liste (avec sa couleur)
            overviews["list_OPI"][opi] = new_color(opi, mtd)

    print(" Découpage")

    pool = multiprocessing.Pool(cpu_dispo - 1)
    pool.map(cut_image_1arg, args_cut_image)

    pool.close()
    pool.join()
    with open(args.cache + '/cache_mtd.json', 'w') as outfile:
        json.dump(mtd, outfile)

    return opi_already_calculated


def ortho_and_graph(overviews, conn_string, spatial_ref_wkt):
    """Parcours de l'ensemble des tuiles pour calculer l'ortho correspondante"""
    print(" Préparation")

    # Calcul des ortho et graph
    args_create_ortho_and_graph = []
    for level in overviews["dataSet"]["limits"]:
        print("  level :", level)

        level_limits = overviews["dataSet"]["limits"][level]
        resol = overviews['resolution'] * 2 ** (overviews['level']['max'] - int(level))

        for tile_x in range(level_limits["MinTileCol"], level_limits["MaxTileCol"] + 1):
            for tile_y in range(level_limits["MinTileRow"], level_limits["MaxTileRow"] + 1):

                args_create_ortho_and_graph.append({
                    'tile': {'x': tile_x, 'y': tile_y, 'level': int(level), 'resolution': resol},
                    'overviews': overviews,
                    'conn_string': conn_string,
                    'spatialRef': spatial_ref_wkt,
                    'nbBands': NB_BANDS
                })

    print(" Calcul")
    nb_tiles = len(args_create_ortho_and_graph)
    print(" ", nb_tiles, "tuiles à traiter")

    progress_bar(50, nb_tiles, args_create_ortho_and_graph)
    print('   |', end='', flush=True)
    pool = multiprocessing.Pool(cpu_dispo - 1)
    pool.map(create_ortho_and_graph_1arg, args_create_ortho_and_graph)

    pool.close()
    pool.join()
    print("|")


def main():
    """Create a cache from a list of input OPI."""

    with open(args.overviews) as json_overviews:
        overviews_dict = json.load(json_overviews)

    # overviews_dict = overviews_init
    overviews_dict["list_OPI"] = {}
    overviews_dict['dataSet'] = {}
    overviews_dict['dataSet']['boundingBox'] = {}
    overviews_dict['dataSet']['limits'] = {}

    spatial_ref = gdal.osr.SpatialReference()
    spatial_ref.ImportFromEPSG(overviews_dict['crs']['code'])
    spatial_ref_wkt = spatial_ref.ExportToWkt()

    conn_string = "PG:host="\
        + host + " dbname=" + database\
        + " user=" + user + " password=" + password

    list_filename = glob.glob(args.input)

    if args.level[0] < overviews_dict['level']['min'] \
            or args.level[1] > overviews_dict['level']['max']:
        raise SystemExit("create_cache.py: error: argument -l/--level: "
                         + str(args.level) +
                         ": out of default level range")

    level_min = overviews_dict['level']['min'] if args.level is None else args.level[0]
    level_max = overviews_dict['level']['max'] if args.level is None \
        else level_min if len(args.level) == 1 else args.level[1]

    overviews_dict['level']['computed'] = [level_min, level_max]

    # Decoupage des images et calcul de l'emprise globale
    print("Découpe des images :")
    print("", len(list_filename), "image(s) à traiter")

    opi_duplicate = tiling(list_filename, overviews_dict, spatial_ref_wkt)

    print('=> DONE')

    print("Génération du graph et de l'ortho (par tuile) :")
    db_graph = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
    if db_graph is None:
        raise SystemExit("Connection to database failed")

    ortho_and_graph(overviews_dict, conn_string, spatial_ref_wkt)

    print('=> DONE')

    # Finitions

    with open(args.cache + '/overviews.json', 'w') as outfile:
        json.dump(overviews_dict, outfile)

    print("\n",
          len(list_filename) - len(opi_duplicate),
          "/",
          len(list_filename), "OPI(s) ajoutée(s)")
    if len(opi_duplicate) > 0:
        print("présence de doublons :")
        for opi_name in opi_duplicate:
            print(opi_name)


if __name__ == "__main__":
    if os.path.isdir(args.input):
        raise SystemExit("create_cache.py: error: invalid pattern: " + args.input)

    if os.path.isdir(args.cache):
        raise SystemExit("Cache (" + args.cache + ") already in use")

    if args.level:
        if len(args.level) > 2:
            raise SystemExit("create_cache.py: error: argument -l/--level:"
                             " one or two arguments expected.")
        if len(args.level) == 2 and args.level[0] > args.level[1]:
            lvl_max = args.level[0]
            args.level[0] = args.level[1]
            args.level[1] = lvl_max

    if verbose > 0:
        print("Arguments: ", args)

    main()
