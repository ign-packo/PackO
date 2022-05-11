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
    parser.add_argument("-i", "--input", required=True,
                        help="input data folder (created by prep_vectorise_graph.py)")
    parser.add_argument("-c", "--cache", required=True, help="cache folder")
    parser.add_argument("-o", "--output", required=True, help="output json gpao filepath")
    parser.add_argument("-g", "--graph",
                        help="output vectorised graph pathfile (default: OUTPUT.gpkg)",
                        default=None)
    parser.add_argument("-v", "--verbose", help="verbose (default: 0)", type=int, default=0)
    args_vectorise = parser.parse_args()

    if args_vectorise.graph is None:
        args_vectorise.graph = args_vectorise.output.split('.')[0] + '.gpkg'

    if args_vectorise.verbose >= 1:
        print("\nArguments: ", args_vectorise)

    return args_vectorise


args = read_args()

# define working dir
os.chdir(os.path.dirname(args.output))
print(f"INFO : Le répertoire de travail est '{os.getcwd()}'")
# redefine input directory
try:
    # we always want to use absolute path because it will be processed in GPAOv2
    # (no relative path possible because the exec instance is generated within the GPAOv2)
    args.input = os.path.abspath(args.input)
except ValueError:
    print("No absolute path possible for input")

# check if input dir exists
if not os.path.exists(args.input):
    raise SystemExit(f"ERREUR : Le répertoire '{args.input}' n'existe pas.")

t_start = time.perf_counter()

overviews_path = os.path.join(args.cache, "overviews.json")

# lecture du fichier overviews pour recuperer les infos du cache
try:
    with open(overviews_path, encoding='utf-8') as fileOverviews:
        overviews = json.load(fileOverviews)
except IOError:
    print(f"ERREUR: Le fichier '{overviews_path}' n'existe pas.")

PROJ = str(overviews['crs']['type']) + ':' + str(overviews['crs']['code'])

project_name = os.path.basename(args.output.split('.')[0])
if args.verbose > 0:
    print(f"Nom du chantier = '{project_name}'")

dict_cmd = {"projects": []}

# debut chantier polygonize
dict_cmd["projects"].append({"name": str(project_name+'_polygonize'), "jobs": []})

script = "gdal_polygonize.py"
if platform.system() == "Windows":
    script = script.split('.', maxsplit=1)[0]+".bat"

tiles_dir = os.path.join(args.input, "tiles")
gpkg_dir = os.path.join(args.input, "gpkg")

if not os.path.exists(gpkg_dir):
    os.mkdir(gpkg_dir)

# on recupere la liste des tuiles creees
list_tiles_graph = os.listdir(tiles_dir)

# on vectorise chaque tuile separement
for tile in list_tiles_graph:
    if args.verbose > 0:
        print(tile)
    gpkg_path = os.path.join(gpkg_dir, tile.split('.')[0] + '.gpkg')
    if os.path.exists(gpkg_path):
        print(f"Le fichier '{gpkg_path}' existe déjà. On le supprime avant de relancer le calcul.")
        os.remove(gpkg_path)
    cmd_polygonize = (
        script + ' '
        + os.path.join(tiles_dir, tile) + ' '
        + gpkg_path
        + ' -f "GPKG" '
        + '-mask ' + os.path.join(tiles_dir, tile)
    )
    if args.verbose > 0:
        print(cmd_polygonize)
    dict_cmd["projects"][0]["jobs"].append(
        {"name": "polygonize_"+tile.split('.')[0], "command": cmd_polygonize}
    )

# fin chantier polygonize

# debut chantier merge
# le traitement est divise en deux chantiers de GPAO avec le second dependant du premier
# le premier (chantier polygonize) contient l'ensemble des gdal_polygonize
# le second (chantier merge) va contenir les traitements
# permettant de passer des geopackages calcules par dalle
# a un geopackage global pour toute l'emprise de notre chantier
dict_cmd["projects"].append({"name": str(project_name+'_merge'), "jobs": [], "deps": [{"id": 0}]})

script_merge = "ogrmerge.py"
if platform.system() == "Windows":
    script_merge = script_merge.split('.', maxsplit=1)[0]+".bat"

merge_file = project_name + '_merge.gpkg'
merge_path = os.path.join(args.input, merge_file)
all_gpkg = os.path.join(gpkg_dir, '*.gpkg')
cmd_merge = (
    script_merge
    + ' -o ' + merge_path
    + ' ' + all_gpkg
    + ' -a_srs ' + PROJ
    + ' -nln data'
    + ' -single'
    + ' -field_strategy Union'
    + ' -overwrite_ds'
)
if args.verbose > 0:
    print(cmd_merge)
dict_cmd["projects"][1]["jobs"].append({"name": "ogrmerge", "command": cmd_merge})

clean_file = project_name + '_clean.gpkg'
clean_path = os.path.join(args.input, clean_file)
cmd_clean = (
        'ogr2ogr '
        + clean_path + ' '
        + merge_path
        + ' -overwrite'
        + ' -nlt PROMOTE_TO_MULTI'
        + ' -makevalid'
)
if args.verbose > 0:
    print(cmd_clean)
dict_cmd["projects"][1]["jobs"].append(
    {"name": "clean", "command": cmd_clean, "deps": [{"id": 0}]}
)

dissolve_file = project_name + '_dissolve.gpkg'
dissolve_path = os.path.join(args.input, dissolve_file)
cmd_dissolve = (
    'ogr2ogr '
    + dissolve_path + ' '
    + merge_path
    + ' -nlt PROMOTE_TO_MULTI'
    + ' -nln data'
    + ' -dialect sqlite'
    + ' -sql "SELECT DN as color, ST_union(geom) as geom FROM data GROUP BY DN"'
)
if args.verbose > 0:
    print(cmd_dissolve)
dict_cmd["projects"][1]["jobs"].append(
    {"name": "dissolve", "command": cmd_dissolve, "deps": [{"id": 1}]}
)

cmd_make_valid = (
    'ogr2ogr '
    + args.output.split('.')[0] + '_final.gpkg '
    + dissolve_path
    + ' -overwrite'
    + ' -nlt PROMOTE_TO_MULTI'
    + ' -makevalid'
)
if args.verbose > 0:
    print(cmd_make_valid)
dict_cmd["projects"][1]["jobs"].append(
    {"name": "make_valid", "command": cmd_make_valid, "deps": [{"id": 2}]}
)

# fin chantier merge

json_file = args.output
with open(json_file, "w", encoding='utf-8') as out_file:
    json.dump(dict_cmd, out_file, indent=4)

t_end = time.perf_counter()

# temps de calcul total
if args.verbose > 0:
    print(f"Temps global du calcul : {str(round(t_end-t_start, 2))}")
