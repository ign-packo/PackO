# coding: utf-8
"""This script contains all functions for the creation and update of a cache"""

from pathlib import Path
from random import randrange
import math
import glob
import time
import numpy as np
from osgeo import gdal
from numpy import base_repr

COG_DRIVER = gdal.GetDriverByName('COG')


def get_tile_limits(filename):
    """Return tms limits for a georef image at a given level"""
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

    return tile_limits


def get_slabbox(input_filename, overviews, slab_change):
    """Get the Min/MaxTileRow/Col for a specified image at all levels"""

    slabbox = {}
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

    for slab_z in range(overviews['dataSet']['level']['min'],
                        overviews['dataSet']['level']['max'] + 1):
        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - slab_z)

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

        if str(slab_z) not in overviews['dataSet']['limits']:
            overviews['dataSet']['limits'][str(slab_z)] = {
                'MinTileCol': min_tile_col,
                'MinTileRow': min_tile_row,
                'MaxTileCol': max_tile_col,
                'MaxTileRow': max_tile_row,
            }
        else:
            overviews['dataSet']['limits'][str(slab_z)]['MinTileCol']\
                = min(min_tile_col,
                      overviews['dataSet']['limits'][str(slab_z)]['MinTileCol'])
            overviews['dataSet']['limits'][str(slab_z)]['MinTileRow']\
                = min(min_tile_row,
                      overviews['dataSet']['limits'][str(slab_z)]['MinTileRow'])
            overviews['dataSet']['limits'][str(slab_z)]['MaxTileCol']\
                = max(max_tile_col,
                      overviews['dataSet']['limits'][str(slab_z)]['MaxTileCol'])
            overviews['dataSet']['limits'][str(slab_z)]['MaxTileRow']\
                = max(max_tile_row,
                      overviews['dataSet']['limits'][str(slab_z)]['MaxTileRow'])

    min_slab_col = math.floor(round((tile_limits['LowerCorner'][0] -
                                     overviews['crs']['boundingBox']['xmin'])
                                    / (resolution * overviews['tileSize']['width']
                                    * overviews['slabSize']['width']), 8))
    min_slab_row = math.floor(round((overviews['crs']['boundingBox']['ymax'] -
                                     tile_limits['UpperCorner'][1])
                                    / (resolution * overviews['tileSize']['height']
                                    * overviews['slabSize']['height']), 8))
    max_slab_col = math.ceil(round((tile_limits['UpperCorner'][0] -
                                    overviews['crs']['boundingBox']['xmin'])
                                   / (resolution * overviews['tileSize']['width']
                                   * overviews['slabSize']['width']), 8)) - 1
    max_slab_row = math.ceil(round((overviews['crs']['boundingBox']['ymax'] -
                                    tile_limits['LowerCorner'][1])
                                   / (resolution * overviews['tileSize']['height']
                                   * overviews['slabSize']['height']), 8)) - 1
    if slab_z not in slab_change:
        slab_change[slab_z] = {}

    for slab_x in range(min_slab_col, max_slab_col + 1):
        for slab_y in range(min_slab_row, max_slab_row + 1):
            slab_change[slab_z][str(slab_x) + "_" + str(slab_y)] = True

    slabbox_z = {
        'MinSlabCol': min_slab_col,
        'MinSlabRow': min_slab_row,
        'MaxSlabCol': max_slab_col,
        'MaxSlabRow': max_slab_row
    }
    slabbox[str(slab_z)] = slabbox_z

    if str(slab_z) not in overviews['dataSet']['slabLimits']:
        overviews['dataSet']['slabLimits'][str(slab_z)] = {
            'MinSlabCol': min_slab_col,
            'MinSlabRow': min_slab_row,
            'MaxSlabCol': max_slab_col,
            'MaxSlabRow': max_slab_row
        }
    else:
        overviews['dataSet']['slabLimits'][str(slab_z)]['MinSlabCol']\
            = min(min_slab_col,
                  overviews['dataSet']['slabLimits'][str(slab_z)]['MinSlabCol'])
        overviews['dataSet']['slabLimits'][str(slab_z)]['MinSlabRow']\
            = min(min_slab_row,
                  overviews['dataSet']['slabLimits'][str(slab_z)]['MinSlabRow'])
        overviews['dataSet']['slabLimits'][str(slab_z)]['MaxSlabCol']\
            = max(max_slab_col,
                  overviews['dataSet']['slabLimits'][str(slab_z)]['MaxSlabCol'])
        overviews['dataSet']['slabLimits'][str(slab_z)]['MaxSlabRow']\
            = max(max_slab_row,
                  overviews['dataSet']['slabLimits'][str(slab_z)]['MaxSlabRow'])
    return slabbox


def new_color(image, color_dict):
    """Choose a new color [R,G,B] for an image"""
    """
    the relation color <-> image will be saved in 2 different files :
    - a dictionnary at 3 level ("R"/"G"/"B") to find the OPI name based on the 3 colors in string
        (variable color_dict saved in cache_mtd.json)
    - a dictionnary at 1 level to find the int array of colors [R,G,B] based on the OPI name
        (color saved in overviews.json under "list_OPI")
    """
    color_str = [str(randrange(255)), str(randrange(255)), str(randrange(255))]
    while (color_str[0] in color_dict)\
            and (color_str[1] in color_dict[color_str[0]])\
            and (color_str[2] in color_dict[color_str[0]][color_str[1]]):
        color_str = [str(randrange(255)), str(randrange(255)), str(randrange(255))]
    if color_str[0] not in color_dict:
        color_dict[color_str[0]] = {}
    if color_str[1] not in color_dict[color_str[0]]:
        color_dict[color_str[0]][color_str[1]] = {}

    color_dict[color_str[0]][color_str[1]][color_str[2]] = image
    return [int(color_str[0]), int(color_str[1]), int(color_str[2])]


def prep_tiling(list_filename, dir_cache, overviews, color_dict, gdal_option, verbose, reprocess):
    """Preparation for tiling images according to overviews file"""
    opi_already_calculated = []
    args_cut_image = []
    change = {}

    for filename in list_filename:
        print('  image :', filename)
        opi = Path(filename).stem
        if not reprocess and opi in overviews['list_OPI'].keys():
            print('   -> déjà calculée')
            opi_already_calculated.append(opi)
        else:
            args_cut_image.append({
                'opi': {
                    'path': filename,
                    'name': opi
                },
                'overviews': overviews,
                'slabBox': get_slabbox(filename, overviews, change),
                'cache': dir_cache,
                'gdalOption': gdal_option,
                'verbose': verbose
            })

            # on ajoute l'OPI traitée à la liste (avec sa couleur)
            overviews["list_OPI"][opi] = new_color(opi, color_dict)

    return args_cut_image, opi_already_calculated, change


def get_slab_path(slab_x, slab_y, path_depth):
    """Calcul du chemin en base 36 avec la bonne profondeur"""
    str_x = base_repr(slab_x, 36).zfill(path_depth+1)
    str_y = base_repr(slab_y, 36).zfill(path_depth+1)
    slab_path = ''
    for i in range(path_depth+1):
        slab_path += '/' + str_x[i] + str_y[i]
    return slab_path


def assert_square(obj):
    """Verify that obj is square"""
    if obj['width'] != obj['height']:
        raise ValueError("Object is not square!")


def cut_opi_1tile(opi, opi_name, dst_root, slab, gdal_option):
    """Cut and resample a specified image at a given level"""

    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   slab['size']['width'],
                                                   slab['size']['height'],
                                                   gdal_option['nbBands'],
                                                   gdal.GDT_Byte)
    target_ds.SetGeoTransform((slab['origin']['x'],
                               slab['resolution'],
                               0,
                               slab['origin']['y'],
                               0,
                               -slab['resolution']))
    target_ds.SetProjection(gdal_option['spatialRef'])
    target_ds.FlushCache()

    # on reech l'OPI dans cette image
    gdal.Warp(target_ds, opi)

    # on exporte en png (todo: gerer le niveau de Q)
    # pylint: disable=unused-variable
    assert_square(slab['tile_size'])
    dst_ds = COG_DRIVER.CreateCopy(dst_root + "_" + opi_name + ".tif",
                                   target_ds,
                                   options=["BLOCKSIZE="
                                            + str(slab['tile_size']['width']),
                                            "COMPRESS=JPEG", "LEVEL=90"])
    target_ds = None
    dst_ds = None  # noqa: F841
    # pylint: enable=unused-variable


def cut_image_1arg(arg):
    """Cut a given image in all corresponding tiles for all levels"""
    overviews = arg['overviews']
    input_image = gdal.Open(arg['opi']['path'])
    slabbox = arg['slabBox']

    # seulement pour lmax
    level = overviews['dataSet']['level']['max']
    tps1 = time.process_time()
    if arg['verbose'] == 0:
        print('  (', arg['opi']['name'], ') level : ', level, sep="")

    resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - level)

    for slab_x in range(slabbox[str(level)]['MinSlabCol'],
                        slabbox[str(level)]['MaxSlabCol'] + 1):
        for slab_y in range(slabbox[str(level)]['MinSlabRow'],
                            slabbox[str(level)]['MaxSlabRow'] + 1):
            slab_param = {
                'origin': {
                    'x': overviews['crs']['boundingBox']['xmin']
                            + slab_x * resolution * overviews['tileSize']['width']  # noqa: E131
                            * overviews['slabSize']['width'],  # noqa: E131
                    'y': overviews['crs']['boundingBox']['ymax']
                            - slab_y * resolution * overviews['tileSize']['height']  # noqa: E131
                            * overviews['slabSize']['height']  # noqa: E131
                },
                'size': {
                    'width': overviews['tileSize']['width'] * overviews['slabSize']['width'],
                    'height': overviews['tileSize']['height'] * overviews['slabSize']['height']
                },
                'resolution': resolution,
                'tile_size': {
                    'width': overviews['tileSize']['width'],
                    'height': overviews['tileSize']['height']
                }
            }

            slab_root = arg['cache'] + '/opi/' + str(level) + '/'\
                + get_slab_path(slab_x, slab_y, overviews['pathDepth'])
            # si necessaire, on cree le dossier
            Path(slab_root[:-2]).mkdir(parents=True, exist_ok=True)

            cut_opi_1tile(input_image,
                          arg['opi']['name'],
                          slab_root,
                          slab_param,
                          arg['gdalOption'])

    tps2 = time.process_time()
    if arg['verbose'] > 0:
        print('  (', arg['opi']['name'], ') level : ', level, ' in ', tps2 - tps1, sep="")


def progress_bar(nb_steps, nb_tiles, args_create_ortho_and_graph):
    """Prepare progress bar display"""
    if nb_tiles < nb_steps:
        nb_steps = nb_tiles

    print("   0" + nb_steps * "_" + "100")

    for i in range(nb_tiles):
        args_create_ortho_and_graph[i]['advancement'] = 0
        if math.floor(i % (nb_tiles / nb_steps)) == 0:
            args_create_ortho_and_graph[i]['advancement'] = 1


def prep_ortho_and_graph(dir_cache, overviews, db_option, gdal_option, change):
    """Preparation for computation of ortho and graph"""
    print(" Préparation")

    # Calcul des ortho et graph
    args_create_ortho_and_graph = []
    level = str(overviews["dataSet"]["level"]["max"])
    print("  level :", level)

    level_limits = overviews["dataSet"]["slabLimits"][level]
    resol = overviews['resolution'] * 2 ** (overviews['level']['max'] - int(level))

    for slab_x in range(level_limits["MinSlabCol"], level_limits["MaxSlabCol"] + 1):
        for slab_y in range(level_limits["MinSlabRow"], level_limits["MaxSlabRow"] + 1):

            if int(level) in change and str(slab_x) + "_" + str(slab_y) in change[int(level)] \
                    and change[int(level)][str(slab_x) + "_" + str(slab_y)]:

                args_create_ortho_and_graph.append({
                    'slab': {
                        'x': slab_x,
                        'y': slab_y,
                        'level': int(level),
                        'resolution': resol
                    },
                    'overviews': overviews,
                    'dbOption': db_option,
                    'cache': dir_cache,
                    'gdalOption':  gdal_option
                })
    return args_create_ortho_and_graph


def create_blank_slab(overviews, slab, nb_bands, spatial_ref):
    """Return a blank georef image for a slab"""
    origin_x = overviews['crs']['boundingBox']['xmin']\
        + slab['x'] * slab['resolution']\
        * overviews['tileSize']['width']\
        * overviews['slabSize']['width']
    origin_y = overviews['crs']['boundingBox']['ymax']\
        - slab['y'] * slab['resolution']\
        * overviews['tileSize']['height']\
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


def update_graph_and_ortho(filename, gdal_img, color, nb_bands):
    """Apply mask"""
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
    """Create ortho and graph on a specified slab"""

    overviews = arg['overviews']

    if arg['advancement'] != 0:
        print("█", end='', flush=True)

    # on cree le graphe et l'ortho
    img_ortho = create_blank_slab(overviews, arg['slab'],
                                  arg['gdalOption']['nbBands'], arg['gdalOption']['spatialRef'])
    img_graph = create_blank_slab(overviews, arg['slab'],
                                  arg['gdalOption']['nbBands'], arg['gdalOption']['spatialRef'])

    slab_path = get_slab_path(arg['slab']['x'], arg['slab']['y'], overviews['pathDepth'])
    slab_opi_root = arg['cache'] + '/opi/' + str(arg['slab']['level']) + '/' + slab_path
    slab_ortho = arg['cache'] + '/ortho/' + str(arg['slab']['level']) + '/' + slab_path + '.tif'
    slab_graph = arg['cache'] + '/graph/' + str(arg['slab']['level']) + '/' + slab_path + '.tif'
    is_empty = False

    for filename in glob.glob(slab_opi_root + '*.tif'):
        stem = Path(filename).stem[3:]
        if stem in overviews["list_OPI"]:
            color = overviews["list_OPI"][stem]

            # on cree une image mono canal pour la tuile
            mask = create_blank_slab(overviews, arg['slab'], 1, arg['gdalOption']['spatialRef'])

            # on rasterise la partie du graphe qui concerne ce cliche
            db_graph = gdal.OpenEx(arg['dbOption']['connString'], gdal.OF_VECTOR)
            # requete sql adaptee pour marcher avec des nomenclatures du type
            # 20FD1325x00001_02165 ou OPI_20FD1325x00001_02165
            gdal.Rasterize(mask,
                           db_graph,
                           SQLStatement='select geom from '
                           + arg['dbOption']['table']
                           + ' where cliche like \'%' + stem[-20:] + '%\'')
            img_mask = mask.GetRasterBand(1).ReadAsArray()
            # si mask est vide, on ne fait rien
            val_max = np.amax(img_mask)
            if val_max > 0:
                is_empty = False
                update_graph_and_ortho(filename,
                                       {'ortho': img_ortho, 'graph': img_graph, 'mask': img_mask},
                                       color,
                                       arg['gdalOption']['nbBands'])

    if not is_empty:
        # si necessaire on cree les dossiers de tuile pour le graph et l'ortho
        Path(slab_graph).parent.mkdir(parents=True, exist_ok=True)
        Path(slab_ortho).parent.mkdir(parents=True, exist_ok=True)
        # pylint: disable=unused-variable
        assert_square(overviews['tileSize'])
        dst_ortho = COG_DRIVER.CreateCopy(slab_ortho, img_ortho,
                                          options=["BLOCKSIZE="
                                                   + str(overviews['tileSize']['width']),
                                                   "COMPRESS=JPEG", "LEVEL=90"])
        dst_graph = COG_DRIVER.CreateCopy(slab_graph, img_graph,
                                          options=["BLOCKSIZE="
                                                   + str(overviews['tileSize']['width']),
                                                   "COMPRESS=LZW"])
        dst_ortho = None  # noqa: F841
        dst_graph = None  # noqa: F841
        # pylint: enable=unused-variable
    img_ortho = None
    img_graph = None
