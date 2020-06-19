import sys
import getopt
import json
import gdal
import math
import os
import json
import cv2 as cv

def getColor(cacheDir, X, Y, Z, i, j, l):
    tile = os.path.join(cacheDir,str(Z), str(Y), str(X), l)
    color = [0, 0, 0]
    if (os.path.exists(tile)):
        graph=cv.imread(tile)
        c = graph[j,i]
        color = [int(c[2]), int(c[1]), int(c[0])]
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