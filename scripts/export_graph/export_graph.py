# -*- coding: utf-8 -*-
"""
Script d'export du graphe a partir d'un cache
"""
import os
import sys
import re
import argparse
import prep_vectorise_graph as prep
import vectorise_graph as vect

current = os.path.dirname(os.path.realpath(__file__))
parent = os.path.dirname(current)
sys.path.append(parent)

from process_requests import check_get_post, response2pyobj  # noqa: E402


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-c", "--cache", required=True, type=str, help="path of input cache")
    parser.add_argument("-o", "--output", required=True, help="output folder")
    parser.add_argument("-b", "--branch", required=True,
                        help="id of branch of cache to use as source for patches")
    parser.add_argument('-u', '--url',
                        help="http://[serveur]:[port] (default: http://localhost:8081)",
                        type=str, default='http://localhost:8081')
    parser.add_argument("-t", "--tilesize",
                        help="tile size (in pixels) for vectorising graph tiles (default: 100000)",
                        type=int, default=100000)
    parser.add_argument("--bbox", help="bbox for export (in meters), xmin ymin xmax ymax",
                        type=int, nargs=4)
    parser.add_argument("-v", "--verbose", help="verbose (default: 0)", type=int, default=0)
    args_prep = parser.parse_args()

    if args_prep.verbose >= 1:
        print("\nArguments: ", args_prep)

    # check input url
    url_pattern = r'^https?:\/\/[0-9A-z.]+\:[0-9]+$'
    if not re.match(url_pattern, args_prep.url):
        raise SystemExit(f"ERROR: URL '{args_prep.url}' is invalid")

    # check bbox
    coords = str(args_prep.bbox).split(' ')
    if any(elem is None for elem in coords) and any(elem is not None for elem in coords):
        raise SystemError("ERROR: all bbox coordinates must be specified")

    # verifier tous les parametres

    # verifier l'existence de la branche d'id args.branch

    return args_prep


args = read_args()

# TODO : gérer des dalles de NODATA en bord de chantier
# TODO : pouvoir ajouter un tag gpao dans le chantier
# TODO : export mtd optionnel si cache n'en contient pas ? Tester comportement sans mtd || OK

# recuperer les patches correspondant a la branche desiree (requete curl)
patches_files = os.path.join(args.output, 'patches.json')
req_get_patches = f'{args.url}/{args.branch}/patches'
resp_get_patches = check_get_post(req_get_patches)
list_patches_api = response2pyobj(resp_get_patches)

# creation du repertoire de sortie si necessaire
try:
    os.mkdir(args.output)
except FileExistsError:
    print("ALERTE : Le dossier de sortie existe déjà.")

# define working dir
os.chdir(args.output)
print(f"INFO : Le répertoire de travail est '{os.getcwd()}'")
# redefine input directory
try:
    cache_path = os.path.relpath(args.cache, start=args.output)
except ValueError:
    print("No relative path, absolute path is used instead")
    cache_path = os.path.abspath(args.cache)
print("Updated input path relative to working dir: '" + cache_path + "'")

# check if input dir exists
if not os.path.exists(cache_path):
    raise SystemExit("ERREUR : Le répertoire " + cache_path + " n'existe pas.")

# on verifie si l'overviews utilise est bien correct
path_depth, level, resol, proj, overviews = prep.check_overviews(cache_path)

# recupere la liste des dalles impactees par les retouches sur le chantier
list_patches, id_branch_patch = prep.list_patches(list_patches_api, cache_path, path_depth, level)

# create correct path out
if os.path.basename(cache_path) != "..":
    path_out = os.path.join(args.output, os.path.basename(cache_path))
else:
    path_out = os.path.join(args.output, os.path.basename(args.output))

# on verifie que la branch donne est correcte
# encore necessaire vu qu'on va chercher les patches via id_branch ?
# verif dans argsparser, a supprimer
prep.check_branch_patch(args.branch, id_branch_patch)

# on recupere la liste des dalles impactees par les patches
prep.create_list_slabs(cache_path, level, args.branch, path_out, list_patches)

# creation des vrt intermediaires
prep.build_full_vrt(path_out, resol)
prep.build_vrt_emprise(path_out)
prep.build_vrt_32bits(path_out)

# creation des dalles de vrt pour la vectorisation
prep.create_tiles_vrt(args.output, path_out, resol, args.tilesize, args.bbox)

# preparation du fichier pour la gpao
dict_cmd = {"projects": []}
project_name = os.path.basename(args.output.split('.')[0])

# chantier polygonize
vect.create_chantier_polygonize(dict_cmd, args.output, project_name)

# chantier merge
vect.add_chantier_merge(dict_cmd, project_name)
merge_path, tmp_dir = vect.add_job_merge(dict_cmd, args.output, project_name, proj)
dissolve_path = vect.add_job_dissolve(dict_cmd, project_name, merge_path, tmp_dir)

# chantier mtd
vect.add_chantier_mtd(dict_cmd, project_name)
vect.add_table_mtd(dissolve_path)
mtd_file = vect.create_mtd_dico(tmp_dir, overviews)
vect.add_job_gpkg_to_fgb(dict_cmd, dissolve_path)
vect.add_job_join_mtd(dict_cmd, dissolve_path, mtd_file)
vect.add_job_fbg_to_gpkg(dict_cmd, dissolve_path, args.output, project_name)

# ecriture du json de gpao
vect.write_json_file(dict_cmd, args.output, project_name)
