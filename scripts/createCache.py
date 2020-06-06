import gdal
import xml.etree.ElementTree as ET

tree = ET.parse('Capabilities.xml')
root = tree.getroot()
# print(root)
tiles={}
for TMS in root.findall('{http://www.opengis.net/wmts/1.0}Contents/{http://www.opengis.net/wmts/1.0}TileMatrixSet/{http://www.opengis.net/wmts/1.0}TileMatrix'):
    # for keys in TMS.findall('*'):
    #     print(keys)
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
# print(tiles)

epsg = int(root.find('{http://www.opengis.net/wmts/1.0}Contents/{http://www.opengis.net/wmts/1.0}TileMatrixSet/{http://www.opengis.net/ows/1.1}SupportedCRS').text.split(':')[1])
print('Code EPSG : ', epsg)

outRasterSRS = gdal.osr.SpatialReference()
outRasterSRS.ImportFromEPSG(epsg)

print(tiles[13])

def create_blank_tile(tiles, tileMatrix, tileRow, tileCol):
    print('create', tileMatrix, tileRow, tileCol)
    originX = tiles[tileMatrix]['TopLeftCorner'][0] + tileCol * tiles[tileMatrix]['Resolution'] * tiles[tileMatrix]['TileWidth']
    originY = tiles[tileMatrix]['TopLeftCorner'][1] - tileRow * tiles[tileMatrix]['Resolution'] * tiles[tileMatrix]['TileHeight']
    target_ds = gdal.GetDriverByName('MEM').Create('', tiles[tileMatrix]['MatrixWidth'], tiles[tileMatrix]['MatrixHeight'], 3, gdal.GDT_Byte)
    target_ds.SetGeoTransform((originX, tiles[tileMatrix]['Resolution'], 0, originY, 0, tiles[tileMatrix]['Resolution']))
    target_ds.SetProjection(outRasterSRS.ExportToWkt())
    target_ds.FlushCache()
    print('done')
    return target_ds

# img = create_blank_tile(tiles, 13, 300, 300)

def get_TileMatrixSetLimits(tiles, filename):
    srcImage = gdal.Open(filename)
    geoTrans = srcImage.GetGeoTransform()
    print(geoTrans)
    ulX = geoTrans[0]
    ulY = geoTrans[3]
    xDist = geoTrans[1]
    yDist = geoTrans[5]
    cols = srcImage.RasterXSize
    rows = srcImage.RasterYSize
    lrX = ulX + cols*xDist
    lrY = ulY - rows*yDist
    tileMatrixSetLimits={}
    for tile in tiles:
        tileMatrixLimits['TileMatrix'] = tile['Identifier']
        tileMatrixLimits['MinTileCol'] = floor((ulX - tile['TopLeftCorner'][0])/(tile['Resolution']*tile['TileWidth']))
        tileMatrixLimits['MinTileRow'] = floor((tile['TopLeftCorner'][1])/(tile['Resolution']*tile['TileHeight']-ulY))
        tileMatrixLimits['MaxTileCol'] = ceil((lrX - tile['TopLeftCorner'][0])/(tile['Resolution']*tile['TileWidth']))
        tileMatrixLimits['MaxTileRow'] = ceil((tile['TopLeftCorner'][1])/(tile['Resolution']*tile['TileHeight']-lrY))
        tileMatrixSetLimits[tile['Identifier']] = tileMatrixLimits
    return tileMatrixSetLimits

# on fait un vrt de la couche Ortho
# on recupere la BBox de l'Ortho
# Pour chaque niveau on cherche les tuiles concernes
# Pour chaque tuile concernee on lance un gdalwarp

# Idem pour le graphe

# on parcourt les OPI
# pour chaque opi on recupere la BBox
# ...