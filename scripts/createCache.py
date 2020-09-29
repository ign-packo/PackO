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
# parser.add_argument("-x", "--xml", help="input GetCapabilities.xml (default: cache/Capabilities.xml)", type=str, default="cache/Capabilities.xml")
parser.add_argument("-o", "--overviews", help="params for the mosaic (default: LAMB93_5cm.json)", type=str, default="LAMB93_5cm.json")
parser.add_argument("-t", "--table", help="graph table (default: graphe_pcrs56_zone_test)", type=str, default="graphe_pcrs56_zone_test")
parser.add_argument("-i", "--input", required=True, help="input OPI pattern")
parser.add_argument("-p", "--prefix", required=True, help="OPI prefix pour créer le pattern de recherche dans le cache (pour le GetCapabilities)")
parser.add_argument("-a", "--api", help="API Url (default: http://localhost:8081/wmts)", type=str, default="http://localhost:8081/wmts")
args = parser.parse_args()
print("Arguments: ",args)

# creation dossier cache
if not os.path.isdir(args.cache):
    os.mkdir(args.cache)

user = os.getenv('PGUSER', default='postgres')
host = os.getenv('PGHOST', default='localhost')
database = os.getenv('PGDATABASE', default='pcrs')
password = os.getenv('PGPASSWORD', default='postgres')  # En dur, pas top...
port = os.getenv('PGPORT', default='5432')
# graphtbl = os.getenv('GRAPHTABLE', default='graphe_pcrs56_zone_test')

# jpegDriver = gdal.GetDriverByName( 'Jpeg' )
PNG_DRIVER = gdal.GetDriverByName('png')
# gtiff_driver = gdal.GetDriverByName('Gtiff')

def etree_to_dict(t):
    """Return dictonary from XML"""
    d = {t.tag: {} if t.attrib else None}
    children = list(t)
    if children:
        dd = defaultdict(list)
        for dc in map(etree_to_dict, children):
            for k, v in dc.items():
                dd[k].append(v)
        d = {t.tag: {k: v[0] if len(v) == 1 else v
                     for k, v in dd.items()}}
    if t.attrib:
        d[t.tag].update(('@' + k, v)
                        for k, v in t.attrib.items())
    if t.text:
        text = t.text.strip()
        if children or t.attrib:
            if text:
              d[t.tag]['#text'] = text
        else:
            d[t.tag] = text
    return d

def dict_to_etree(d):
    """Return XML from dictonary"""
    def _to_etree(d, root):
        if not d:
            pass
        elif isinstance(d, str):
            root.text = d
        elif isinstance(d, dict):
            for k,v in d.items():
                assert isinstance(k, str)
                if k.startswith('#'):
                    assert k == '#text' and isinstance(v, str)
                    root.text = v
                elif k.startswith('@'):
                    assert isinstance(v, str)
                    root.set(k[1:], v)
                elif isinstance(v, list):
                    for e in v:
                        _to_etree(e, ET.SubElement(root, k))
                else:
                    _to_etree(v, ET.SubElement(root, k))
        else:
            assert d == 'invalid type', (type(d), d)
    assert isinstance(d, dict) and len(d) == 1
    tag, body = next(iter(d.items()))
    node = ET.Element(tag)
    _to_etree(body, node)
    return node

def get_pyramids(input_capabilities):
    """Return tiles and epsg from an XML."""
    print("~~~get_pyramids:", end ='')
    tree = ET.parse(input_capabilities)
    root = tree.getroot()

    epsg = int(root.find('{http://www.opengis.net/wmts/1.0}Contents/{http://www.opengis.net/wmts/1.0}TileMatrixSet/{http://www.opengis.net/ows/1.1}SupportedCRS').text.split(':')[1])

    tiles = {}
    for tms in root.findall('{http://www.opengis.net/wmts/1.0}Contents/{http://www.opengis.net/wmts/1.0}TileMatrixSet/{http://www.opengis.net/wmts/1.0}TileMatrix'):
        tile = {}
        tile['Identifier'] = int(tms.find('{http://www.opengis.net/ows/1.1}Identifier').text)
        tile['ScaleDenominator'] = float(tms.find('{http://www.opengis.net/wmts/1.0}ScaleDenominator').text)
        tile['TopLeftCorner'] = [float(v) for v in
                                 tms.find('{http://www.opengis.net/wmts/1.0}TopLeftCorner').text.split()]
        tile['TileWidth'] = int(tms.find('{http://www.opengis.net/wmts/1.0}TileWidth').text)
        tile['TileHeight'] = int(tms.find('{http://www.opengis.net/wmts/1.0}TileHeight').text)
        tile['MatrixWidth'] = int(tms.find('{http://www.opengis.net/wmts/1.0}MatrixWidth').text)
        tile['MatrixHeight'] = int(tms.find('{http://www.opengis.net/wmts/1.0}MatrixHeight').text)
        tile['Resolution'] = tile['ScaleDenominator'] * 0.00028
        tiles[tile['Identifier']] = tile
    print(" DONE")
    return tiles, epsg


def create_blank_tile(overviews, tile, nb_canaux, out_raster_srs):
    """Return a blank georef image for a tile."""
    # origin_x = tiles[tile['z']]['TopLeftCorner'][0] + tile['x'] * tiles[tile['z']]['Resolution'] * tiles[tile['z']]['TileWidth']
    origin_x = overviews['crs']['boundingBox']['xmin'] + tile['x'] * tile['resolution'] * overviews['tileSize']['width']
    origin_y = overviews['crs']['boundingBox']['ymax'] - tile['y'] * tile['resolution'] * overviews['tileSize']['height']
    target_ds = gdal.GetDriverByName('MEM').Create('',
                                                   # tiles[tile['z']]['TileWidth'], tiles[tile['z']]['TileHeight'],
                                                   overviews['tileSize']['width'], overviews['tileSize']['height'],
                                                   nb_canaux, gdal.GDT_Byte)
    target_ds.SetGeoTransform((origin_x, tile['resolution'], 0,
                               origin_y, 0, -tile['resolution']))
    target_ds.SetProjection(out_raster_srs.ExportToWkt())
    target_ds.FlushCache()
    return target_ds


def get_tile_matrix_set_limits(tiles, filename, overviews):
    """Return tms limits for a georef image"""
    print("~~~get_tile_matrix_set_limits:", end='')
    src_image = gdal.Open(filename)
    geo_trans = src_image.GetGeoTransform()
    ul_x = geo_trans[0]
    ul_y = geo_trans[3]
    x_dist = geo_trans[1]
    y_dist = geo_trans[5]
    lr_x = ul_x + src_image.RasterXSize*x_dist
    lr_y = ul_y + src_image.RasterYSize*y_dist

    tile_matrix_set_limits = {}
    # for i in tiles:
    for level in range (overviews['level']['min'], overviews['level']['max'] + 1):
        # tile = tiles[i]
        tile_matrix_limits = {}
        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - level)
        # tile_matrix_limits['TileMatrix'] = tile['Identifier']
        tile_matrix_limits['TileMatrix'] = level
        tile_matrix_limits['MinTileCol'] = \
            math.floor(round((ul_x - overviews['crs']['boundingBox']['xmin'])/(resolution*overviews['tileSize']['width']),8))
            # math.floor(round((ul_x - tile['TopLeftCorner'][0])/(tile['Resolution']*tile['TileWidth']),8))
        tile_matrix_limits['MinTileRow'] = \
            math.floor(round((overviews['crs']['boundingBox']['ymax']-ul_y)/(resolution*overviews['tileSize']['height']),8))
            # math.floor(round((tile['TopLeftCorner'][1]-ul_y)/(tile['Resolution']*tile['TileHeight']),8))
        tile_matrix_limits['MaxTileCol'] = \
            math.ceil(round((lr_x - overviews['crs']['boundingBox']['xmin'])/(resolution*overviews['tileSize']['width']),8))
            # math.ceil(round((lr_x - tile['TopLeftCorner'][0])/(tile['Resolution']*tile['TileWidth']),8))
        tile_matrix_limits['MaxTileRow'] = \
            math.ceil(round((overviews['crs']['boundingBox']['ymax']-lr_y)/(resolution*overviews['tileSize']['height']),8))
            # math.ceil(round((tile['TopLeftCorner'][1]-lr_y)/(tile['Resolution']*tile['TileHeight']),8))
        tile_matrix_set_limits[level] = tile_matrix_limits
    print(" DONE")
    print(tile_matrix_set_limits)
    return tile_matrix_set_limits

def get_tile_limits(overviews, resolution, filename):
    """Return tms limits for a georef image at a given level"""
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

    tile_limits['MinTileCol'] = \
        math.floor(round((ul_x - overviews['crs']['boundingBox']['xmin'])/(resolution*overviews['tileSize']['width']),8))
    tile_limits['MinTileRow'] = \
        math.floor(round((overviews['crs']['boundingBox']['ymax']-ul_y)/(resolution*overviews['tileSize']['height']),8))
    tile_limits['MaxTileCol'] = \
        math.ceil(round((lr_x - overviews['crs']['boundingBox']['xmin'])/(resolution*overviews['tileSize']['width']),8)) - 1
    tile_limits['MaxTileRow'] = \
        math.ceil(round((overviews['crs']['boundingBox']['ymax']-lr_y)/(resolution*overviews['tileSize']['height']),8)) - 1

    print(" DONE")
    return tile_limits

def process_image(overviews, db_graph, input_filename, color, out_raster_srs):
    """Update the cache for an input OPI."""
    print("~~~process_image")
    # tile_matix_set_limits = get_tile_matrix_set_limits(tiles, input_filename, overviews)
    input_image = gdal.Open(input_filename)
    stem = Path(input_filename).stem
    overviews['dataSet_limits'] = {}
    # for z in tiles:
    for tile_z in range(overviews['level']['min'], overviews['level']['max'] + 1):
        print('Niveau de zoom : ', tile_z)

        resolution = overviews['resolution'] * 2 ** (overviews['level']['max'] - tile_z)
        tile_limits = get_tile_limits(overviews, resolution, input_filename)

        print(tile_limits)
        
        if not(tile_z in overviews['dataSet_limits']):
            overviews['dataSet_limits'][tile_z] = tile_limits
        else:
            if tile_limits['MinTileCol'] < overviews['dataSet_limits'][tile_z]['MinTileCol']:
                overviews['dataSet_limits'][tile_z]['MinTileCol'] = tile_limits['MinTileCol']
            if tile_limits['MinTileRow'] < overviews['dataSet_limits'][tile_z]['MinTileRow']:
                overviews['dataSet_limits'][tile_z]['MinTileRow'] = tile_limits['MinTileRow']
            if tile_limits['MaxTileCol'] > overviews['dataSet_limits'][tile_z]['MaxTileCol']:
                overviews['dataSet_limits'][tile_z]['MaxTileCol'] = tile_limits['MaxTileCol']
            if tile_limits['MaxTileRow'] < overviews['dataSet_limits'][tile_z]['MaxTileRow']:
                overviews['dataSet_limits'][tile_z]['MaxTileRow'] = tile_limits['MaxTileRow']

        for tile_x in range(tile_limits['MinTileCol'], tile_limits['MaxTileCol'] + 1):    
            for tile_y in range(tile_limits['MinTileRow'], tile_limits['MaxTileRow'] + 1):
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
                    PNG_DRIVER.CreateCopy(tile_dir+"/ortho.png", ortho)
                    PNG_DRIVER.CreateCopy(tile_dir+"/graph.png", graph)
    print(" DONE")

def update_capabilities_and_json(cache, url, layers, overviews):
    print("~~~~update_capabilities_and_json")

    capabilities_layers = []
    for layer in layers:
        print(layer)

        source = {}
        source["url"] = url
        source["projection"] = overviews["crs"]['type'] + ":" + str(overviews["crs"]['code'])
        source["networkOptions"] = {"crossOrigin": "anonymous"}
        source["format"] = layer['format']
        source["name"] = layer['name']
        source["tileMatrixSet"] = args.overviews
        source["tileMatrixSetLimits"] = overviews["dataSet_limits"]

        layerconf = {}
        layerconf["id"] = source['name']
        layerconf["source"] = source
        with open(cache+'/'+source['name']+".json", 'w') as outfile:
            json.dump(layerconf, outfile)

         
def main():
    """Create or Update the cache for list of input OPI."""

    if not os.path.exists(args.cache+'/overviews.json'):
        from shutil import copy2
        copy2("ressources/"+ args.overviews, args.cache+'/overviews.json')

    import json

    with open(args.cache+'/overviews.json') as json_overviews:
        overviews_dict = json.load(json_overviews)

    out_raster_srs = gdal.osr.SpatialReference()
    out_raster_srs.ImportFromEPSG(overviews_dict['crs']['code'])
    conn_string = "PG:host="+host+" dbname="+database+" user="+user+" password="+password
    db_graph = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
    if db_graph is None:
        raise ValueError("Connection to database failed")
    list_filename = glob.glob(args.input)
    print("")
    print(len(list_filename), " fichier(s) a traiter")
    print("")

    try:
        with open(args.cache+'/cache_mtd.json', 'r') as inputfile:
            mtd = json.load(inputfile)
    except:
        mtd = {}

    for filename in list_filename:
        # Si le fichier a deja une couleur on la recupere
        cliche = filename.split(os.path.sep)[-1].split('.')[0]
        color = None
        for _r in mtd:
            for _v in mtd[_r]:
                for _b in mtd[_r][_v]:
                    if mtd[_r][_v][_b] == cliche:
                        color = [_r, _v, _b]
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
    
    LAYERS = [{'name': 'ortho', 'format': 'image/png'},
        {'name': 'graph', 'format': 'image/png'},
        {'name': 'opi', 'format': 'image/png', 'prefix': args.prefix}]

    update_capabilities_and_json(args.cache, args.api, LAYERS, overviews_dict)

if __name__ == "__main__":
    main()
