# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import argparse
import json
import platform
import time
import shutil
from cache_def import get_slab_path
from osgeo import gdal


QGISBIN="C:\\QGIS_3.20.2\\bin"

def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", required=True, help="input cache folder")
    parser.add_argument(
        "-o", "--output", help="output folder (default : .)", default="."
    )
    parser.add_argument(
        "-b", "--branch", help="id of branch of cache to use as source for patches (default: None)",
        default=None
    )
    parser.add_argument(
        "-p", "--patches", required=True, help="file containing patches on the branch to export"
    )
    parser.add_argument(
        "-t", "--tilesize", help="tile size (in pixels) for vectorising graph tiles (default: 100000)", type=int,
        default=100000
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
resol = overviews['resolution']

cache_name = os.path.basename((os.path.normpath(args.input)))
print('Cache name = ' + cache_name)

dict_cmd = {"projects": [{"name": str(cache_name+'_prep'), "jobs": []}]}
print(dict_cmd["projects"][0]["name"])

# on recupere les infos concernant les patches dans le json en entree
file_patches = open(args.patches)
patches_data = json.load(file_patches)
file_patches.close()
patches = patches_data['features']

id_branch_patch = None
list_patches = list()
for patch in patches:
    if patch['properties']['active'] is True:
        slabs = patch['properties']['slabs']
        id_branch_patch = patch['properties']['id_branch']
        for slab in slabs:
            x = slab[0]
            y = slab[1]

            slab_path = get_slab_path(int(x), int(y), int(path_depth))
            tile_path = os.path.join(args.input, 'graph', str(level), slab_path[1:])
            list_patches.append(os.path.normpath(tile_path+'.tif'))

if args.branch and id_branch_patch and int(args.branch) != id_branch_patch:
    raise SystemExit('** ERREUR: '
                     'Pas de correspondance entre la branche indiquée (%s) '
                     'et celle des retouches (%s) !' % (args.branch, id_branch_patch))

if args.branch and not id_branch_patch:
    raise SystemExit('** ERREUR: '
                     'Branche de retouches indiquée (%s), mais aucune retouche !'
                     % args.branch)

if not args.branch and id_branch_patch:
    print("** La branche de retouches traitée est : " + str(id_branch_patch))
    args.branch = str(id_branch_patch)

graph_dir = os.path.join(args.input, 'graph', str(level))

# on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
list_tiles = list()
for (root, dirs, files) in os.walk(graph_dir):
    for file in files:
        file = os.path.join(root, file)
        list_tiles.append(os.path.normpath(file))

# fichier intermediaire contenant la liste de images pour le vrt
path_out = os.path.join(args.output, os.path.basename(args.input))
f_out = open(path_out + '.txt', 'w')

for tile in list_tiles:
    # il faut filtrer uniquement les tuiles presente a l'origine
    # on recupere juste le nom de la dalle sans extension -> 2 caracteres
    filename = os.path.basename(tile).split('.')[0]
    if len(filename) > 2:  # cas des tuiles avec retouche
        continue
    if tile in list_patches:
        # dans ce cas il faut ajouter la tuile index_branche + tilename a la liste
        tile_path = os.path.join(os.path.dirname(tile), str(args.branch)+'_'+os.path.basename(tile))
        f_out.write(tile_path+'\n')
    else:
        # on ajoute la tuile d'origine dans la liste pour creer le vrt
        f_out.write(tile+'\n')

f_out.close()

t_end_prep = time.perf_counter()

t_start_vrt1 = time.perf_counter()

# on construit un vrt a partir de la liste des images recuperee precedemment
cmd_buildvrt = (
    os.path.join(QGISBIN, 'gdalbuildvrt')
    + ' -input_file_list '
    + path_out + '.txt '
    + path_out + '_tiles.vrt'
    + ' -tap'
    + ' -tr ' + str(resol) + ' ' + str(resol) + ' '
)
print('Gdalbuildvrt en cours...')
if args.verbose > 0:
    print(cmd_buildvrt)
os.system(cmd_buildvrt)

dict_cmd["projects"][0]["jobs"].append({"name": "buildvrt", "command": cmd_buildvrt})
print(dict_cmd)

t_end_vrt1 = time.perf_counter()

t_start_vrt2 = time.perf_counter()

# on construit un 2eme vrt à partir du premier (pour avoir la bonne structure avec les bons parametres :
# notamment l emprise)
cmd_buildvrt2 = (
    os.path.join(QGISBIN, 'gdalbuildvrt ')
    + path_out + '_tmp.vrt '
    + path_out + '_tiles.vrt'
)
print('Gdalbuildvrt en cours...')
if args.verbose > 0:
    print(cmd_buildvrt2)
os.system(cmd_buildvrt2)

dict_cmd["projects"][0]["jobs"].append({"name": "buildvrt2", "command": cmd_buildvrt2, "deps": [{"id": 0}]})
print(dict_cmd)

t_end_vrt2 = time.perf_counter()

# en faire un script pout l'integrer dans le json de gpao
script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modifyvrt.py")

cmd_modifyvrt = (
    'python ' + script_path + ' '
    + '-i ' + path_out + '_tmp.vrt '
    + '-o ' + path_out + '_32bits.vrt'
)

dict_cmd["projects"][0]["jobs"].append({"name": "modifyvrt", "command": cmd_modifyvrt, "deps": [{"id": 1}]})
print(cmd_modifyvrt)

tmp_dir = os.path.join(args.output, 'tmp')
if not os.path.exists(tmp_dir):
    os.mkdir(tmp_dir)

t_start_tiling = time.perf_counter()

# on recupere l'emprise globale du chantier dont on veut extraire xmin, xmax, ymin, ymax
info = gdal.Info(path_out + '_32bits.vrt')
print("info = "+str(info))
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
        file = str(x) + '_' + str(y) + '.vrt'
        cmd_vrt = (
            os.path.join(QGISBIN, 'gdalbuildvrt ')
            + os.path.join(tmp_dir, file) + ' '
            + path_out + '_32bits.vrt'
            + ' -tr ' + str(resol) + ' ' + str(resol)
            + ' -te ' + str(x) + ' ' + str(y) + ' ' + str(x+tile_size) + ' ' + str(y+tile_size)
        )
        print('Gdalbuildvrt en cours...')
        if args.verbose > 0:
            print(cmd_vrt)
        os.system(cmd_vrt)

t_end_tiling = time.perf_counter()

# fin prep chantier polygonize

# debut chantier polygonize
dict_cmd["projects"].append({"name": str(cache_name+'_polygonize'), "jobs": [], "deps": [{"id": 0}]})

# on recupere la liste des tuiles creees
list_tiles_graph = os.listdir(tmp_dir)

script = "gdal_polygonize.py"
if platform.system() == "Windows":
    script = script.split('.')[0]+".bat"

t_start_polygonise = time.perf_counter()

# on vectorise chaque tuile separement
for tile in list_tiles_graph:
    tile_gpkg = tile.split('.')[0] + '.gpkg'
    gpkg_path = os.path.join(tmp_dir, tile_gpkg)
    if os.path.exists(gpkg_path):
        os.remove(gpkg_path)
    cmd_polygonize = (
            os.join.path(QGISBIN, script) + ' '
            + os.path.join(tmp_dir, tile) + ' '
            + gpkg_path
            + ' -f "GPKG" '
            + '-mask ' + os.path.join(tmp_dir, tile)
    )
    print('Gdal_polygonize en cours...')
    if args.verbose > 0:
        print(cmd_polygonize)
    dict_cmd["projects"][1]["jobs"].append({"name": "polygonize", "command": cmd_polygonize})
    os.system(cmd_polygonize)

t_end_polygonise = time.perf_counter()

# fin chantier polygonize

# debut chantier merge
dict_cmd["projects"].append({"name": str(cache_name+'_merge'), "jobs": [], "deps": [{"id": 1}]})

script_merge = "ogrmerge.py"
if platform.system() == "Windows":
    script_merge = script_merge.split('.')[0]+".bat"

t_start_merge = time.perf_counter()

merge_file = cache_name + '_merge.gpkg'
merge_path = os.path.join(tmp_dir, merge_file)
all_gpkg = os.path.join(tmp_dir, '*.gpkg')
cmd_merge = (
    os.path.join(QGISBIN, script_merge)
    + ' -o ' + merge_path
    + ' ' + all_gpkg
    + ' -single'
    + ' -field_strategy Union'
)
print('Ogrmerge en cours...')
if args.verbose > 0:
    print(cmd_merge)
dict_cmd["projects"][2]["jobs"].append({"name": "ogrmerge", "command": cmd_merge})
os.system(cmd_merge)

t_end_merge = time.perf_counter()

t_start_dissolve = time.perf_counter()

dissolve_file = cache_name + '_dissolve.gpkg'
dissolve_path = os.path.join(tmp_dir, dissolve_file)
cmd_dissolve = (
    os.path.join(QGISBIN, 'ogr2ogr ')
    + dissolve_path + ' '
    + merge_path
    + ' -nlt PROMOTE_TO_MULTI'
    + ' -dialect sqlite'
    + ' -sql "SELECT DN, ST_union(geom) as geom FROM merged GROUP BY DN"'
)
print('Ogr2ogr - dissolve en cours...')
if args.verbose > 0:
    print(cmd_dissolve)
dict_cmd["projects"][2]["jobs"].append({"name": "dissolve", "command": cmd_dissolve, "deps": [{"id": 0}]})
os.system(cmd_dissolve)

t_end_dissolve = time.perf_counter()

t_start_make_valid = time.perf_counter()

valid_file = cache_name + '.gpkg'
valid_path = os.path.join(args.output, valid_file)
cmd_make_valid = (
    os.path.join(QGISBIN, 'ogr2ogr ')
    + valid_path + ' '
    + dissolve_path
    + ' -nlt PROMOTE_TO_MULTI'
    + ' -makevalid'
)
print('Ogr2ogr - make_valid en cours...')
if args.verbose > 0:
    print(cmd_make_valid)
dict_cmd["projects"][2]["jobs"].append({"name": "make_valid", "command": cmd_make_valid, "deps": [{"id": 1}]})
os.system(cmd_make_valid)

t_end_make_valid = time.perf_counter()

print('Nettoyage des fichiers temporaires...')
if os.path.exists(path_out + '.txt'):
    os.remove(path_out + '.txt')
if os.path.exists(tmp_dir) and os.path.exists(valid_path):
    shutil.rmtree(tmp_dir)

print(dict_cmd)
json_file = os.path.join(args.output, cache_name + '.json')
print(json_file)
out_file = open(json_file, "w")
json.dump(dict_cmd, out_file, indent=4)
print('Fin\n')

t_end = time.perf_counter()

# temps de calcul des differentes etapes
if args.verbose > 0:
    print('Temps de preparation du calcul :'+str(round(t_end_prep-t_start_prep, 2)))
    print('Temps de calcul VRT1 :'+str(round(t_end_vrt1-t_start_vrt1, 2)))
    print('Temps de calcul VRT2 :'+str(round(t_end_vrt2-t_start_vrt2, 2)))
    print('Temps de calcul tiling :'+str(round(t_end_tiling-t_start_tiling, 2)))
    print('Temps de calcul polygonise :'+str(round(t_end_polygonise-t_start_polygonise, 2)))
    print('Temps de calcul merge :'+str(round(t_end_merge-t_start_merge, 2)))
    print('Temps de calcul dissolve :'+str(round(t_end_dissolve-t_start_dissolve, 2)))
    print('Temps de calcul make_valid :'+str(round(t_end_make_valid-t_start_make_valid, 2)))
    print('Temps global du calcul :'+str(round(t_end-t_start, 2)))
