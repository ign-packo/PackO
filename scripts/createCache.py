import gdal
import xml.etree.ElementTree as ET
import math
from pathlib import Path
import sys
import numpy as np
from random import randrange
import glob

def getCapabilities(input_capabilities):
    tree = ET.parse(input_capabilities)
    root = tree.getroot()
    epsg = int(root.find('{http://www.opengis.net/wmts/1.0}Contents/{http://www.opengis.net/wmts/1.0}TileMatrixSet/{http://www.opengis.net/ows/1.1}SupportedCRS').text.split(':')[1])
    tiles={}
    for TMS in root.findall('{http://www.opengis.net/wmts/1.0}Contents/{http://www.opengis.net/wmts/1.0}TileMatrixSet/{http://www.opengis.net/wmts/1.0}TileMatrix'):
        tile={}
        tile['Identifier'] = int(TMS.find('{http://www.opengis.net/ows/1.1}Identifier').text)
        tile['ScaleDenominator'] = float(TMS.find('{http://www.opengis.net/wmts/1.0}ScaleDenominator').text)
        tile['TopLeftCorner'] = [ float(v) for v in TMS.find('{http://www.opengis.net/wmts/1.0}TopLeftCorner').text.split()]
        tile['TileWidth'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}TileWidth').text)
        tile['TileHeight'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}TileHeight').text)
        tile['MatrixWidth'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}MatrixWidth').text)
        tile['MatrixHeight'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}MatrixHeight').text)
        tile['Resolution'] = tile['ScaleDenominator'] * 0.00028
        tiles[tile['Identifier']]=tile
    return tiles, epsg

def create_blank_tile(tiles, tileMatrix, tileCol, tileRow, nbC=3):
    originX = tiles[tileMatrix]['TopLeftCorner'][0] + tileCol * tiles[tileMatrix]['Resolution'] * tiles[tileMatrix]['TileWidth']
    originY = tiles[tileMatrix]['TopLeftCorner'][1] - tileRow * tiles[tileMatrix]['Resolution'] * tiles[tileMatrix]['TileHeight']
    target_ds = gdal.GetDriverByName('MEM').Create('', tiles[tileMatrix]['TileWidth'], tiles[tileMatrix]['TileHeight'], nbC, gdal.GDT_Byte)
    target_ds.SetGeoTransform((originX, tiles[tileMatrix]['Resolution'], 0, originY, 0, -tiles[tileMatrix]['Resolution']))
    target_ds.SetProjection(outRasterSRS.ExportToWkt())
    target_ds.FlushCache()
    return target_ds

def get_TileMatrixSetLimits(tiles, filename):
    srcImage = gdal.Open(filename)
    geoTrans = srcImage.GetGeoTransform()
    ulX = geoTrans[0]
    ulY = geoTrans[3]
    xDist = geoTrans[1]
    yDist = geoTrans[5]
    cols = srcImage.RasterXSize
    rows = srcImage.RasterYSize
    lrX = ulX + cols*xDist
    lrY = ulY + rows*yDist
    tileMatrixSetLimits={}
    for n in tiles:
        tile=tiles[n]
        tileMatrixLimits={}
        tileMatrixLimits['TileMatrix'] = tile['Identifier']
        tileMatrixLimits['MinTileCol'] = math.floor((ulX - tile['TopLeftCorner'][0])/(tile['Resolution']*tile['TileWidth']))
        tileMatrixLimits['MinTileRow'] = math.floor((tile['TopLeftCorner'][1]-ulY)/(tile['Resolution']*tile['TileHeight']))
        tileMatrixLimits['MaxTileCol'] = math.ceil((lrX - tile['TopLeftCorner'][0])/(tile['Resolution']*tile['TileWidth']))
        tileMatrixLimits['MaxTileRow'] = math.ceil((tile['TopLeftCorner'][1]-lrY)/(tile['Resolution']*tile['TileHeight']))
        tileMatrixSetLimits[tile['Identifier']] = tileMatrixLimits
    return tileMatrixSetLimits


def processImage(input_filename, input_r, input_v, input_b):
    print(input_filename, input_r, input_v, input_b)
    tileMatixSetLimits = get_TileMatrixSetLimits(tiles, input_filename)
    input = gdal.Open(input_filename)
    jpegDriver = gdal.GetDriverByName( 'Jpeg' )
    pngDriver = gdal.GetDriverByName( 'png' )
    stem = Path(input_filename).stem
    # for z in tiles:
    for z in range(10,18):
        print('Niveau de zoom : ',z)
        for x in range(tileMatixSetLimits[z]['MinTileCol'], tileMatixSetLimits[z]['MaxTileCol']):
            for y in range(tileMatixSetLimits[z]['MinTileRow'], tileMatixSetLimits[z]['MaxTileRow']):
                # on cree une image 3 canaux pour la tuile
                opi = create_blank_tile(tiles, z, x, y, 3)
                # on reech l'OPI dans cette image
                gdal.Warp(opi, input)
                # si necessaire on cree le dossier de la tuile
                dir='cache/'+str(z)+'/'+str(y)+'/'+str(x)
                Path(dir).mkdir(parents=True, exist_ok=True)
                # on export en jpeg (todo: gerer le niveau de Q)
                jpegDriver.CreateCopy( dir+"/"+stem+".jpg", opi)
                # on cree une image mono canal pour la tuile
                mask = create_blank_tile(tiles, z, x, y, 1)
                # on rasterise la partie du graphe qui concerne ce cliche
                gdal.Rasterize(mask, db, SQLStatement='select geom from graphe_pcrs56_zone_test where cliche = \''+stem+'\' ')
                img_mask = mask.GetRasterBand(1).ReadAsArray()
                
                # si le mask est vide, on a termine
                max = np.amax(img_mask)
                if (max>0):
                    # on cree le graphe et l'ortho
                    ortho = create_blank_tile(tiles, z, x, y, 3)
                    graph = create_blank_tile(tiles, z, x, y, 3)
                    if Path(dir+"/ortho.jpg").is_file():
                        existing_ortho = gdal.Open(dir+"/ortho.jpg")
                        existing_graph = gdal.Open(dir+"/graph.png")
                    else:
                        existing_ortho = False
                        existing_graph = False

                    opi_r = opi.GetRasterBand(1).ReadAsArray()
                    if existing_ortho :
                        ortho_r = existing_ortho.GetRasterBand(1).ReadAsArray()
                    else:
                        ortho_r = ortho.GetRasterBand(1).ReadAsArray()
                    opi_r[(img_mask == 0)] = 0
                    ortho_r[(img_mask != 0)] = 0
                    ortho.GetRasterBand(1).WriteArray(np.add(opi_r, ortho_r))

                    opi_v = opi.GetRasterBand(2).ReadAsArray()
                    if existing_ortho:
                        ortho_v = existing_ortho.GetRasterBand(2).ReadAsArray()
                    else:
                        ortho_v = ortho.GetRasterBand(2).ReadAsArray()
                    opi_v[(img_mask == 0)] = 0
                    ortho_v[(img_mask != 0)] = 0
                    ortho.GetRasterBand(2).WriteArray(np.add(opi_v, ortho_v))

                    opi_b = opi.GetRasterBand(3).ReadAsArray()
                    if existing_ortho:
                        ortho_b = existing_ortho.GetRasterBand(3).ReadAsArray()
                    else:
                        ortho_b = ortho.GetRasterBand(3).ReadAsArray()
                    opi_b[(img_mask == 0)] = 0
                    ortho_b[(img_mask != 0)] = 0
                    ortho.GetRasterBand(3).WriteArray(np.add(opi_b, ortho_b))

                    if existing_graph:
                        graph_r = existing_graph.GetRasterBand(1).ReadAsArray()
                    else:
                        graph_r = graph.GetRasterBand(1).ReadAsArray()
                    graph.GetRasterBand(1).WriteArray(graph_r)

                    if existing_graph:
                        graph_v = existing_graph.GetRasterBand(2).ReadAsArray()
                    else:
                        graph_v = graph.GetRasterBand(2).ReadAsArray()
                    graph_v[(img_mask != 0)] = input_v
                    graph.GetRasterBand(2).WriteArray(graph_v)

                    if existing_graph:
                        graph_b = existing_graph.GetRasterBand(3).ReadAsArray()
                    else:
                        graph_b = graph.GetRasterBand(3).ReadAsArray()
                    graph_b[(img_mask != 0)] = input_b
                    graph.GetRasterBand(3).WriteArray(graph_b)

                    jpegDriver.CreateCopy( dir+"/ortho.jpg", ortho)
                    pngDriver.CreateCopy( dir+"/graph.png", graph)


tiles, epsg = getCapabilities('Capabilities.xml')
outRasterSRS = gdal.osr.SpatialReference()
outRasterSRS.ImportFromEPSG(epsg)
conn_string = "PG:host=host.docker.internal dbname='pcrs' user='postgres'"
db = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
if db is None:
    raise ValueError("Connection to database failed")



L = glob.glob(sys.argv[1])
# input_r = int(sys.argv[2])
# input_v = int(sys.argv[3])
# input_b = int(sys.argv[4])
for filename in L:
    processImage(filename, randrange(255), randrange(255), randrange(255))






# on fait un vrt de la couche Ortho
# on recupere la BBox de l'Ortho
# Pour chaque niveau on cherche les tuiles concernes
# Pour chaque tuile concernee on lance un gdalwarp

# Idem pour le graphe

# on parcourt les OPI
# pour chaque opi on recupere la BBox
# ...