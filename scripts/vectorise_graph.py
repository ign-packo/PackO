# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import argparse


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", required=True, help="input cache folder")
    parser.add_argument(
        "-o", "--output", help="output folder (default : .)", default="."
    )

    parser.add_argument(
        "-v", "--verbose", help="verbose (default: 0)", type=int, default=0
    )
    args = parser.parse_args()

    if args.verbose >= 1:
        print("\nArguments: ", args)

    return args


args = read_args()

pathOut = os.path.join(args.output, os.path.basename(args.input).split(".")[0] + ".txt")

graph_dir = args.input + "/graph"
fOut = open(pathOut, "w")

# on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
for (root, dirs, files) in os.walk(graph_dir):
    for file in files:
        file = os.path.join(root, file)
        fOut.write(file + "\n")

fOut.close()

# on construit un vrt a partir de la liste des images recuperee precedemment
GDAL_BIN = "C:\\Users\\nlenglet\\.conda\\envs\\packo\\Library\\bin"
buildvrt_exe = os.path.join(GDAL_BIN, "gdalbuildvrt")

cmd_buildvrt = (
    buildvrt_exe + " -input_file_list " + pathOut + " " + pathOut.split(".")[0] + ".vrt"
)

os.system(cmd_buildvrt)

# on vectorise le graphe à partir du vrt
GDAL_SCRIPT_ROOT = "C:\\Users\\nlenglet\\.conda\\envs\\packo\\Scripts"
polygonize_exe = os.path.join(GDAL_SCRIPT_ROOT, "gdal_polygonize.py")

cmd_polygonize = (
    "python "
    + polygonize_exe
    + " "
    + pathOut.split(".")[0]
    + ".vrt "
    + pathOut.split(".")[0]
    + '.geojson -f "Geojson"'
)
os.system(cmd_polygonize)
