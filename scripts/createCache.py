# coding: utf-8

"""This script create or update a cache from a list of OPI"""
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
from numpy import base_repr

cpu_dispo = multiprocessing.cpu_count()

parser = argparse.ArgumentParser()
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
parser.add_argument("-i", "--input",
                    required=True,
                    help="input OPI pattern")
parser.add_argument("-a", "--api",
                    help="API Url (default: http://localhost:8081/wmts)",
                    type=str,
                    default="http://localhost:8081/wmts")
parser.add_argument("-v", "--verbose",
                    help="verbose (default: 0)",
                    type=int,
                    default=0)
args = parser.parse_args()

verbose = args.verbose
if verbose > 0:
    print("Arguments: ", args)

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
    dst_ds = PNG_DRIVER.CreateCopy(dst_dir + "_" + opi['name'] + ".png", target_ds)
    target_ds = None
    dst_ds = None  # noqa: F841
    # pylint: enable=unused-variable


def create_blank_slab(overviews, slab, nb_bands, spatial_ref):
    """Return a blank georef image for a tile."""
    origin_x = overviews['crs']['boundingBox']['xmin']\
        + slab['x'] * slab['resolution'] * overviews['tileSize']['width']\
        * overviews['slabSize']['width']
    origin_y = overviews['crs']['boundingBox']['ymax']\
        - slab['y'] * slab['resolution'] * overviews['tileSize']['height']\
        * overviews['slabSize']['height']
    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   overviews['tileSize']['width']
                                                   * overviews['slabSize']['width'],
                                                   overviews['tileSize']['height']
                                                   * overviews['slabSize']['height'],
                                                   nb_bands,
                                                   gdal.GDT_Byte)
    target_ds.SetGeoTransform((origin_x, slab['resolution'], 0,
                               origin_y, 0, -slab['resolution']))
    target_ds.SetProjection(spatial_ref)
    target_ds.FlushCache()
    return target_ds


def get_image_limits(filename):
    """Return tms limits for a georef image at a given level"""
    if verbose > 0:
        print("~~~get_image_limits:", end='')
    src_image = gdal.Open(filename)
    geo_trans = src_image.GetGeoTransform()
    ul_x = geo_trans[0]
    ul_y = geo_trans[3]
    x_dist = geo_trans[1]
    y_dist = geo_trans[5]
    lr_x = ul_x + src_image.RasterXSize * x_dist
    lr_y = ul_y + src_image.RasterYSize * y_dist

    image_limits = {}
    image_limits['LowerCorner'] = [ul_x, lr_y]
    image_limits['UpperCorner'] = [lr_x, ul_y]

    if verbose > 0:
        print(" DONE")
    return image_limits


def get_slabbox(input_filename, overviews):
    """Get the Min/MaxTileRow/Col for a specified image at all level"""
    if verbose > 0:
        print("~~~get_slabbox")

    slabbox = {}

    image_limits = get_image_limits(input_filename)

    if "LowerCorner" not in overviews['dataSet']['boundingBox']:
        overviews['dataSet']['boundingBox'] = image_limits
    else:
        overviews['dataSet']['boundingBox']['LowerCorner'][0]\
            = min(image_limits['LowerCorner'][0],
                  overviews['dataSet']['boundingBox']['LowerCorner'][0])
        overviews['dataSet']['boundingBox']['LowerCorner'][1]\
            = min(image_limits['LowerCorner'][1],
                  overviews['dataSet']['boundingBox']['LowerCorner'][1])
        overviews['dataSet']['boundingBox']['UpperCorner'][0]\
            = max(image_limits['LowerCorner'][0],
                  overviews['dataSet']['boundingBox']['UpperCorner'][0])
        overviews['dataSet']['boundingBox']['UpperCorner'][1]\
            = max(image_limits['LowerCorner'][1],
                  overviews['dataSet']['boundingBox']['UpperCorner'][1])

    for tile_z in range(overviews['level']['min'], overviews['level']['max'] + 1):
        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - tile_z)

        min_slab_col = math.floor(round((image_limits['LowerCorner'][0] -
                                         overviews['crs']['boundingBox']['xmin'])
                                        / (resolution * overviews['tileSize']['width'] *
                                           overviews['slabSize']['width']), 8))
        min_slab_row = math.floor(round((overviews['crs']['boundingBox']['ymax'] -
                                         image_limits['UpperCorner'][1])
                                        / (resolution * overviews['tileSize']['height'] *
                                           overviews['slabSize']['height']), 8))
        max_slab_col = math.ceil(round((image_limits['UpperCorner'][0] -
                                        overviews['crs']['boundingBox']['xmin'])
                                       / (resolution * overviews['tileSize']['width'] *
                                          overviews['slabSize']['width']), 8)) - 1
        max_slab_row = math.ceil(round((overviews['crs']['boundingBox']['ymax'] -
                                        image_limits['LowerCorner'][1])
                                       / (resolution * overviews['tileSize']['height'] *
                                          overviews['slabSize']['height']), 8)) - 1

        slabbox_z = {
            'MinSlabCol': min_slab_col,
            'MinSlabRow': min_slab_row,
            'MaxSlabCol': max_slab_col,
            'MaxSlabRow': max_slab_row
        }
        slabbox[str(tile_z)] = slabbox_z

        min_tile_col = min_slab_col * overviews['slabSize']['width']
        max_tile_col = max_slab_col * overviews['slabSize']['width']
        min_tile_row = min_slab_row * overviews['slabSize']['height']
        max_tile_row = max_slab_row * overviews['slabSize']['height']

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
    return slabbox


def get_slab_path(slab_x, slab_y, level, path_depth):
    """Calcul du chemin en base 36 avec la bonne profondeur"""
    str_x = base_repr(slab_x, 36).zfill(path_depth)
    str_y = base_repr(slab_y, 36).zfill(path_depth)
    slab_path = str(level)
    for i in range(path_depth):
        slab_path += '/' + str_x[i] + str_y[i]
    return slab_path


def cut_image_1arg(arg):
    """Cut a given image in all corresponding tiles for all level"""
    if verbose > 0:
        print("~~~cut_image_1arg")

    overviews = arg['overviews']
    slabbox = arg['slabBox']

    # for z in tiles:
    for level in range(overviews['level']['min'], overviews['level']['max'] + 1):
        print('  (', arg['opi']['name'], ') level : ', level, sep="")

        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - level)

        for slab_x in range(slabbox[str(level)]['MinSlabCol'],
                            slabbox[str(level)]['MaxSlabCol'] + 1):
            for slab_y in range(slabbox[str(level)]['MinSlabRow'],
                                slabbox[str(level)]['MaxSlabRow'] + 1):
                slab_param = {
                    'origin': {
                        'x': overviews['crs']['boundingBox']['xmin']
                             + slab_x * resolution  # noqa: E131
                             * overviews['tileSize']['width']  # noqa: E131
                             * overviews['slabSize']['width'],  # noqa: E131
                        'y': overviews['crs']['boundingBox']['ymax']
                             - slab_y * resolution  # noqa: E131
                             * overviews['tileSize']['height']  # noqa: E131
                             * overviews['slabSize']['height']  # noqa: E131
                    },
                    'size': {
                        'width': overviews['tileSize']['width']
                                 * overviews['slabSize']['width'],  # noqa: E131
                        'height': overviews['tileSize']['height']
                                  * overviews['slabSize']['height']  # noqa: E131
                    },
                    'resolution': resolution
                }

                slab_path = args.cache + '/' + get_slab_path(slab_x, slab_y, level,
                                                             overviews['pathDepth'])

                # si necessaire on cree le dossier de la tuile
                Path(slab_path).parent.mkdir(parents=True, exist_ok=True)

                cut_opi_1tile(arg['opi'],
                              slab_path,
                              slab_param,
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
    img_ortho = create_blank_slab(overviews, arg['slab'], 3, arg['spatialRef'])
    img_graph = create_blank_slab(overviews, arg['slab'], 3, arg['spatialRef'])

    slab_path = args.cache + '/' + get_slab_path(arg['slab']['x'],
                                                 arg['slab']['y'],
                                                 arg['slab']['level'],
                                                 overviews['pathDepth'])

    is_empty = True

    for filename in glob.glob(slab_path + '_*.png'):
        stem = Path(filename).stem[3:]
        color = overviews["list_OPI"][stem]

        # on cree une image mono canal pour la tuile
        mask = create_blank_slab(overviews, arg['slab'], 3, arg['spatialRef'])

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
        dst_ortho = PNG_DRIVER.CreateCopy(slab_path + "_ortho.png", img_ortho)
        dst_graph = PNG_DRIVER.CreateCopy(slab_path + "_graph.png", img_graph)
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
                'slabBox': get_slabbox(filename, overviews),
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

        for slab_x in range(int(level_limits["MinTileCol"] / overviews['slabSize']['width']),
                            int(level_limits["MaxTileCol"] / overviews['slabSize']['width']) + 1):
            for slab_y in range(int(level_limits["MinTileRow"] / overviews['slabSize']['height']),
                                int(level_limits["MaxTileRow"] / overviews['slabSize']['height'])
                                + 1):

                args_create_ortho_and_graph.append({
                    'slab': {'x': slab_x, 'y': slab_y, 'level': int(level), 'resolution': resol},
                    'overviews': overviews,
                    'conn_string': conn_string,
                    'spatialRef': spatial_ref_wkt,
                    'nbBands': NB_BANDS
                })

    print(" Calcul")
    nb_slabs = len(args_create_ortho_and_graph)
    print(" ", nb_slabs, "dalles à traiter")

    progress_bar(50, nb_slabs, args_create_ortho_and_graph)
    print('   |', end='', flush=True)
    pool = multiprocessing.Pool(cpu_dispo - 1)
    pool.map(create_ortho_and_graph_1arg, args_create_ortho_and_graph)

    pool.close()
    pool.join()
    print("|")


def main():
    """Create or Update the cache for list of input OPI."""

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

    # Decoupage des images et calcul de l'emprise globale
    print("Découpe des images :")
    print("", len(list_filename), "image(s) à traiter")

    opi_already_calculated = tiling(list_filename, overviews_dict, spatial_ref_wkt)

    print('=> DONE')

    print("Génération du graph et de l'ortho (par tuile) :")
    db_graph = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
    if db_graph is None:
        raise SystemExit("Connection to database failed")

    ortho_and_graph(overviews_dict, conn_string, spatial_ref_wkt)

    print('=> DONE')

    # Finitions
    # with open(args.cache + '/cache_mtd.json', 'w') as outfile:
    #     json.dump(mtd, outfile)

    with open(args.cache + '/overviews.json', 'w') as outfile:
        json.dump(overviews_dict, outfile)

    print("\n",
          len(list_filename) - len(opi_already_calculated),
          "/",
          len(list_filename), "OPI(s) ajoutée(s)")
    if len(opi_already_calculated) > 0:
        print(opi_already_calculated, "déjà traitées : OPI non recalculée(s)")


if __name__ == "__main__":
    if os.path.isdir(args.input):
        raise SystemExit("create_cache.py: error: invalid pattern: " + args.input)

    if os.path.isdir(args.cache):
        raise SystemExit("Cache (" + args.cache + ") already in use")
    main()
