# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import argparse
from osgeo import gdal


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", required=True, help="input cache folder")
    parser.add_argument("-o", "--output", help="output file (default : .\list_files.txt)", default="list_files")

    parser.add_argument("-v", "--verbose", help="verbose (default: 0)", type=int, default=0)
    args = parser.parse_args()

    if args.verbose >= 1:
        print("\nArguments: ", args)

    return args


args = read_args()

graph_dir = args.input+"/graph"
fOut = open(args.output+"_"+os.path.basename(args.input).split('.')[0]+".txt", "w")

for (root, dirs, files) in os.walk(graph_dir):
    for file in files:
        file = os.path.join(root, file)
        fOut.write(file + "\n")
        print(file)

fOut.close()
