import xml.etree.ElementTree as ET
tree = ET.parse('../Capabilities.xml')
root = tree.getroot()
print(root)
tiles=[]
for TMS in root.findall('{http://www.opengis.net/wmts/1.0}Contents/{http://www.opengis.net/wmts/1.0}TileMatrixSet/{http://www.opengis.net/wmts/1.0}TileMatrix'):
    # for keys in TMS.findall('*'):
    #     print(keys)
    tile={}
    tile['Identifier'] = TMS.find('{http://www.opengis.net/ows/1.1}Identifier').text
    tile['ScaleDenominator'] = float(TMS.find('{http://www.opengis.net/wmts/1.0}ScaleDenominator').text)
    tile['TopLeftCorner'] = [ float(v) for v in TMS.find('{http://www.opengis.net/wmts/1.0}TopLeftCorner').text.split()]
    tile['TileWidth'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}TileWidth').text)
    tile['TileHeight'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}TileHeight').text)
    tile['MatrixWidth'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}MatrixWidth').text)
    tile['MatrixHeight'] = int(TMS.find('{http://www.opengis.net/wmts/1.0}MatrixHeight').text)
    tiles.append(tile)
print(tiles)

# on fait un vrt de la couche Ortho
# on recupere la BBox de l'Ortho
# Pour chaque niveau on cherche les tuiles concernes
# Pour chaque tuile concernee on lance un gdalwarp

# Idem pour le graphe

# on parcourt les OPI
# pour chaque opi on recupere la BBox
# ...