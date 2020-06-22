import sys
import getopt
import json
import gdal
import numpy as np
import math
import os
import json

def getColor(cacheDir, X, Y, Z, i, j, l):
    tile = os.path.join(cacheDir,str(Z), str(Y), str(X), l)
    color = [0, 0, 0]
    if (os.path.exists(tile)):
        input = gdal.Open(tile)
        bands = [input.GetRasterBand(i) for i in range(1, input.RasterCount + 1)]
        graph = [band.ReadAsArray() for band in bands]
        graph = np.transpose(graph, [1, 2, 0])  # Reorders dimensions, so that channels are last
        c = graph[j, i]
        color = [int(c[0]), int(c[1]), int(c[2])]
    return {"color": color }

def usage():
    print('getFeatureInfo.py -C cacheDir -X <int> -Y <int> -Z <int> -i <int> -j <int> -l string')

def main(argv):
    try:
        opts, args = getopt.getopt(argv, "hC:X:Y:Z:i:j:l:", ["help", "cacheDir=", "X=", "Y=", "Z", "i=", "j=", "l="])
    except getopt.GetoptError:
        usage()
        sys.exit(2)

    cacheDir = "cache3"
    X=None
    Y=None
    Z=None
    i=None
    j=None
    l="graph.png"
    for opt, arg in opts:
        if (opt == '-h'):
            usage()
            sys.exit()
        if (opt == '-X'):
            X = int(arg)
        if (opt == '-Y'):
            Y = int(arg)
        if (opt == '-Z'):
            Z = int(arg)
        if (opt == '-C'):
            cacheDir = arg
        if (opt == '-i'):
            i = int(arg)
        if (opt == '-j'):
            j = int(arg)
        if (opt == '-l'):
            l = arg
        
    print(json.dumps(getColor(cacheDir, X, Y, Z, i, j, l)))

if __name__ == "__main__":
    main(sys.argv[1:])