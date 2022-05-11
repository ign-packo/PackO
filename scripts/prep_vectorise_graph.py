# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import argparse
import json
import time
from cache_def import get_slab_path
from osgeo import gdal


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-c", "--cache", required=True, help="input cache folder")
    parser.add_argument("-o", "--output", required=True, help="output folder")
    parser.add_argument("-b", "--branch",
                        help="id of branch of cache to use as source for patches (default: None)",
                        default=None)
    parser.add_argument("-p", "--patches",
                        required=True,
                        help="file containing patches on the branch to export")
    parser.add_argument("-t", "--tilesize",
                        help="tile size (in pixels) for vectorising graph tiles (default: 100000)",
                        type=int, default=100000)
    parser.add_argument("-v", "--verbose", help="verbose (default: 0)", type=int, default=0)
    args_prep = parser.parse_args()

    if args_prep.verbose >= 1:
        print("\nArguments: ", args_prep)

    return args_prep


args = read_args()

try:
    os.mkdir(args.output)
except FileExistsError:
    print("ERREUR : Le dossier de sortie existe déjà.")

# define working dir
os.chdir(args.output)
print(f"INFO : Le répertoire de travail est '{os.getcwd()}'")
# redefine input directory
try:
    args.cache = os.path.relpath(args.cache, start=args.output)
except ValueError:
    print("No relative path, absolute path is used instead")
    args.cache = os.path.abspath(args.cache)
print("Updated input path relative to working dir: '" + args.cache + "'")

# check if input dir exists
if not os.path.exists(args.cache):
    raise SystemExit("ERREUR : Le répertoire " + args.cache + " n'existe pas.")

t_start = time.perf_counter()

overviews_path = os.path.join(args.cache, "overviews.json")

# lecture du fichier overviews pour recuperer les infos du cache
try:
    with open(overviews_path, encoding='utf-8') as fileOverviews:
        overviews = json.load(fileOverviews)
except IOError:
    print(f"ERREUR: Le fichier '{overviews_path}' n'existe pas.")

if 'pathDepth' not in overviews:
    raise SystemExit(f"ERREUR: L'attribut 'pathDepth' n'existe pas dans '{overviews_path}'.")
path_depth = overviews['pathDepth']

if 'level' not in overviews:
    raise SystemExit(f"ERREUR: L'attribut 'level' n'existe pas dans '{overviews_path}'.")
if 'max' not in overviews['level']:
    raise SystemExit(f"ERREUR: L'attribut 'max' n'existe pas dans '{overviews_path}'.")
level = overviews['level']['max']

if 'resolution' not in overviews:
    raise SystemExit(f"ERREUR: L'attribut 'resolution' n'existe pas dans '{overviews_path}.")
resol = overviews['resolution']

cache_name = os.path.basename((os.path.normpath(args.cache)))
if args.verbose > 0:
    print(f"Cache name = '{cache_name}'")

# on recupere les infos concernant les patches dans le json en entree
with open(args.patches, encoding='utf-8') as file_patches:
    patches_data = json.load(file_patches)
if 'features' not in patches_data:
    raise SystemExit(f"ERROR: Attribute 'features' does not exist in '{args.patches}'.")
patches = patches_data['features']

id_branch_patch = None
list_patches = []
for patch in patches:
    if patch['properties']['active'] is True:
        slabs = patch['properties']['slabs']
        id_branch_patch = patch['properties']['id_branch']
        for slab in slabs:
            x = slab[0]
            y = slab[1]

            slab_path = get_slab_path(int(x), int(y), int(path_depth))
            tile_path = os.path.join(args.cache, 'graph', str(level), slab_path[1:])
            list_patches.append(os.path.abspath(tile_path+'.tif'))

if args.branch and id_branch_patch and int(args.branch) != id_branch_patch:
    raise SystemExit(f"** ERREUR: "
                     f"Pas de correspondance entre la branche indiquée '{args.branch}' "
                     f"et celle des retouches '{id_branch_patch}' !")

if args.branch and not id_branch_patch:
    raise SystemExit(f"** ERREUR: "
                     f"Branche de retouches indiquée '{args.branch}', mais aucune retouche !")

if not args.branch and id_branch_patch:
    print(f"** La branche de retouches traitée est : '{id_branch_patch}'")
    args.branch = str(id_branch_patch)

graph_dir = os.path.join(args.cache, 'graph', str(level))

# on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
list_tiles = []
for (root, dirs, files) in os.walk(graph_dir):
    for file in files:
        file = os.path.join(root, file)
        list_tiles.append(os.path.abspath(file))

# fichier intermediaire contenant la liste de images pour le vrt
path_out = os.path.join(args.output, os.path.basename(args.cache))
with open(path_out + '.txt', 'w', encoding='utf-8') as f_out:
    for tile in list_tiles:
        if args.verbose > 0:
            print(f"tile : '{tile}'")
        # il faut filtrer uniquement les tuiles presentes a l'origine
        # on recupere juste le nom de la dalle sans extension -> 2 caracteres
        filename = os.path.basename(tile).split('.')[0]

        if len(filename) > 2:  # cas des tuiles avec retouche
            continue
        if tile in list_patches:
            # dans ce cas il faut ajouter la tuile index_branche + tilename a la liste
            tilename = os.path.basename(tile)
            tile_path = os.path.join(os.path.dirname(tile), str(args.branch)+'_'+tilename)
            f_out.write(tile_path+'\n')
        else:
            # on ajoute la tuile d'origine dans la liste pour creer le vrt
            f_out.write(tile+'\n')

# on construit un vrt a partir de la liste des images recuperee precedemment
cmd_buildvrt = (
    'gdalbuildvrt'
    + ' -input_file_list '
    + path_out + '.txt '
    + path_out + '_graphTiles.vrt'
    + ' -tap'
    + ' -tr ' + str(resol) + ' ' + str(resol) + ' '
)
if args.verbose > 0:
    print(cmd_buildvrt)
os.system(cmd_buildvrt)

# on construit un 2eme vrt à partir du premier
# (pour avoir la bonne structure avec les bons parametres : notamment l'emprise)
cmd_buildvrt2 = (
    'gdalbuildvrt '
    + path_out + '_tmp.vrt '
    + path_out + '_graphTiles.vrt'
)
if args.verbose > 0:
    print(cmd_buildvrt2)
os.system(cmd_buildvrt2)

# modification du VRT pour passage 32bits
with open(path_out + '_tmp.vrt', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with open(path_out + '_32bits.vrt', 'w', encoding='utf-8') as f:
    for line in lines:
        # on ecrit le code python au bon endroit dans le VRT
        if 'band="1"' in line:
            f.write('\t<VRTRasterBand dataType="Int32" band="1" subClass="VRTDerivedRasterBand">\n')
            f.write('\t<PixelFunctionType>color_to_int32</PixelFunctionType>\n')
            f.write('\t<PixelFunctionLanguage>Python</PixelFunctionLanguage>\n')
            f.write('\t<PixelFunctionCode>\n')
            f.write('<![CDATA[\n')
            f.write('import numpy as np\n')
            f.write('def color_to_int32(in_ar, out_ar, xoff, yoff, xsize, ysize, \
                    raster_xsize, raster_ysize, buf_radius, gt, **kwargs):\n')
            f.write('\tout_ar[:] = in_ar[0] + 256 * in_ar[1] + 256 * 256 * in_ar[2]\n')
            f.write(']]>\n')
            f.write('\t</PixelFunctionCode>\n')
        elif 'band="2"' in line:
            pass
        elif 'band="3"' in line:
            pass
        elif '</VRTRaster' in line:
            pass
        elif '<OverviewList' in line:
            f.write('\t</VRTRasterBand>\n')
            f.write(line)
        else:
            f.write(line)

tiles_dir = os.path.join(os.path.abspath(args.output), 'tiles')
if not os.path.exists(tiles_dir):
    os.mkdir(tiles_dir)

# on recupere l'emprise globale du chantier dont on veut extraire xmin, xmax, ymin, ymax
info = gdal.Info(path_out + '_32bits.vrt')
infoList = info.split('\n')

ul, lr = '', ''
for line in infoList:
    if 'Upper Left' in line:
        ul = line
    elif 'Lower Right' in line:
        lr = line

ul = ul.replace('(', '').replace(')', '').replace(',', '')
ul_split = ul.split(' ')
x_min = ul_split[5]
y_max = ul_split[6]

lr = lr.replace('(', '').replace(')', '').replace(',', '')
lr_split = lr.split(' ')
x_max = lr_split[4]
y_min = lr_split[5]

# ces valeurs vont servir a gerer l'ensemble des gdalbuildvrt sur le chantier
x_min = int(float(x_min) // 1000 * 1000)
y_min = int(float(y_min) // 1000 * 1000)

x_max = int((float(x_max) // 1000 + 1) * 1000)
y_max = int((float(y_max) // 1000 + 1) * 1000)

tile_size = int(resol * args.tilesize)

for x in range(x_min, x_max, tile_size):
    for y in range(y_min, y_max, tile_size):
        cmd_vrt = (
            'gdalbuildvrt '
            + os.path.join(tiles_dir, str(x) + '_' + str(y) + '.vrt') + ' '
            + path_out + '_32bits.vrt'
            + ' -tr ' + str(resol) + ' ' + str(resol)
            + ' -te ' + str(x) + ' ' + str(y) + ' ' + str(x+tile_size) + ' ' + str(y+tile_size)
        )
        if args.verbose > 0:
            print(cmd_vrt)
        os.system(cmd_vrt)

t_end = time.perf_counter()

# temps de calcul total
if args.verbose > 0:
    print(f"Temps global du calcul : {str(round(t_end-t_start, 2))}")
