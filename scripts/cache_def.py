# coding: utf-8
"""This script contains all functions for the creation and update of a cache"""

from pathlib import Path
from random import randrange
import os
import math
import glob
import time
import numpy as np
from numpy import base_repr
from osgeo import gdal

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


def get_slabdepth(slab_size):
    """Get the number of levels per COG"""
    slab_size = min(slab_size['width'], slab_size['height'])
    return math.floor(math.log(slab_size, 2)) + 1


def get_slabbox(filename, overviews):
    """Get the Min/MaxTileRow/Col at all levels"""
    nb_level_cog = get_slabdepth(overviews['slabSize'])
    slabbox = {}
    tile_limits = get_tile_limits(filename)

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
            = max(tile_limits['UpperCorner'][0],
                  overviews['dataSet']['boundingBox']['UpperCorner'][0])
        overviews['dataSet']['boundingBox']['UpperCorner'][1]\
            = max(tile_limits['UpperCorner'][1],
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

        if slab_z % nb_level_cog == overviews['dataSet']['level']['max'] % nb_level_cog:

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


def cut_opi_1tile(opi, opi_name, dst_root, slab, nb_bands, gdal_option):
    """Cut and resample a specified image at a given level"""
    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   slab['size']['width'],
                                                   slab['size']['height'],
                                                   nb_bands,
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
                                            "COMPRESS=JPEG", "QUALITY=90"])
    target_ds = None
    dst_ds = None  # noqa: F841
    # pylint: enable=unused-variable


def cut_image_1arg(arg):
    """Cut a given image in all corresponding tiles for all levels"""
    overviews = arg['overviews']
    input_image_rgb = None
    if arg['opi']['rgb']:
        input_image_rgb = gdal.Open(arg['opi']['rgb'])
    input_image_ir = None
    if arg['opi']['ir']:
        input_image_ir = gdal.Open(arg['opi']['ir'])
    slabbox = arg['slabBox']

    for level in overviews['dataSet']['slabLimits'].keys():
        level = int(level)
        tps1_actif = time.process_time()
        tps1 = time.perf_counter()
        if arg['verbose'] == 0:
            if arg['opi']['rgb'] is not None:
                print('  (', arg['opi']['name_rgb'], ') level : ', level, sep="")
            else:
                print('  (', arg['opi']['name_ir'], ') level : ', level, sep="")

        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - level)

        for slab_x in range(slabbox[str(level)]['MinSlabCol'],
                            slabbox[str(level)]['MaxSlabCol'] + 1):
            for slab_y in range(slabbox[str(level)]['MinSlabRow'],
                                slabbox[str(level)]['MaxSlabRow'] + 1):
                slab_param = {
                    'origin': {
                        'x':
                            overviews['crs']['boundingBox']['xmin']
                            + slab_x * resolution * overviews['tileSize']['width']  # noqa: E131
                            * overviews['slabSize']['width'],  # noqa: E131
                        'y':
                            overviews['crs']['boundingBox']['ymax']
                            - slab_y * resolution * overviews['tileSize']['height']
                            * overviews['slabSize']['height']
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

                if input_image_rgb:
                    cut_opi_1tile(input_image_rgb,
                                  arg['opi']['name_rgb'],
                                  slab_root,
                                  slab_param,
                                  3,
                                  arg['gdalOption'])
                if input_image_ir:
                    cut_opi_1tile(input_image_ir,
                                  arg['opi']['name_ir'],
                                  slab_root,
                                  slab_param,
                                  1,
                                  arg['gdalOption'])

        tps2_actif = time.process_time()
        tps2 = time.perf_counter()
        if arg['verbose'] > 0:
            print('  (', arg['opi']['name_rgb'], ') level : ', level, ' in ', tps2 - tps1,
                  ' (', tps2_actif - tps1_actif, ')', sep="")


def display_bar(current, nb_total, width=50):
    if not nb_total > 0:
        return
    width_per_step = width/nb_total
    width_done = int(current*width_per_step)
    print("\r |" + width_done*'#' + (width-width_done)*'-'+'|', end="", flush=True)
    if current == nb_total:
        print()


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


def update_graph_and_ortho(filename_rgb, filename_ir, gdal_img, color):
    """Apply mask"""
    for i in range(3):
        graph_i = gdal_img['graph'].GetRasterBand(i + 1).ReadAsArray()

        graph_i[(gdal_img['mask'] != 0)] = color[i]
        gdal_img['graph'].GetRasterBand(i + 1).WriteArray(graph_i)
    if filename_rgb:
        opi = gdal.Open(filename_rgb)
        for i in range(3):
            opi_i = opi.GetRasterBand(i + 1).ReadAsArray()
            opi_i[(gdal_img['mask'] == 0)] = 0

            ortho_i = gdal_img['ortho_rgb'].GetRasterBand(i + 1).ReadAsArray()

            ortho_i[(gdal_img['mask'] != 0)] = 0
            gdal_img['ortho_rgb'].GetRasterBand(i + 1).WriteArray(np.add(opi_i, ortho_i))
    if filename_ir:
        opi = gdal.Open(filename_ir)
        for i in range(1):
            opi_i = opi.GetRasterBand(i + 1).ReadAsArray()
            opi_i[(gdal_img['mask'] == 0)] = 0

            ortho_i = gdal_img['ortho_ir'].GetRasterBand(i + 1).ReadAsArray()

            ortho_i[(gdal_img['mask'] != 0)] = 0
            gdal_img['ortho_ir'].GetRasterBand(i + 1).WriteArray(np.add(opi_i, ortho_i))


def create_ortho_and_graph_1arg(arg):
    """Create ortho and graph on a specified slab"""

    overviews = arg['overviews']

    # on cree le graphe et l'ortho
    first_opi = list(overviews["list_OPI"].values())[0]
    with_rgb = first_opi['with_rgb']
    with_ir = first_opi['with_ir']
    img_ortho_rgb = None
    if with_rgb:
        img_ortho_rgb = create_blank_slab(overviews, arg['slab'],
                                          3, arg['gdalOption']['spatialRef'])
    img_ortho_ir = None
    if with_ir:
        img_ortho_ir = create_blank_slab(overviews, arg['slab'],
                                         1, arg['gdalOption']['spatialRef'])
    img_graph = create_blank_slab(overviews, arg['slab'],
                                  3, arg['gdalOption']['spatialRef'])

    slab_path = get_slab_path(arg['slab']['x'], arg['slab']['y'], overviews['pathDepth'])
    slab_opi_root = arg['cache'] + '/opi/' + str(arg['slab']['level']) + '/' + slab_path
    slab_ortho_rgb = arg['cache'] + '/ortho/' + str(arg['slab']['level']) + '/' + slab_path + '.tif'
    slab_ortho_ir = arg['cache'] + '/ortho/' + str(arg['slab']['level']) + '/' + slab_path + 'i.tif'
    slab_graph = arg['cache'] + '/graph/' + str(arg['slab']['level']) + '/' + slab_path + '.tif'
    is_empty = True

    for filename in glob.glob(slab_opi_root + '*.tif'):
        stem = Path(filename).stem[3:]
        if stem in overviews["list_OPI"]:
            color = overviews["list_OPI"][stem]["color"]
            filename_rgb = filename
            filename_ir = None
            if not with_rgb:
                filename_ir = filename
                filename_rgb = None
            elif with_ir:
                filename_ir = os.path.join(os.path.dirname(filename),
                                           os.path.basename(filename.replace('x', '_ix')))

            # on cree une image mono canal pour la tuile
            mask = create_blank_slab(overviews, arg['slab'], 1, arg['gdalOption']['spatialRef'])

            # on rasterise la partie du graphe qui concerne ce cliche
            db_graph = gdal.OpenEx(arg['dbOption']['connString'], gdal.OF_VECTOR)
            # requete sql adaptee pour marcher avec des nomenclatures du type
            # 20FD1325x00001_02165 ou OPI_20FD1325x00001_02165
            # attention, le graph contient peut-etre des reférences aux images RGB
            # alors que les fichiers sont peut-être des IR
            stem_cleaned1 = stem.replace("OPI_", "")
            stem_cleaned2 = stem.replace("OPI_", "").replace("_ix", "x")
            gdal.Rasterize(mask,
                           db_graph,
                           SQLStatement='select geom from '
                           + arg['dbOption']['table']
                           + ' where cliche like \'%' + stem_cleaned1 + '%\''
                           + ' or cliche like \'%' + stem_cleaned2 + '%\'')
            img_mask = mask.GetRasterBand(1).ReadAsArray()
            # si mask est vide, on ne fait rien
            val_max = np.amax(img_mask)
            if val_max > 0:
                is_empty = False
                update_graph_and_ortho(filename_rgb,
                                       filename_ir,
                                       {'ortho_rgb': img_ortho_rgb,
                                        'ortho_ir': img_ortho_ir,
                                        'graph': img_graph,
                                        'mask': img_mask},
                                       color)

    if not is_empty:
        # si necessaire on cree les dossiers de tuile pour le graph et l'ortho
        Path(slab_graph).parent.mkdir(parents=True, exist_ok=True)
        Path(slab_ortho_rgb).parent.mkdir(parents=True, exist_ok=True)
        Path(slab_ortho_ir).parent.mkdir(parents=True, exist_ok=True)
        # pylint: disable=unused-variable
        assert_square(overviews['tileSize'])

        if img_ortho_rgb:
            dst_ortho_rgb = COG_DRIVER.CreateCopy(slab_ortho_rgb, img_ortho_rgb,
                                                  options=["BLOCKSIZE="
                                                           + str(overviews['tileSize']['width']),
                                                           "COMPRESS=JPEG", "QUALITY=90"])
            dst_ortho_rgb = None  # noqa: F841
        if img_ortho_ir:
            dst_ortho_ir = COG_DRIVER.CreateCopy(slab_ortho_ir, img_ortho_ir,
                                                 options=["BLOCKSIZE="
                                                          + str(overviews['tileSize']['width']),
                                                          "COMPRESS=JPEG", "QUALITY=90"])
            dst_ortho_ir = None  # noqa: F841
        dst_graph = COG_DRIVER.CreateCopy(slab_graph, img_graph,
                                          options=["BLOCKSIZE="
                                                   + str(overviews['tileSize']['width']),
                                                   "COMPRESS=LZW", "PREDICTOR=YES"])

        dst_graph = None  # noqa: F841
        # pylint: enable=unused-variable
    if img_ortho_rgb:
        img_ortho_rgb = None
    if img_ortho_ir:
        img_ortho_ir = None
    img_graph = None
