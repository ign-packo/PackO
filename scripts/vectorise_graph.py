# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import argparse
import json
from cache_def import get_slab_path
import platform


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", required=True, help="input cache folder")
    parser.add_argument(
        "-o", "--output", help="output folder (default : .)", default="."
    )
    parser.add_argument(
        "-b", "--branch", help="id of branch of cache to use as source (default: 0)",
        default=0
    )
    parser.add_argument(
        "-p", "--patches", required=True, help="file containing patches on the branch to export"
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


# lecture du fichier overviews pour recuperer les infos du cache
fileOverviews = open(os.path.join(args.input, "overviews.json"))
overviews = json.load(fileOverviews)
fileOverviews.close()

pathDepth = overviews['pathDepth']
level = overviews['level']['max']

# valeur par defaut pour verifier l'existance de la branche desiree apres recherche
id_branch = args.branch

# on recupere les infos concernant les patches dans le json en entree
filePatches = open(args.patches)
patchesData = json.load(filePatches)
filePatches.close()
patches = patchesData['features']

listPatches = list()
for patch in patches:
    if patch['properties']['active'] is True:
        slabs = patch['properties']['slabs']
        for slab in slabs:
            x = slab[0]
            y = slab[1]

            slab_path = get_slab_path(int(x), int(y), int(pathDepth))
            tile_path = os.path.join(args.input, "graph", str(level), slab_path[1:])
            listPatches.append(os.path.normpath(tile_path+".tif"))

graph_dir = os.path.join(args.input, "graph", str(level))

# on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
listTiles = list()
for (root, dirs, files) in os.walk(graph_dir):
    for file in files:
        file = os.path.join(root, file)
        listTiles.append(os.path.normpath(file))

# fichier intermediaire contenant la liste de images pour le vrt
path_out = os.path.basename(args.input)
f_out = open(path_out + '.txt', 'w')

for tile in listTiles:
    # il faut filtrer uniquement les tuiles presente a l'origine
    # on recupere juste le nom de la dalle sans extension -> 2 caracteres
    filename = os.path.basename(tile).split('.')[0]
    if len(filename) > 2:  # cas des tuiles avec retouche
        continue
    if tile in listPatches:
        print("il y a eu retouche")
        # dans ce cas il faut ajouter la tuile index_branche + tilename a la liste
        #path + index + "_" + basename.tif
        tilePath = os.path.join(os.path.dirname(tile), str(id_branch)+"_"+os.path.basename(tile))
        f_out.write(tilePath+'\n')
    else:
        print("pas de retouche")
        # on ajoute la tuile d'origine dans la liste pour creer le vrt
        f_out.write(tile+'\n')

f_out.close()

# on construit un vrt a partir de la liste des images recuperee precedemment
cmd_buildvrt = (
    "gdalbuildvrt"
    + " -a_srs EPSG:2154"
    + " -input_file_list "
    + path_out + ".txt "
    + path_out + ".vrt"
)
print(cmd_buildvrt)
os.system(cmd_buildvrt)

script = "gdal_polygonize.py"
if platform.system() == "Windows":
    script = script.split('.')[0]+".bat"

# on vectorise le graphe à partir du vrt
cmd_polygonize = (
    script + " "
    + path_out + ".vrt "
    + path_out + ".geojson"
    + ' -f "Geojson"'
)
print(cmd_polygonize)
os.system(cmd_polygonize)
