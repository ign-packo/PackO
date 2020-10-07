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

parser = argparse.ArgumentParser()
parser.add_argument("-c", "--cache", help="cache directory (default: cache)", type=str, default="cache")
parser.add_argument("-o", "--overviews", help="params for the mosaic (default: ressources/LAMB93_5cm.json)", type=str, default="ressources/LAMB93_5cm.json")
parser.add_argument("-t", "--table", help="graph table (default: graphe_pcrs56_zone_test)", type=str, default="graphe_pcrs56_zone_test")
parser.add_argument("-i", "--input", required=True, help="input OPI pattern")
parser.add_argument("-p", "--prefix", required=True, help="OPI prefix pour créer le pattern de recherche dans le cache (pour le GetCapabilities)")
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

PNG_DRIVER = gdal.GetDriverByName('png')

def create_blank_tile(overviews, tile, nb_canaux, out_raster_srs):
    """Return a blank georef image for a tile."""
    origin_x = overviews['crs']['boundingBox']['xmin'] + tile['x'] * tile['resolution'] * overviews['tileSize']['width']
    origin_y = overviews['crs']['boundingBox']['ymax'] - tile['y'] * tile['resolution'] * overviews['tileSize']['height']
    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   overviews['tileSize']['width'], overviews['tileSize']['height'],
                                                   nb_canaux, gdal.GDT_Byte)
    target_ds.SetGeoTransform((origin_x, tile['resolution'], 0,
                               origin_y, 0, -tile['resolution']))
    target_ds.SetProjection(out_raster_srs.ExportToWkt())
    target_ds.FlushCache()
    return target_ds

def get_tile_limits( filename):
    """Return tms limits for a georef image at a given level"""
    if verbose > 0:
        print("~~~get_tile_limits:", end='')
    src_image = gdal.Open(filename)
    geo_trans = src_image.GetGeoTransform()
    ul_x = geo_trans[0]
    ul_y = geo_trans[3]
    x_dist = geo_trans[1]
    y_dist = geo_trans[5]
    lr_x = ul_x + src_image.RasterXSize*x_dist
    lr_y = ul_y + src_image.RasterYSize*y_dist

    tile_limits = {}
    tile_limits['LowerCorner'] = [ ul_x, lr_y ]
    tile_limits['UpperCorner'] = [ lr_x, ul_y ]

    if verbose > 0:
        print(" DONE")
    return tile_limits

def process_image(overviews, db_graph, input_filename, color, out_raster_srs):
    """Update the cache for an input OPI."""
    if verbose > 0:
        print("~~~process_image")
    input_image = gdal.Open(input_filename)
    stem = Path(input_filename).stem
    if not("dataSet" in overviews):
        overviews['dataSet'] = {}
        overviews['dataSet']['boundingBox'] = {}
        overviews['dataSet']['limits'] = {}

    tile_limits = get_tile_limits(input_filename)

    if not("LowerCorner" in overviews['dataSet']['boundingBox']):
        overviews['dataSet']['boundingBox'] = tile_limits
    else:
        if tile_limits['LowerCorner'][0] < overviews['dataSet']['boundingBox']['LowerCorner'][0]:
            overviews['dataSet']['boundingBox']['LowerCorner'][0] = tile_limits['LowerCorner'][0]
        if tile_limits['LowerCorner'][1] < overviews['dataSet']['boundingBox']['LowerCorner'][1]:
            overviews['dataSet']['boundingBox']['LowerCorner'][1] = tile_limits['LowerCorner'][1]
        if tile_limits['UpperCorner'][0] > overviews['dataSet']['boundingBox']['UpperCorner'][0]:
            overviews['dataSet']['boundingBox']['UpperCorner'][0] = tile_limits['UpperCorner'][0]
        if tile_limits['UpperCorner'][1] > overviews['dataSet']['boundingBox']['UpperCorner'][1]:
            overviews['dataSet']['boundingBox']['UpperCorner'][1] = tile_limits['UpperCorner'][1]

    # for z in tiles:
    for tile_z in range(overviews['level']['min'], overviews['level']['max'] + 1):
        print('Niveau de zoom : ', tile_z)

        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - tile_z)

        MinTileCol = \
            math.floor(round((tile_limits['LowerCorner'][0] - overviews['crs']['boundingBox']['xmin'])/(resolution*overviews['tileSize']['width']),8))
        MinTileRow = \
            math.floor(round((overviews['crs']['boundingBox']['ymax']-tile_limits['UpperCorner'][1])/(resolution*overviews['tileSize']['height']),8))
        MaxTileCol = \
            math.ceil(round((tile_limits['UpperCorner'][0] - overviews['crs']['boundingBox']['xmin'])/(resolution*overviews['tileSize']['width']),8)) - 1
        MaxTileRow = \
            math.ceil(round((overviews['crs']['boundingBox']['ymax']-tile_limits['LowerCorner'][1])/(resolution*overviews['tileSize']['height']),8)) - 1

        if not( str(tile_z) in overviews['dataSet']['limits'] ):
            overviews['dataSet']['limits'][str(tile_z)] = {
                'MinTileCol': MinTileCol,
                'MinTileRow': MinTileRow,
                'MaxTileCol': MaxTileCol,
                'MaxTileRow': MaxTileRow,
            }

        else:
            if MinTileCol < overviews['dataSet']['limits'][str(tile_z)]['MinTileCol']:
                overviews['dataSet']['limits'][str(tile_z)]['MinTileCol'] = MinTileCol
            if MinTileRow < overviews['dataSet']['limits'][str(tile_z)]['MinTileRow']:
                overviews['dataSet']['limits'][str(tile_z)]['MinTileRow'] = MinTileRow
            if MaxTileCol > overviews['dataSet']['limits'][str(tile_z)]['MaxTileCol']:
                overviews['dataSet']['limits'][str(tile_z)]['MaxTileCol'] = MaxTileCol
            if MaxTileRow > overviews['dataSet']['limits'][str(tile_z)]['MaxTileRow']:
                overviews['dataSet']['limits'][str(tile_z)]['MaxTileRow'] = MaxTileRow

        for tile_x in range(MinTileCol, MaxTileCol + 1):    
            for tile_y in range(MinTileRow, MaxTileRow + 1):
                # on cree une image 3 canaux pour la tuile
                opi = create_blank_tile(overviews, {'x': tile_x, 'y': tile_y, 'resolution': resolution}, 3, out_raster_srs)
                # on reech l'OPI dans cette image
                gdal.Warp(opi, input_image)
                # si necessaire on cree le dossier de la tuile
                tile_dir = args.cache+'/'+str(tile_z)+'/'+str(tile_y)+'/'+str(tile_x)
                Path(tile_dir).mkdir(parents=True, exist_ok=True)
                # on export en jpeg (todo: gerer le niveau de Q)
                PNG_DRIVER.CreateCopy(tile_dir+"/"+stem+".png", opi)
                # on cree une image mono canal pour la tuile
                mask = create_blank_tile(overviews, {'x': tile_x, 'y': tile_y, 'resolution': resolution}, 3, out_raster_srs)
                # on rasterise la partie du graphe qui concerne ce cliche
                gdal.Rasterize(mask, db_graph,
                               SQLStatement='select geom from ' + args.table + ' where cliche = \''+stem+'\' ')
                img_mask = mask.GetRasterBand(1).ReadAsArray()
                # si le mask est vide, on a termine
                val_max = np.amax(img_mask)
                if val_max > 0:
                    # on cree le graphe et l'ortho
                    ortho = create_blank_tile(overviews, {'x': tile_x, 'y': tile_y, 'resolution': resolution}, 3, out_raster_srs)
                    graph = create_blank_tile(overviews, {'x': tile_x, 'y': tile_y, 'resolution': resolution}, 3, out_raster_srs)
                    if Path(tile_dir+"/ortho.png").is_file():
                        existing_ortho = gdal.Open(tile_dir+"/ortho.png")
                        existing_graph = gdal.Open(tile_dir+"/graph.png")
                    else:
                        existing_ortho = False
                        existing_graph = False
                    for i in range(3):
                        opi_i = opi.GetRasterBand(i+1).ReadAsArray()
                        if existing_ortho:
                            ortho_i = existing_ortho.GetRasterBand(i+1).ReadAsArray()
                        else:
                            ortho_i = ortho.GetRasterBand(i+1).ReadAsArray()
                        opi_i[(img_mask == 0)] = 0
                        ortho_i[(img_mask != 0)] = 0
                        ortho.GetRasterBand(i+1).WriteArray(np.add(opi_i, ortho_i))
                        if existing_graph:
                            graph_i = existing_graph.GetRasterBand(i+1).ReadAsArray()
                        else:
                            graph_i = graph.GetRasterBand(i+1).ReadAsArray()
                        graph_i[(img_mask != 0)] = color[i]
                        graph.GetRasterBand(i+1).WriteArray(graph_i)
                    existing_ortho = None
                    existing_graph = None
                    PNG_DRIVER.CreateCopy(tile_dir+"/ortho.png", ortho)
                    PNG_DRIVER.CreateCopy(tile_dir+"/graph.png", graph)
    # on ajout l'OPI traitée a la liste
    if not ("list_OPI" in overviews):
        overviews["list_OPI"] = [stem]
    else:
        overviews["list_OPI"].append(stem)

def creation_jsonFile_itowns(cache, urlApi, layers, overviews):
    if verbose > 0:
        print("~~~~creation_jsonFile_itowns", end='')

    capabilities_layers = []
    for layer in layers:
        source = {}
        source["url"] = urlApi
        source["projection"] = overviews["crs"]['type'] + ":" + str(overviews["crs"]['code'])
        source["networkOptions"] = {"crossOrigin": "anonymous"}
        source["format"] = layer['format']
        source["name"] = layer['name']
        source["tileMatrixSet"] = overviews["identifier"]
        source["tileMatrixSetLimits"] = overviews["dataSet"]["limits"]

        layerconf = {}
        layerconf["id"] = source['name']
        layerconf["source"] = source
        with open(cache+'/'+source['name']+".json", 'w') as outfile:
            json.dump(layerconf, outfile)
    if verbose > 0:
        print(": DONE")
         
def main():
    """Create or Update the cache for list of input OPI."""
    import shutil
    import json

    if not os.path.isdir(args.cache):
        # creation dossier cache
        os.mkdir(args.cache)

    if not os.path.exists(args.cache+'/overviews.json'):
        # creation fichier overviews.json a partir d'un fichier ressource
        shutil.copy2(args.overviews, args.cache+'/overviews.json')

    with open(args.cache+'/overviews.json') as json_overviews:
        overviews_dict = json.load(json_overviews)

    out_raster_srs = gdal.osr.SpatialReference()
    out_raster_srs.ImportFromEPSG(overviews_dict['crs']['code'])
    conn_string = "PG:host="+host+" dbname="+database+" user="+user+" password="+password
    db_graph = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
    if db_graph is None:
        raise ValueError("Connection to database failed")
    list_filename = glob.glob(args.input)
    if verbose > 0:
        print(len(list_filename), "fichier(s) a traiter")

    try:
        with open(args.cache+'/cache_mtd.json', 'r') as inputfile:
            mtd = json.load(inputfile)
    except:
        mtd = {}

    cliche_dejaTraites = []
    for filename in list_filename:
        # Si le fichier a deja une couleur on la recupere
        cliche = filename.split(os.path.sep)[-1].split('.')[0]
        color = None
        for _r in mtd:
            for _v in mtd[_r]:
                for _b in mtd[_r][_v]:
                    if mtd[_r][_v][_b] == cliche:
                        color = [_r, _v, _b]
                        cliche_dejaTraites.append(cliche)
                        break
                if color:
                    break
            if color:
                break
        if color is None:
            print('nouvelle image: ', filename)
            color = [randrange(255), randrange(255), randrange(255)]
            while (color[0] in mtd) and (color[1] in mtd[color[0]]) and (color[2] in mtd[color[0]][color[1]]):
                color = [randrange(255), randrange(255), randrange(255)]
            if color[0] not in mtd:
                mtd[color[0]] = {}
            if color[1] not in mtd[color[0]]:
                mtd[color[0]][color[1]] = {}
            mtd[color[0]][color[1]][color[2]] = cliche
            process_image(overviews_dict, db_graph, filename, color, out_raster_srs)

    with open(args.cache+'/cache_mtd.json', 'w') as outfile:
        json.dump(mtd, outfile)

    with open(args.cache+'/overviews.json', 'w') as outfile:
        json.dump(overviews_dict, outfile)
    
    LAYERS = [
        {'name': 'ortho', 'format': 'image/png'},
        {'name': 'graph', 'format': 'image/png'},
        {'name': 'opi', 'format': 'image/png', 'prefix': args.prefix}
        ]

    creation_jsonFile_itowns(args.cache, args.api, LAYERS, overviews_dict)

    print("\n", len(list_filename) - len(cliche_dejaTraites),"/",len(list_filename),"OPI(s) ajoutée(s)")
    if len(cliche_dejaTraites) > 0:
        print(cliche_dejaTraites, "déjà traitées : OPI non recalculée(s)")

if __name__ == "__main__":
    main()