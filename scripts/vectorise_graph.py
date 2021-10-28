# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import argparse
import json
import platform
import time
from cache_def import get_slab_path

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
try:
    args.input = os.path.relpath(args.input, start=args.output)
except ValueError:
    print("No relative path, absolute path is used instead")
    args.input = os.path.abspath(args.input)
print("Updated input path relative to working dir: '" + args.input + "'")


# check if input dir exists
if not os.path.exists(args.input):
    raise SystemExit("Directory " + args.input + " does not exist.")

t_start = time.perf_counter()

t_start_prep = time.perf_counter()

# lecture du fichier overviews pour recuperer les infos du cache
fileOverviews = open(os.path.join(args.input, "overviews.json"))
overviews = json.load(fileOverviews)
fileOverviews.close()

path_depth = overviews['pathDepth']
level = overviews['level']['max']

# valeur par defaut pour verifier l'existance de la branche desiree apres recherche
id_branch = args.branch

# on recupere les infos concernant les patches dans le json en entree
file_patches = open(args.patches)
patches_data = json.load(file_patches)
file_patches.close()
patches = patches_data['features']

list_patches = list()
for patch in patches:
    if patch['properties']['active'] is True:
        slabs = patch['properties']['slabs']
        for slab in slabs:
            x = slab[0]
            y = slab[1]

            slab_path = get_slab_path(int(x), int(y), int(path_depth))
            tile_path = os.path.join(args.input, 'graph', str(level), slab_path[1:])
            list_patches.append(os.path.normpath(tile_path+'.tif'))

graph_dir = os.path.join(args.input, 'graph', str(level))

# on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
list_tiles = list()
for (root, dirs, files) in os.walk(graph_dir):
    for file in files:
        file = os.path.join(root, file)
        list_tiles.append(os.path.normpath(file))

# fichier intermediaire contenant la liste de images pour le vrt
path_out = os.path.basename(args.input)
f_out = open(path_out + '.txt', 'w')

for tile in list_tiles:
    # il faut filtrer uniquement les tuiles presente a l'origine
    # on recupere juste le nom de la dalle sans extension -> 2 caracteres
    filename = os.path.basename(tile).split('.')[0]
    if len(filename) > 2:  # cas des tuiles avec retouche
        continue
    if tile in list_patches:
        # dans ce cas il faut ajouter la tuile index_branche + tilename a la liste
        tile_path = os.path.join(os.path.dirname(tile), str(id_branch)+'_'+os.path.basename(tile))
        f_out.write(tile_path+'\n')
    else:
        # on ajoute la tuile d'origine dans la liste pour creer le vrt
        f_out.write(tile+'\n')

f_out.close()

t_end_prep = time.perf_counter()

t_start_vrt1 = time.perf_counter()

# on construit un vrt a partir de la liste des images recuperee precedemment
cmd_buildvrt = (
    "gdalbuildvrt"
    + " -input_file_list "
    + path_out + ".txt "
    + path_out + "_tiles.vrt"
)
print(cmd_buildvrt)
os.system(cmd_buildvrt)

t_end_vrt1 = time.perf_counter()

t_start_vrt2 = time.perf_counter()

# on construit un 2eme vrt à partir du premier (pour avoir la bonne structure avec les bons parametres :
# notamment l emprise)
cmd_buildvrt2 = (
    'gdalbuildvrt '
    + path_out + '_tmp.vrt '
    + path_out + '_tiles.vrt'
)
print(cmd_buildvrt2)
os.system(cmd_buildvrt2)

t_end_vrt2 = time.perf_counter()

with open(path_out + '_tmp.vrt', 'r') as f:
    lines = f.readlines()
with open(path_out + '_32bits.vrt', 'w') as f:
    for line in lines:
        # on ecrit le code python au bon endroit dans le VRT
        if 'band="1"' in line:
            f.write('\t<VRTRasterBand dataType="Int32" band="1" subClass="VRTDerivedRasterBand">\n')
            f.write('\t<PixelFunctionType>color_to_int32</PixelFunctionType>\n')
            f.write('\t<PixelFunctionLanguage>Python</PixelFunctionLanguage>\n')
            f.write('\t<PixelFunctionCode>\n')
            f.write('<![CDATA[\n')
            f.write('import numpy as np\n')
            f.write('def color_to_int32(in_ar, out_ar, xoff, yoff, xsize, ysize, raster_xsize, raster_ysize, buf_radius, gt, **kwargs):\n')
            f.write('\tout_ar[:] = in_ar[0] + 256 * in_ar[1] + 256 * 256 * in_ar[2]\n')
            f.write(']]>\n')
            f.write('\t</PixelFunctionCode>\n')
        elif 'band="2"' in line:
            print('Skipping line '+line.strip('\n'))
        elif 'band="3"' in line:
            print('Skipping line '+line.strip('\n'))
        elif '</VRTRaster' in line:
            print('Skipping line '+line.strip('\n'))
        elif '<OverviewList' in line:
            f.write('\t</VRTRasterBand>\n')
            f.write(line)
        else:
            f.write(line)

script = "gdal_polygonize.py"
if platform.system() == "Windows":
    script = script.split('.')[0]+".bat"

t_start_polygonise = time.perf_counter()

# on vectorise le graphe à partir du vrt
cmd_polygonize = (
    script + ' '
    + path_out + '_32bits.vrt '
    + path_out + '.geojson'
    + ' -f "Geojson" '
    + '-mask ' + path_out + '_32bits.vrt'
)
print(cmd_polygonize)
os.system(cmd_polygonize)

t_end_polygonise = time.perf_counter()

print('Nettoyage des fichiers temporaires...')
if os.exists(path_out + '.txt'):
    os.remove(path_out + '.txt')

print('Fin\n')

t_end = time.perf_counter()

#temps de calcul des differentes etapes
print('Temps de preparation du calcul :'+str(t_end_prep-t_start_prep))
print('Temps de calcul VRT1 :'+str(t_end_vrt1-t_start_vrt1))
print('Temps de calcul VRT2 :'+str(t_end_vrt2-t_start_vrt2))
print('Temps de calcul polygonise :'+str(t_end_polygonise-t_start_polygonise))
print('Temps global du calcul :'+str(t_end-t_start))
