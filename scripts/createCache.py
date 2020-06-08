import gdal
import xml.etree.ElementTree as ET
import math
from pathlib import Path
import sys

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

def create_blank_tile(tiles, tileMatrix, tileCol, tileRow):
    originX = tiles[tileMatrix]['TopLeftCorner'][0] + tileCol * tiles[tileMatrix]['Resolution'] * tiles[tileMatrix]['TileWidth']
    originY = tiles[tileMatrix]['TopLeftCorner'][1] - tileRow * tiles[tileMatrix]['Resolution'] * tiles[tileMatrix]['TileHeight']
    target_ds = gdal.GetDriverByName('MEM').Create('', tiles[tileMatrix]['TileWidth'], tiles[tileMatrix]['TileHeight'], 3, gdal.GDT_Byte)
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

tiles, epsg = getCapabilities('Capabilities.xml')
outRasterSRS = gdal.osr.SpatialReference()
outRasterSRS.ImportFromEPSG(epsg)
input_filename = sys.argv[1]
tileMatixSetLimits = get_TileMatrixSetLimits(tiles, input_filename)
input = gdal.Open(input_filename)
gtiffDriver = gdal.GetDriverByName( 'Jpeg' )
stem = Path(input_filename).stem
for z in tiles:
    print('Niveau de zoom : ',z)
    for x in range(tileMatixSetLimits[z]['MinTileCol'], tileMatixSetLimits[z]['MaxTileCol']):
        for y in range(tileMatixSetLimits[z]['MinTileRow'], tileMatixSetLimits[z]['MaxTileRow']):
            img = create_blank_tile(tiles, z, x, y)
            gdal.Warp(img, input)
            dir='cache/'+str(z)+'/'+str(x)+'/'+str(x)
            Path(dir).mkdir(parents=True, exist_ok=True)
            gtiffDriver.CreateCopy( dir+"/"+stem+".jpg", img)


# on fait un vrt de la couche Ortho
# on recupere la BBox de l'Ortho
# Pour chaque niveau on cherche les tuiles concernes
# Pour chaque tuile concernee on lance un gdalwarp

# Idem pour le graphe

# on parcourt les OPI
# pour chaque opi on recupere la BBox
# ...