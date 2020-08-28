"""This script create Capabilities.xml and json files for iTowns"""
import glob
import json
import os


def export_tile_limits(layername):
    """Return tile_matrix_set_limits for a layer in the cache"""
    list_filename = glob.glob('cache/*/*/*/'+layername+'.*')
    tile_matrix_set_limits = {}
    for dirname in list_filename:
        tab = dirname.split(os.path.sep)
        tile_z = int(tab[1])
        tile_y = int(tab[2])
        tile_x = int(tab[3])
        if tile_z in tile_matrix_set_limits:
            tile_matrix_set_limits[tile_z]['MinTileRow'] = \
                min(tile_y, tile_matrix_set_limits[tile_z]['MinTileRow'])
            tile_matrix_set_limits[tile_z]['MaxTileRow'] = \
                max(tile_y, tile_matrix_set_limits[tile_z]['MaxTileRow'])
            tile_matrix_set_limits[tile_z]['MinTileCol'] = \
                min(tile_x, tile_matrix_set_limits[tile_z]['MinTileCol'])
            tile_matrix_set_limits[tile_z]['MaxTileCol'] = \
                max(tile_x, tile_matrix_set_limits[tile_z]['MaxTileCol'])
        else:
            tile_matrix_set_limit = {}
            tile_matrix_set_limit['MinTileRow'] = tile_y
            tile_matrix_set_limit['MaxTileRow'] = tile_y
            tile_matrix_set_limit['MinTileCol'] = tile_x
            tile_matrix_set_limit['MaxTileCol'] = tile_x
            tile_matrix_set_limits[tile_z] = tile_matrix_set_limit
    return tile_matrix_set_limits


def export_capabilities(layers, url):
    """Return export Capabilities.xml"""
    xml = ("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
           "<Capabilities xmlns=\"http://www.opengis.net/wmts/1.0\" "
           "xmlns:gml=\"http://www.opengis.net/gml\" "
           "xmlns:ows=\"http://www.opengis.net/ows/1.1\" "
           "xmlns:xlink=\"http://www.w3.org/1999/xlink\" "
           "xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" version=\"1.0.0\" "
           "xsi:schemaLocation=\"http://www.opengis.net/wmts/1.0 "
           "http://schemas.opengis.net/wmts/1.0/wmtsGetCapabilities_response.xsd\">"
           "<ows:ServiceIdentification>"
           "<ows:Title>Service WMTS</ows:Title>"
           "<ows:Abstract>Proto pour API Mosaiquage</ows:Abstract>"
           "<ows:Keywords>"
           "<ows:Keyword>WMTS</ows:Keyword><ows:Keyword>Mosaiquage</ows:Keyword>"
           "</ows:Keywords>"
           "<ows:ServiceType>OGC WMTS</ows:ServiceType>"
           "<ows:ServiceTypeVersion>1.0.0</ows:ServiceTypeVersion>"
           "</ows:ServiceIdentification>"
           "<ows:ServiceProvider><ows:ProviderName>IGN</ows:ProviderName></ows:ServiceProvider>"
           "<ows:OperationsMetadata>"
           "<ows:Operation name=\"GetCapabilities\">"
           "<ows:DCP><ows:HTTP>"
           "<ows:Get xlink:href=\""+url+"\">"
           "<ows:Constraint name=\"GetEncoding\">"
           "<ows:AllowedValues><ows:Value>KVP</ows:Value></ows:AllowedValues>"
           "</ows:Constraint>"
           "</ows:Get>"
           "</ows:HTTP></ows:DCP>"
           "</ows:Operation>"
           "<ows:Operation name=\"GetTile\">"
           "<ows:DCP><ows:HTTP>"
           "<ows:Get xlink:href=\""+url+"\">"
           "<ows:Constraint name=\"GetEncoding\">"
           "<ows:AllowedValues><ows:Value>KVP</ows:Value></ows:AllowedValues>"
           "</ows:Constraint>"
           "</ows:Get>"
           "</ows:HTTP></ows:DCP>"
           "</ows:Operation>"
           "<ows:Operation name=\"GetFeatureInfo\">"
           "<ows:DCP><ows:HTTP>"
           "<ows:Get xlink:href=\""+url+"\">"
           "<ows:Constraint name=\"GetEncoding\">"
           "<ows:AllowedValues><ows:Value>KVP</ows:Value></ows:AllowedValues>"
           "</ows:Constraint>"
           "</ows:Get>"
           "</ows:HTTP></ows:DCP>"
           "</ows:Operation>"
           "</ows:OperationsMetadata>"
           "<Contents>")
    for layer in layers:
        print(layer)
        limits = export_tile_limits(layer['name'])
        layerconf = {}
        layerconf["id"] = layer['name']
        source = {}
        source["url"] = url
        source["projection"] = "EPSG:2154"
        source["networkOptions"] = {"crossOrigin": "anonymous"}
        source["format"] = layer['format']
        source["name"] = layer['name']
        source["tileMatrixSet"] = "LAMB93"
        source["tileMatrixSetLimits"] = limits
        layerconf["source"] = source
        with open('itowns/'+layer['name']+".json", 'w') as outfile:
            json.dump(layerconf, outfile)
        xml += '<Layer><ows:Title>'+layer['name']+\
            '</ows:Title><ows:Abstract>'+layer['name']+'</ows:Abstract>'
        xml += ("<ows:WGS84BoundingBox><ows:LowerCorner>-7.1567 40.6712</ows:LowerCorner>"
                "<ows:UpperCorner>11.578 51.9948</ows:UpperCorner></ows:WGS84BoundingBox>")
        xml += '<ows:Identifier>'+layer['name']+'</ows:Identifier>'
        xml += ("<Style isDefault=\"true\"><ows:Title>Légende générique</ows:Title>"
                "<ows:Abstract>Fichier de légende générique</ows:Abstract>")
        xml += '<ows:Keywords><ows:Keyword>Défaut</ows:Keyword></ows:Keywords>'
        xml += '<ows:Identifier>normal</ows:Identifier>'
        xml += ("<LegendURL format=\"image/jpeg\" height=\"200\" "
                "maxScaleDenominator=\"100000000\" minScaleDenominator=\"200\" width=\"200\" "
                "xlink:href=\"https://wxs.ign.fr/static/legends/LEGEND.jpg\"/></Style>")
        xml += '<Format>'+layer['format']+'</Format>'
        xml += '<TileMatrixSetLink><TileMatrixSet>LAMB93</TileMatrixSet>'
        xml += '<TileMatrixSetLimits>'
        for tile_z in limits:
            xml += '<TileMatrixLimits>'
            xml += '<TileMatrix>'+str(tile_z)+'</TileMatrix>'
            xml += '<MinTileRow>'+str(limits[tile_z]['MinTileRow'])+'</MinTileRow>'
            xml += '<MaxTileRow>'+str(limits[tile_z]['MaxTileRow'])+'</MaxTileRow>'
            xml += '<MinTileCol>'+str(limits[tile_z]['MinTileCol'])+'</MinTileCol>'
            xml += '<MaxTileCol>'+str(limits[tile_z]['MaxTileCol'])+'</MaxTileCol>'
            xml += '</TileMatrixLimits>'
        xml += '</TileMatrixSetLimits>'
        xml += '</TileMatrixSetLink>'
        xml += '</Layer>'
    xml += ("<TileMatrixSet>"
            "<ows:Identifier>LAMB93</ows:Identifier>"
            "<ows:SupportedCRS>EPSG:2154</ows:SupportedCRS>"
            "<TileMatrix>"
            "<ows:Identifier>10</ows:Identifier>"
            "<ScaleDenominator>365714.285714286</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>51</MatrixWidth><MatrixHeight>232</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>11</ows:Identifier>"
            "<ScaleDenominator>182857.142857143</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>100</MatrixWidth><MatrixHeight>462</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>12</ows:Identifier>"
            "<ScaleDenominator>91428.5714285714</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>199</MatrixWidth><MatrixHeight>922</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>13</ows:Identifier>"
            "<ScaleDenominator>45714.2857142857</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>396</MatrixWidth><MatrixHeight>1842</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>14</ows:Identifier>"
            "<ScaleDenominator>22857.1428571429</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth>"
            "<TileHeight>256</TileHeight>"
            "<MatrixWidth>791</MatrixWidth>"
            "<MatrixHeight>3682</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>15</ows:Identifier>"
            "<ScaleDenominator>11428.5714285714</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>1581</MatrixWidth><MatrixHeight>7363</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>16</ows:Identifier>"
            "<ScaleDenominator>5714.28571428571</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>3161</MatrixWidth><MatrixHeight>14724</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>17</ows:Identifier>"
            "<ScaleDenominator>2857.14285714286</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>6321</MatrixWidth><MatrixHeight>29447</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>18</ows:Identifier>"
            "<ScaleDenominator>1428.57142857143</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>12641</MatrixWidth><MatrixHeight>58892</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>19</ows:Identifier>"
            "<ScaleDenominator>714.285714285714</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>25281</MatrixWidth><MatrixHeight>117782</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>20</ows:Identifier>"
            "<ScaleDenominator>357.142857142857</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>50561</MatrixWidth><MatrixHeight>235563</MatrixHeight>"
            "</TileMatrix>"
            "<TileMatrix>"
            "<ows:Identifier>21</ows:Identifier>"
            "<ScaleDenominator>178.571428571429</ScaleDenominator>"
            "<TopLeftCorner>0.0 12000000.0</TopLeftCorner>"
            "<TileWidth>256</TileWidth><TileHeight>256</TileHeight>"
            "<MatrixWidth>101121</MatrixWidth><MatrixHeight>471125</MatrixHeight>"
            "</TileMatrix>"
            "</TileMatrixSet>"
            "</Contents>"
            "</Capabilities>")
    with open('cache/Capabilities.xml', 'w') as outfile:
        outfile.write(xml)


# creation dossier cache
if not os.path.isdir("cache"):
    os.mkdir("cache")

LAYERS = [{'name': 'ortho', 'format': 'image/png'},
          {'name': 'graph', 'format': 'image/png'},
          {'name': '19FD5606A', 'format': 'image/png'}]
export_capabilities(LAYERS, 'http://localhost:8081/wmts')
