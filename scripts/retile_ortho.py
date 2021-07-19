# -*- coding: utf-8 -*-
"""
Script pour retile les orthos a partir d'un cache COG
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
        "-of", "--format", help="output format (default: GTiff)", default="GTiff"
    )
    parser.add_argument(
        "-r", "--resampling", help="resampling method (default: near)", default="near"
    )
    parser.add_argument(
        "-e", "--resume", help="resume mode, generate only missing files"
    )
    parser.add_argument(
        "-ps", "--pixelsize", help="pixel size for output tiles(default: 2000)", default=2000
    )
    parser.add_argument(
        "-s", "--srs", help="spatial reference system (default: EPSG:2154)", default="EPSG:2154"
    )
    parser.add_argument(
        "-l", "--levels", help="number of pyramid levels to build (default: 3)", default=3
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

graph_dir = args.input + "/ortho"
f_out = open(path_out + ".txt", "w")

# on parcourt le repertoire ortho du cache pour recuperer l'ensemble des ortho
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
cmd_retile = (
    "gdal_retile.py "
    + "-targetDir " + path_out
    + path_out + ".vrt"
    + " -of " + args.format
    + " -r " + args.resampling
    + " -ps " + str(args.pixelsize)
    + " -s_srs " + args.srs
    + " -levels " + str(args.levels)
)
print(cmd_retile)
os.system(cmd_retile)
