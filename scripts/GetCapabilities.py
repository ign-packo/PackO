import xml.etree.ElementTree as ET
import glob

def exportTileLimits(layername):
    L = glob.glob('cache/*/*/*/'+layername+'.*')
    tileMatrixSetLimits={}
    for dirname in L:
        T = dirname.split('/')
        z = int(T[1])
        y = int(T[2])
        x = int(T[3])
        if z in tileMatrixSetLimits:
            tileMatrixSetLimits[z]['MinTileRow'] = min(y, tileMatrixSetLimits[z]['MinTileRow'])
            tileMatrixSetLimits[z]['MaxTileRow'] = max(y, tileMatrixSetLimits[z]['MaxTileRow'])
            tileMatrixSetLimits[z]['MinTileCol'] = min(x, tileMatrixSetLimits[z]['MinTileCol'])
            tileMatrixSetLimits[z]['MaxTileCol'] = min(x, tileMatrixSetLimits[z]['MaxTileCol'])
        else:
            tileMatrixSetLimit={}
            tileMatrixSetLimit['MinTileRow'] = y
            tileMatrixSetLimit['MaxTileRow'] = y
            tileMatrixSetLimit['MinTileCol'] = x
            tileMatrixSetLimit['MaxTileCol'] = x
            tileMatrixSetLimit['TileMatrix'] = z
            tileMatrixSetLimits[z] = tileMatrixSetLimit
    xml=''
    for z in tileMatrixSetLimits:
        xml+='<TileMatrixLimits>'
        xml+='<TileMatrix>'+str(z)+'</TileMatrix>'
        xml+='<MinTileRow>'+str(tileMatrixSetLimits[z]['MinTileRow'])+'</MinTileRow>'
        xml+='<MaxTileRow>'+str(tileMatrixSetLimits[z]['MaxTileRow'])+'</MaxTileRow>'
        xml+='<MinTileCol>'+str(tileMatrixSetLimits[z]['MinTileCol'])+'</MinTileCol>'
        xml+='<MaxTileCol>'+str(tileMatrixSetLimits[z]['MaxTileCol'])+'</MaxTileCol>'
        xml+='</TileMatrixLimits>'
    return xml

def exportLayer(layername, format='image/jpeg'):
    xml='<Layer><ows:Title>'+layername+'</ows:Title><ows:Abstract>'+layername+'</ows:Abstract>'
    xml+='<ows:WGS84BoundingBox><ows:LowerCorner>-7.1567 40.6712</ows:LowerCorner><ows:UpperCorner>11.578 51.9948</ows:UpperCorner></ows:WGS84BoundingBox>'
    xml+='<ows:Identifier>'+layername+'</ows:Identifier>'
    xml+='<Style isDefault="true"><ows:Title>Légende générique</ows:Title><ows:Abstract>Fichier de légende générique – pour la compatibilité avec certains systèmes</ows:Abstract>'
    xml+='<ows:Keywords><ows:Keyword>Défaut</ows:Keyword></ows:Keywords>'
    xml+='<ows:Identifier>normal</ows:Identifier>'
    xml+='<LegendURL format="image/jpeg" height="200" maxScaleDenominator="100000000" minScaleDenominator="200" width="200" xlink:href="https://wxs.ign.fr/static/legends/LEGEND.jpg"/></Style>'
    xml+='<Format>'+format+'</Format>'
    xml+='<TileMatrixSetLink><TileMatrixSet>LAMB93</TileMatrixSet>'
    xml+='<TileMatrixSetLimits>'+exportTileLimits(layername)+'</TileMatrixSetLimits>'
    xml+='</TileMatrixSetLink>'
    xml+='</Layer>'
    return xml

with open('Capabilities_part1.xml') as f:
    print(f.read())
print(exportLayer('ortho'))
print(exportLayer('graph'))
with open('Capabilities_part2.xml') as f:
    print(f.read())
