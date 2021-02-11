# coding: utf-8
"""This script contains all functions for the creation and update of a cache"""

from pathlib import Path
from random import randrange
import math
import glob
import gdal
import numpy as np
from numpy import base_repr

PNG_DRIVER = gdal.GetDriverByName('png')


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


def get_tilebox(input_filename, overviews, tile_change):
    """Get the Min/MaxTileRow/Col for a specified image at all levels"""

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

    for tile_z in range(overviews['dataSet']['level']['min'],
                        overviews['dataSet']['level']['max'] + 1):
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

        if tile_z not in tile_change:
            tile_change[tile_z] = {}

        for tile_x in range(min_tile_col, max_tile_col + 1):
            for tile_y in range(min_tile_row, max_tile_row + 1):
                tile_change[tile_z][str(tile_x) + "_" + str(tile_y)] = True

    return tilebox


def new_color(image, color_dict):
    """Choose a new color for an image"""

    color = [randrange(255), randrange(255), randrange(255)]
    while (color[0] in color_dict)\
            and (color[1] in color_dict[color[0]])\
            and (color[2] in color_dict[color[0]][color[1]]):
        color = [randrange(255), randrange(255), randrange(255)]
    if color[0] not in color_dict:
        color_dict[color[0]] = {}
    if color[1] not in color_dict[color[0]]:
        color_dict[color[0]][color[1]] = {}

    color_dict[color[0]][color[1]][color[2]] = image
    return color


def prep_tiling(list_filename, dir_cache, overviews, color_dict, gdal_option):
    """Preparation for tiling images according to overviews file"""
    opi_already_calculated = []
    args_cut_image = []

    change = {}

    for filename in list_filename:
        opi = Path(filename).stem
        if opi in overviews['list_OPI'].keys():
            # OPI déjà traitée
            opi_already_calculated.append(opi)
        else:
            print('  image :', filename)

            args_cut_image.append({
                'opi': {
                    'path': filename,
                    'name': opi
                },
                'overviews': overviews,
                'tileBox': get_tilebox(filename, overviews, change),
                'cache': dir_cache,
                'gdalOption': gdal_option
            })

            # on ajoute l'OPI traitée à la liste (avec sa couleur)
            overviews["list_OPI"][opi] = new_color(opi, color_dict)

    return args_cut_image, opi_already_calculated, change


def get_tile_path(tile_x, tile_y, path_depth):
    """Calcul du chemin en base 36 avec la bonne profondeur"""
    str_x = base_repr(tile_x, 36).zfill(path_depth+1)
    str_y = base_repr(tile_y, 36).zfill(path_depth+1)
    tile_path = ''
    for i in range(path_depth+1):
        tile_path += '/' + str_x[i] + str_y[i]
    return tile_path


def cut_opi_1tile(opi, opi_name, dst_root, tile, gdal_option):
    """Cut and resample a specified image at a given level"""

    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   tile['size']['width'],
                                                   tile['size']['height'],
                                                   gdal_option['nbBands'],
                                                   gdal.GDT_Byte)
    target_ds.SetGeoTransform((tile['origin']['x'],
                               tile['resolution'],
                               0,
                               tile['origin']['y'],
                               0,
                               -tile['resolution']))
    target_ds.SetProjection(gdal_option['spatialRef'])
    target_ds.FlushCache()

    # on reech l'OPI dans cette image
    gdal.Warp(target_ds, opi)

    # on exporte en png (todo: gerer le niveau de Q)
    # pylint: disable=unused-variable
    dst_ds = PNG_DRIVER.CreateCopy(dst_root + "_" + opi_name + ".png", target_ds)
    target_ds = None
    dst_ds = None  # noqa: F841
    # pylint: enable=unused-variable


def cut_image_1arg(arg):
    """Cut a given image in all corresponding tiles for all levels"""
    overviews = arg['overviews']
    tilebox = arg['tileBox']
    input_image = gdal.Open(arg['opi']['path'])

    for level in range(overviews['dataSet']['level']['min'],
                       overviews['dataSet']['level']['max'] + 1):
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

                tile_root = arg['cache'] + '/opi/' + str(level) + '/'\
                    + get_tile_path(tile_x, tile_y, overviews['pathDepth'])
                # tile_dir = arg['cache'] + '/' + str(level) + '/' + str(tile_y) + '/' + str(tile_x)
                # si necessaire on cree le dossier de la tuile
                Path(tile_root[:-2]).mkdir(parents=True, exist_ok=True)

                cut_opi_1tile(input_image,
                              arg['opi']['name'],
                              tile_root,
                              tile_param,
                              arg['gdalOption'])


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
    for level in overviews["dataSet"]["limits"]:
        print("  level :", level)

        level_limits = overviews["dataSet"]["limits"][level]
        resol = overviews['resolution'] * 2 ** (overviews['level']['max'] - int(level))

        for tile_x in range(level_limits["MinTileCol"], level_limits["MaxTileCol"] + 1):
            for tile_y in range(level_limits["MinTileRow"], level_limits["MaxTileRow"] + 1):

                if int(level) in change and str(tile_x) + "_" + str(tile_y) in change[int(level)] \
                        and change[int(level)][str(tile_x) + "_" + str(tile_y)]:

                    args_create_ortho_and_graph.append({
                        'tile': {
                            'x': tile_x,
                            'y': tile_y,
                            'level': int(level),
                            'resolution': resol
                        },
                        'overviews': overviews,
                        'dbOption': db_option,
                        'cache': dir_cache,
                        'gdalOption':  gdal_option
                    })

    print(" Calcul")
    nb_tiles = len(args_create_ortho_and_graph)
    print(" ", nb_tiles, "tuiles à traiter")
    progress_bar(50, nb_tiles, args_create_ortho_and_graph)

    return args_create_ortho_and_graph


def create_blank_tile(overviews, tile, nb_bands, spatial_ref):
    """Return a blank georef image for a tile"""
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
    """Create ortho and graph on a specified tile"""

    overviews = arg['overviews']

    if arg['advancement'] != 0:
        print("█", end='', flush=True)

    # on cree le graphe et l'ortho
    img_ortho = create_blank_tile(overviews, arg['tile'],
                                  arg['gdalOption']['nbBands'], arg['gdalOption']['spatialRef'])
    img_graph = create_blank_tile(overviews, arg['tile'],
                                  arg['gdalOption']['nbBands'], arg['gdalOption']['spatialRef'])

    tile_path = get_tile_path(arg['tile']['x'], arg['tile']['y'], overviews['pathDepth'])
    tile_opi_root = arg['cache'] + '/opi/' + str(arg['tile']['level']) + '/' + tile_path
    tile_ortho = arg['cache'] + '/ortho/' + str(arg['tile']['level']) + '/' + tile_path + '.png'
    tile_graph = arg['cache'] + '/graph/' + str(arg['tile']['level']) + '/' + tile_path + '.png'

    # tile_dir = arg['cache'] + \
    #     '/' + str(arg['tile']['level']) + \
    #     '/' + str(arg['tile']['y']) + \
    #     '/' + str(arg['tile']['x'])

    is_empty = True

    for filename in glob.glob(tile_opi_root + '*.png'):
        stem = Path(filename).stem[3:]
        if stem in overviews["list_OPI"]:
            color = overviews["list_OPI"][stem]

            # on cree une image mono canal pour la tuile
            mask = create_blank_tile(overviews, arg['tile'], 3, arg['gdalOption']['spatialRef'])

            # on rasterise la partie du graphe qui concerne ce cliche
            db_graph = gdal.OpenEx(arg['dbOption']['connString'], gdal.OF_VECTOR)
            gdal.Rasterize(mask,
                           db_graph,
                           SQLStatement='select geom from '
                           + arg['dbOption']['table'] + ' where cliche = \'' + stem + '\' ')
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
        Path(tile_graph).parent.mkdir(parents=True, exist_ok=True)
        Path(tile_ortho).parent.mkdir(parents=True, exist_ok=True)
        # pylint: disable=unused-variable
        dst_ortho = PNG_DRIVER.CreateCopy(tile_ortho, img_ortho)
        dst_graph = PNG_DRIVER.CreateCopy(tile_graph, img_graph)
        dst_ortho = None  # noqa: F841
        dst_graph = None  # noqa: F841
        # pylint: enable=unused-variable
    img_ortho = None
    img_graph = None
