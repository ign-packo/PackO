# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import argparse
import json
import platform
import time


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "-i", "--input", required=True,
        help="input data folder (created by prep_vectorise_graph.py)")
    parser.add_argument(
        "-o", "--output", required=True, help="output json gpao filepath"
    )
    parser.add_argument(
        "-g", "--graph", help="output vectorised graph pathfile (default: OUTPUT.gpkg)",
        default=None
    )
    parser.add_argument(
        "-v", "--verbose", help="verbose (default: 0)", type=int, default=0
    )
    args = parser.parse_args()

    if args.graph is None:
        args.graph = args.output.split('.')[0] + '.gpkg'

    if args.verbose >= 1:
        print("\nArguments: ", args)

    return args


args = read_args()

# define working dir
os.chdir(os.path.dirname(args.output))
if args.verbose > 0:
    print("Working directory: '" + os.getcwd() + "'")
# redefine input directory
try:
    # we always want to use absolute path because it will be processed in GPAOv2
    # (no relative path possible because the exec instance is generated within the GPAOv2)
    args.input = os.path.abspath(args.input)
except ValueError:
    print("No absolute path possible for input")

# check if input dir exists
if not os.path.exists(args.input):
    raise SystemExit("Directory " + args.input + " does not exist.")

t_start = time.perf_counter()

chantier_name = os.path.basename(args.output.split('.')[0])
if args.verbose > 0:
    print('Chantier name = ' + chantier_name)

dict_cmd = {"projects": []}

# debut chantier polygonize
dict_cmd["projects"].append({"name": str(chantier_name+'_polygonize'), "jobs": []})

script = "gdal_polygonize.py"
if platform.system() == "Windows":
    script = script.split('.')[0]+".bat"

tiles_dir = os.path.join(args.input, "tiles")
gpkg_dir = os.path.join(args.input, "gpkg")

if not os.path.exists(gpkg_dir):
    os.mkdir(gpkg_dir)

# on recupere la liste des tuiles creees
list_tiles_graph = os.listdir(tiles_dir)

QGIS_BIN=os.environ.get('QGIS_BIN')
QGIS_SCRIPT=os.environ.get('QGIS_SCRIPT')

# on vectorise chaque tuile separement
for tile in list_tiles_graph:
    if args.verbose > 0:
        print(tile)
    gpkg_path = os.path.join(gpkg_dir, tile.split('.')[0] + '.gpkg')
    if os.path.exists(gpkg_path):
        print('Le fichier '+gpkg_path+' existe déjà. On le supprime avant de relancer le calcul.')
        os.remove(gpkg_path)
    cmd_polygonize = (
            '\"'
            + os.path.join(QGIS_SCRIPT, script)
            + '\"' + ' '
            + os.path.join(tiles_dir, tile) + ' '
            + gpkg_path
            + ' -f "GPKG" '
            + '-mask ' + os.path.join(tiles_dir, tile)
    )
    if args.verbose > 0:
        print(cmd_polygonize)
    dict_cmd["projects"][0]["jobs"].append({"name": "polygonize", "command": cmd_polygonize})

# fin chantier polygonize

# debut chantier merge
# le traitement est divise en deux chantiers de GPAO avec le second dependant du premier
# le premier (chantier polygonize) contient l'ensemble des gdal_polygonize
# le second (chantier merge) va contenir les traitements permettant de passer des geopackages calcules par dalle
# a un geopackage global pour toute l'emprise de notre chantier
dict_cmd["projects"].append({"name": str(chantier_name+'_merge'), "jobs": [], "deps": [{"id": 0}]})

script_merge = "ogrmerge.py"
if platform.system() == "Windows":
    script_merge = script_merge.split('.')[0]+".bat"

merge_file = chantier_name + '_merge.gpkg'
merge_path = os.path.join(args.input, merge_file)
all_gpkg = os.path.join(gpkg_dir, '*.gpkg')
cmd_merge = (
    '\"'
    + os.path.join(QGIS_SCRIPT, script_merge)
    + '\"'
    + ' -o ' + merge_path
    + ' ' + all_gpkg
    + ' -single'
    + ' -field_strategy Union'
    + ' -overwrite_ds'
)
if args.verbose > 0:
    print(cmd_merge)
dict_cmd["projects"][1]["jobs"].append({"name": "ogrmerge", "command": cmd_merge})

dissolve_file = chantier_name + '_dissolve.gpkg'
dissolve_path = os.path.join(args.input, dissolve_file)
cmd_dissolve = (
    '\"'
    + os.path.join(QGIS_BIN, 'ogr2ogr')
    + '\"' + ' '
    + dissolve_path + ' '
    + merge_path
    + ' -nlt PROMOTE_TO_MULTI'
    + ' -dialect sqlite'
    + ' -sql "SELECT DN, ST_union(geom) as geom FROM merged GROUP BY DN"'
)
if args.verbose > 0:
    print(cmd_dissolve)
dict_cmd["projects"][1]["jobs"].append({"name": "dissolve", "command": cmd_dissolve, "deps": [{"id": 0}]})

cmd_make_valid = (
    '\"'
    + os.path.join(QGIS_BIN, 'ogr2ogr')
    + '\"' + ' '
    + args.output.split('.')[0] + '_final.gpkg '
    + dissolve_path
    + ' -overwrite'
    + ' -nlt PROMOTE_TO_MULTI'
    + ' -makevalid'
)
if args.verbose > 0:
    print(cmd_make_valid)
dict_cmd["projects"][1]["jobs"].append({"name": "make_valid", "command": cmd_make_valid, "deps": [{"id": 1}]})

# fin chantier merge

json_file = args.output
out_file = open(json_file, "w")
json.dump(dict_cmd, out_file, indent=4)
out_file.close()

t_end = time.perf_counter()

# temps de calcul total
if args.verbose > 0:
    print('Temps global du calcul :'+str(round(t_end-t_start, 2)))
