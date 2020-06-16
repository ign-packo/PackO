import glob
import json

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
            tileMatrixSetLimits[z] = tileMatrixSetLimit
    return tileMatrixSetLimits

def getSource(layername, url, format):
    source={}
    source["url"] = url
    source["projection"] = "EPSG:2154"
    source["networkOptions"] = {"crossOrigin": "anonymous"}
    source["format"] = format
    source["name"]= layername
    source["tileMatrixSet"]= "LAMBB93"
    source["tileMatrixSetLimits"]= exportTileLimits('ortho')
    return source


layer={}
layer["id"]="Ortho"
layer["source"]=  getSource("ortho", "http://localhost:8081/wmts", "image/jpeg")


with open('itowns/ortho.json', 'w') as outfile:
    json.dump(layer, outfile)

layer={}
layer["id"]="Graph"
layer["source"]=  getSource("graph", "http://localhost:8081/wmts", "image/png")
layer["name"]= "graph"
layer["tileMatrixSet"]= "LAMBB93"
layer["tileMatrixSetLimits"]= exportTileLimits('graph')

with open('itowns/graph.json', 'w') as outfile:
    json.dump(layer, outfile)
