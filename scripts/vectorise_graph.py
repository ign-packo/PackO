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

try:
    os.mkdir(args.output)
except FileExistsError:
    print("Output dir already exists")

# define working dir
os.chdir(args.output)
print("Working directory: '" + os.getcwd() + "'")
# redefine input directory
args.input = os.path.relpath(args.input, args.output)
print("Updated input path relative to working dir: '" + args.input + "'")

path_out = os.path.basename(args.input)

graph_dir = args.input + "/graph"
f_out = open(path_out + ".txt", "w")

# on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
for (root, dirs, files) in os.walk(graph_dir):
    for file in files:
        file = os.path.join(root, file)
        f_out.write(file + "\n")

f_out.close()

# on construit un vrt a partir de la liste des images recuperee precedemment
cmd_buildvrt = (
    "gdalbuildvrt" + " -input_file_list "
    + path_out + ".txt "
    + path_out + ".vrt"
)
print(cmd_buildvrt)
os.system(cmd_buildvrt)

# on vectorise le graphe à partir du vrt
cmd_polygonize = (
    "gdal_polygonize.py "
    + path_out + ".vrt "
    + path_out + ".geojson"
    + ' -f "Geojson"'
)
print(cmd_polygonize)
os.system(cmd_polygonize)
