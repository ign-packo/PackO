"""This script create or update a cache from a list of OPI"""
import os
import math
import xml.etree.ElementTree as ET
from pathlib import Path
import glob
import json
from random import randrange
import numpy as np
import gdal
import argparse
from collections import defaultdict
from numpy import base_repr

import multiprocessing
cpu_dispo = multiprocessing.cpu_count()

parser = argparse.ArgumentParser()
parser.add_argument("-c", "--cache", help="cache directory (default: cache)", type=str, default="cache")
parser.add_argument("-o", "--overviews", help="params for the mosaic (default: ressources/LAMB93_5cm.json)", type=str, default="ressources/LAMB93_5cm.json")
parser.add_argument("-t", "--table", help="graph table (default: graphe_pcrs56_zone_test)", type=str, default="graphe_pcrs56_zone_test")
parser.add_argument("-i", "--input", required=True, help="input OPI pattern")
parser.add_argument("-a", "--api", help="API Url (default: http://localhost:8081/wmts)", type=str, default="http://localhost:8081/wmts")
parser.add_argument("-v", "--verbose", help="verbose (default: 0)", type=int, default=0)
args = parser.parse_args()
verbose = args.verbose
if verbose > 0:
    print("Arguments: ",args)

user = os.getenv('PGUSER', default='postgres')
host = os.getenv('PGHOST', default='localhost')
database = os.getenv('PGDATABASE', default='pcrs')
password = os.getenv('PGPASSWORD', default='postgres')  # En dur, pas top...
port = os.getenv('PGPORT', default='5432')

nb_bands = 3

PNG_DRIVER = gdal.GetDriverByName('png')

def cut_opi_1tile(filename, tile_dir, image_name, origin, tileSize, tile, out_raster_srs, nb_canaux):
    """Cut and reseample a specified image at a given level"""
    if verbose > 0:
        print("~~~cut_opi_1tile")

    input_image = gdal.Open(filename)
    
    target_ds = gdal.GetDriverByName('MEM').Create('', tileSize['width'], tileSize['height'], nb_canaux, gdal.GDT_Byte)
    target_ds.SetGeoTransform((origin['x'], tile['resolution'], 0, origin['y'], 0, -tile['resolution']))
    target_ds.SetProjection(out_raster_srs)
    target_ds.FlushCache()
    opi = target_ds

    # on reech l'OPI dans cette image
    gdal.Warp(opi, input_image)

    # on export en png (todo: gerer le niveau de Q)
    dst_ds = PNG_DRIVER.CreateCopy(tile_dir +"/"+ image_name +".png", opi)
    opi = None
    dst_ds = None

    return

# def create_blank_tile(overviews, tile, nb_canaux, out_srs):
#     """Return a blank georef image for a tile."""
#     origin_x = overviews['crs']['boundingBox']['xmin'] + tile['x'] * tile['resolution'] * overviews['tileSize']['width']
#     origin_y = overviews['crs']['boundingBox']['ymax'] - tile['y'] * tile['resolution'] * overviews['tileSize']['height']
#     target_ds = gdal.GetDriverByName('MEM').Create('',
#                                                    overviews['tileSize']['width'], overviews['tileSize']['height'],
#                                                    nb_canaux, gdal.GDT_Byte)
#     target_ds.SetGeoTransform((origin_x, tile['resolution'], 0,
#                                origin_y, 0, -tile['resolution']))
#     target_ds.SetProjection(out_srs)
#     target_ds.FlushCache()
#     return target_ds

def get_image_limits(filename):
    """Return limits for a georef image"""
    if verbose > 0:
        print("~~~get_image_limits:", end='')
    src_image = gdal.Open(filename)
    geo_trans = src_image.GetGeoTransform()
    ul_x = geo_trans[0]
    ul_y = geo_trans[3]
    x_dist = geo_trans[1]
    y_dist = geo_trans[5]
    lr_x = ul_x + src_image.RasterXSize*x_dist
    lr_y = ul_y + src_image.RasterYSize*y_dist

    image_limits = {}
    image_limits['LowerCorner'] = [ ul_x, lr_y ]
    image_limits['UpperCorner'] = [ lr_x, ul_y ]

    if verbose > 0:
        print(" DONE")
    return image_limits


def get_slabbox(input_filename, overviews):
    """Get the Min/MaxSlabRow/Col for a specified image at all level"""
    if verbose > 0:
        print("~~~get_tilebox")

    slabbox = {}

    image_limits = get_image_limits(input_filename)

    if not("LowerCorner" in overviews['dataSet']['boundingBox']):
        overviews['dataSet']['boundingBox'] = image_limits
    else:
        if image_limits['LowerCorner'][0] < overviews['dataSet']['boundingBox']['LowerCorner'][0]:
            overviews['dataSet']['boundingBox']['LowerCorner'][0] = image_limits['LowerCorner'][0]
        if image_limits['LowerCorner'][1] < overviews['dataSet']['boundingBox']['LowerCorner'][1]:
            overviews['dataSet']['boundingBox']['LowerCorner'][1] = image_limits['LowerCorner'][1]
        if image_limits['UpperCorner'][0] > overviews['dataSet']['boundingBox']['UpperCorner'][0]:
            overviews['dataSet']['boundingBox']['UpperCorner'][0] = image_limits['UpperCorner'][0]
        if image_limits['UpperCorner'][1] > overviews['dataSet']['boundingBox']['UpperCorner'][1]:
            overviews['dataSet']['boundingBox']['UpperCorner'][1] = image_limits['UpperCorner'][1]

    for tile_z in range(overviews['level']['min'], overviews['level']['max'] + 1):
        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - tile_z)

        min_slab_col = math.floor(round((image_limits['LowerCorner'][0] - overviews['crs']['boundingBox']['xmin'])/
                        (resolution*overviews['tileSize']['width']*overviews['slabSize']['width']),8))
        min_slab_row = math.floor(round((overviews['crs']['boundingBox']['ymax']-image_limits['UpperCorner'][1])/
                        (resolution*overviews['tileSize']['height']*overviews['slabSize']['height']),8))
        max_slab_col = math.ceil(round((image_limits['UpperCorner'][0] - overviews['crs']['boundingBox']['xmin'])/
                        (resolution*overviews['tileSize']['width']*overviews['slabSize']['width']),8)) - 1
        max_slab_row =  math.ceil(round((overviews['crs']['boundingBox']['ymax']-image_limits['LowerCorner'][1])/
                        (resolution*overviews['tileSize']['height']*overviews['slabSize']['height']),8)) - 1

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

        if not( str(tile_z) in overviews['dataSet']['limits'] ):
            overviews['dataSet']['limits'][str(tile_z)] = {
                'MinTileCol': min_tile_col,
                'MinTileRow': min_tile_row,
                'MaxTileCol': max_tile_col,
                'MaxTileRow': max_tile_row
            }
        else:
            if min_tile_col < overviews['dataSet']['limits'][str(tile_z)]['MinTileCol']:
                overviews['dataSet']['limits'][str(tile_z)]['MinTileCol'] = min_tile_col
            if min_tile_row < overviews['dataSet']['limits'][str(tile_z)]['MinTileRow']:
                overviews['dataSet']['limits'][str(tile_z)]['MinTileRow'] = min_tile_row
            if max_tile_col > overviews['dataSet']['limits'][str(tile_z)]['MaxTileCol']:
                overviews['dataSet']['limits'][str(tile_z)]['MaxTileCol'] = max_tile_col
            if max_tile_row > overviews['dataSet']['limits'][str(tile_z)]['MaxTileRow']:
                overviews['dataSet']['limits'][str(tile_z)]['MaxTileRow'] = max_tile_row

    return slabbox

def cut_image_1arg(arguments):
    """Cut a given image in all corresponding tiles for all level"""
    if verbose > 0:
        print("~~~cut_image_1arg")

    filename = arguments['filename']
    out_srs = arguments['outSrs']
    overviews = arguments['overviews']
    slabbox = arguments['slabbox']
    nb_bands = arguments['nbBands']

    stem = Path(filename).stem
 
    # for z in tiles:
    for tile_z in range(overviews['level']['min'], overviews['level']['max'] + 1):
        print('  (',stem,') level :', tile_z)

        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - tile_z)

        for tile_x in range(slabbox[str(tile_z)]['MinSlabCol'], slabbox[str(tile_z)]['MaxSlabCol'] + 1):    
            for tile_y in range(slabbox[str(tile_z)]['MinSlabRow'], slabbox[str(tile_z)]['MaxSlabRow'] + 1):
                origin = {
                    'x': overviews['crs']['boundingBox']['xmin'] + 
                         tile_x * resolution * overviews['tileSize']['width'] * overviews['slabSize']['width'],
                    'y': overviews['crs']['boundingBox']['ymax'] - 
                         tile_y * resolution * overviews['tileSize']['height'] * overviews['slabSize']['height']
                }

                # calcul du chemin en base 36 avec la bonne profondeur
                str_x = base_repr(tile_x, 36).zfill(overviews['pathDepth'])
                str_y = base_repr(tile_y, 36).zfill(overviews['pathDepth'])
                tile_dir = args.cache+'/'+str(tile_z)
                for i in range(overviews['pathDepth']-1):
                    tile_dir += '/' + str_x[i] + str_y[i]
                # tile_dir = args.cache+'/'+str(tile_z)+'/'+str(tile_y)+'/'+str(tile_x)
                tile = {'x': tile_x, 'y': tile_y, 'resolution': resolution}

                # si necessaire on cree le dossier de la tuile             
                Path(tile_dir).mkdir(parents=True, exist_ok=True)
                dalle_size_px = {
                    'width': overviews['tileSize'].width * overviews['slabSize'].width,
                    'height': overviews['tileSize'].height * overviews['slabSize'].height
                }
                cut_opi_1tile(filename, tile_dir, str_x[i] + str_y[i] + '_' + stem, origin, dalle_size_px, tile, out_srs, nb_bands)

# def create_ortho_and_graph_1arg(arguments):
#     """Creation of the ortho and the graph images on a specified tile"""
#     if verbose > 0:
#         print("~~~create_ortho_and_graph_1arg")

#     tile = arguments['tile']
#     overviews = arguments['overviews']
#     conn_string = arguments['conn_string']
#     out_srs = arguments['out_srs']

#     tile_x = tile['x']
#     tile_y = tile['y']
#     tile_z = tile['z']

#     print("*",end='')
#     #print("  level :", str(tile_z), "- tuile", tile_x, tile_y)

#     resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - tile_z)

#     # on cree le graphe et l'ortho
#     ortho = create_blank_tile(overviews, {'x': tile_x, 'y': tile_y, 'resolution': resolution}, 3, out_srs)
#     graph = create_blank_tile(overviews, {'x': tile_x, 'y': tile_y, 'resolution': resolution}, 3, out_srs)

#     tile_dir = args.cache+'/'+str(tile_z)+'/'+str(tile_y)+'/'+str(tile_x)
#     list_filename = glob.glob(tile_dir+'/*.png')

#     is_empty = True

#     for filename in list_filename:
#         stem = Path(filename).stem

#         color = overviews["list_OPI"][stem]
        
#         # on cree une image mono canal pour la tuile
#         mask = create_blank_tile(overviews, {'x': tile_x, 'y': tile_y, 'resolution': resolution}, 3, out_srs)

#         # on rasterise la partie du graphe qui concerne ce cliche
#         db_graph = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
#         gdal.Rasterize(mask, db_graph, SQLStatement='select geom from ' + args.table + ' where cliche = \''+stem+'\' ')
#         img_mask = mask.GetRasterBand(1).ReadAsArray()
#         # si le mask est vide, on a termine
#         val_max = np.amax(img_mask)
#         if val_max > 0:
#             is_empty = False

#             opi = gdal.Open(filename)
#             for i in range(3):
#                 opi_i = opi.GetRasterBand(i+1).ReadAsArray()
#                 opi_i[(img_mask == 0)] = 0

#                 ortho_i = ortho.GetRasterBand(i+1).ReadAsArray()

#                 ortho_i[(img_mask != 0)] = 0
#                 ortho.GetRasterBand(i+1).WriteArray(np.add(opi_i, ortho_i))

#                 graph_i = graph.GetRasterBand(i+1).ReadAsArray()

#                 graph_i[(img_mask != 0)] = color[i]
#                 graph.GetRasterBand(i+1).WriteArray(graph_i)

#     if not is_empty:
#         dst_ortho = PNG_DRIVER.CreateCopy(tile_dir+"/ortho.png", ortho)
#         dst_graph = PNG_DRIVER.CreateCopy(tile_dir+"/graph.png", graph)
#         dst_ortho = None
#         dst_graph = None
#     ortho = None
#     graph = None
         
def main():
    """Create or Update the cache for list of input OPI."""
    import shutil
    import json

    if os.path.isdir(args.input):
        args.input = args.input + '\*.tif'

    if not os.path.isdir(args.cache):
        # creation dossier cache
        os.mkdir(args.cache)

    if not os.path.exists(args.cache+'/overviews.json'):
        # creation fichier overviews.json a partir d'un fichier ressource
        shutil.copy2(args.overviews, args.cache+'/overviews.json')

    with open(args.cache+'/overviews.json') as json_overviews:
        overviews_init = json.load(json_overviews)
        overviews_dict = overviews_init
    if not ("list_OPI" in overviews_dict):
        overviews_dict["list_OPI"] = {}

    if not("dataSet" in overviews_dict):
        overviews_dict['dataSet'] = {}
        overviews_dict['dataSet']['boundingBox'] = {}
        overviews_dict['dataSet']['limits'] = {}


    out_raster_srs = gdal.osr.SpatialReference()
    out_raster_srs.ImportFromEPSG(overviews_init['crs']['code'])
    out_srs = out_raster_srs.ExportToWkt()

    conn_string = "PG:host="+host+" dbname="+database+" user="+user+" password="+password

    list_filename = glob.glob(args.input)
    if verbose > 0:
        print(len(list_filename), "fichier(s) a traiter")

    try:
        with open(args.cache+'/cache_mtd.json', 'r') as inputfile:
            mtd = json.load(inputfile)
    except:
        mtd = {}

    cliche_already_calculated = []

    args_cut_image = []
    # Decoupage des images et calcul de l'emprise globale
    print("Découpe des images :")
    print(" Préparation")
    for filename in list_filename:
        cliche = Path(filename).stem
     
        if (cliche in overviews_dict['list_OPI'].keys()):
            # OPI déja traitée
            cliche_already_calculated.append(cliche)
        else:
            print('  image :', filename)
            color = [randrange(255), randrange(255), randrange(255)]
            while (color[0] in mtd) and (color[1] in mtd[color[0]]) and (color[2] in mtd[color[0]][color[1]]):
                color = [randrange(255), randrange(255), randrange(255)]
            if color[0] not in mtd:
                mtd[color[0]] = {}
            if color[1] not in mtd[color[0]]:
                mtd[color[0]][color[1]] = {}
            mtd[color[0]][color[1]][color[2]] = cliche
 
            slabbox_image = get_slabbox(filename, overviews_init)

            argument_zyx = {
                'filename': filename,
                'outSrs': out_srs,
                'overviews': overviews_init,
                'slabBox': slabbox_image,
                'nbBands': nb_bands
            }

            args_cut_image.append(argument_zyx)  

            # on ajout l'OPI traitée a la liste (avec sa couleur)
            overviews_dict["list_OPI"][cliche] = color
    
    print(" Découpage" )

    POOL = multiprocessing.Pool(cpu_dispo-1)
    POOL.map(cut_image_1arg, args_cut_image)

    POOL.close()
    POOL.join()

    print('=> DONE')
    
    print("Génération du graph et de l'ortho (par tuile) :")
    db_graph = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
    if db_graph is None:
        raise ValueError("Connection to database failed")

    args_create_ortho_and_graph = []

    print(" Préparation")
    
    # Calcul des ortho et graph
    # for level in overviews_dict["dataSet"]["limits"]:
    #     print("  level :", level)

    #     level_limits = overviews_dict["dataSet"]["limits"][level]

    #     for tile_x in range(level_limits["MinTileCol"], level_limits["MaxTileCol"] + 1):    
    #         for tile_y in range(level_limits["MinTileRow"], level_limits["MaxTileRow"] + 1):

    #             argument_zyx = {
    #                 'tile': {'x': tile_x, 'y': tile_y, 'z': int(level)},
    #                 'overviews': overviews_dict,
    #                 'conn_string': conn_string,
    #                 'out_srs': out_srs
    #             }
    #             args_create_ortho_and_graph.append(argument_zyx)

    print(" Calcul")

    POOL = multiprocessing.Pool(cpu_dispo-1)
    POOL.map(create_ortho_and_graph_1arg, args_create_ortho_and_graph)

    POOL.close()
    POOL.join()

    print('\n=> DONE')

    #Finitions
    with open(args.cache+'/cache_mtd.json', 'w') as outfile:
        json.dump(mtd, outfile)

    with open(args.cache+'/overviews.json', 'w') as outfile:
        json.dump(overviews_dict, outfile)

    print("\n", len(list_filename) - len(cliche_already_calculated),"/",len(list_filename),"OPI(s) ajoutée(s)")
    if len(cliche_already_calculated) > 0:
        print(cliche_already_calculated, "déjà traitées : OPI non recalculée(s)")

if __name__ == "__main__":
    main()