import sys
import getopt
import json
import gdal
import numpy as np
import math
import os
import json

def getColor(cacheDir, X, Y, R, x, y):
    # print(cacheDir, X, Y, R, x, y)
    # il faut trouver la tuile
    Px = (x-X)/R
    Py = (Y-y)/R
    # print(Px, Py)
    Tx = math.floor(Px/256)
    Ty = math.floor(Py/256)
    # print(Tx, Ty)
    tile_root = os.path.join(cacheDir,str(Ty),str(Tx))
    # print(tile_root)
    color = [0, 0, 0]
    if (os.path.exists(os.path.join(tile_root,'graph.png'))):
        input = gdal.Open(os.path.join(tile_root,'graph.png'))
        bands = [input.GetRasterBand(i) for i in range(1, input.RasterCount + 1)]
        graph = [band.ReadAsArray() for band in bands]
        graph = np.transpose(graph, [1, 2, 0])  # Reorders dimensions, so that channels are last
        c = graph[int(Py-256*Ty),int(Px-256*Tx)]
        color = [int(c[0]), int(c[1]), int(c[2])]
    return {"color": color }

def usage():
    print('getColor.py -C cacheDir -X <float> -Y <float> -R <float> -x <float> -y <float>')

def main(argv):
    try:
        opts, args = getopt.getopt(argv, "hC:X:Y:x:y:R:", ["help", "cacheDir=", "X=", "Y=", "x=", "y=", "R="])
    except getopt.GetoptError:
        usage()
        sys.exit(2)

    cacheDir = "cache/21"
    X=0
    Y=12000000
    x=None
    y=None
    R=0.05
    for opt, arg in opts:
        if (opt == '-h'):
            usage()
            sys.exit()
        if (opt == '-X'):
            X = float(arg)
        if (opt == '-Y'):
            Y = float(arg)
        if (opt == '-C'):
            cacheDir = arg
        if (opt == '-x'):
            x = float(arg)
        if (opt == '-y'):
            y = float(arg)
        if (opt == '-R'):
            R = float(arg)
        
    print(json.dumps(getColor(cacheDir, X, Y, R, x, y)))

if __name__ == "__main__":
    main(sys.argv[1:])