import sys
import getopt
import json
import gdal
import math
import os
import cv2 as cv

def getColor(cacheDir, X, Y, R, x, y):
    # il faut trouver la tuile
    Px = (x-X)/R
    Py = (Y-y)/R
    Tx = math.floor(Px/256)
    Ty = math.floor(Py/256)
    tile_root = os.path.join(cacheDir,str(Ty),str(Tx))
    # print(tile_root)
    color = [0, 0, 0]
    if (os.path.exists(tile_root)):
        graph=cv.imread(os.path.join(tile_root,'graph.png'))
        color = graph[int(Py-256*Ty),int(Px-256*Tx)]
        # cliche = cache[color[2]][color[1]][color[0]]
    return {'color': color }

def usage():
    print('getCliche.py -C cacheDir -X <float> -Y <float> -R <float> -x <float> -y <float>')

def main(argv):
    try:
        opts, args = getopt.getopt(argv, "hC:X:Y:x:y:R:", ["help", "cacheDir=", "X=", "Y=", "x=", "y=", "R="])
    except getopt.GetoptError:
        usage()
        sys.exit(2)

    cacheDir = None
    X=None
    Y=None
    x=None
    y=None
    R=None
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
        
    print(getColor(cacheDir, X, Y, R, x, y))

if __name__ == "__main__":
    main(sys.argv[1:])