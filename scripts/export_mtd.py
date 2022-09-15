# -*- coding: utf-8 -*-
"""
Script permettant de récupérer les métadonnées associées à un graphe issu d'un cache PackO
"""
import os
import argparse
import json
import sqlite3
import time


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-g", "--graph", required=True, help="input graph")
    parser.add_argument("-c", "--cache", required=True, help="cache associated with the graph")
    parser.add_argument("-o", "--output", required=True, help="output json gpao filepath")
    parser.add_argument("-v", "--verbose", help="verbose (default: 0)", type=int, default=0)
    args_export = parser.parse_args()

    if args_export.verbose >= 1:
        print("\nArguments: ", args_export)

    return args_export


args = read_args()

t_start = time.perf_counter()

overviews_path = os.path.join(args.cache, "overviews.json")

# on va egalement gerer la recuperation des metadonnees dans ce chantier
# lecture du fichier overviews pour recuperer les infos du cache
try:
    with open(overviews_path, encoding='utf-8') as fileOverviews:
        overviews = json.load(fileOverviews)
except IOError:
    print(f"ERREUR: Le fichier '{overviews_path}' n'existe pas.")

# nom du chantier base sur le nom du cache
project_name = os.path.basename(args.cache)
# on cree le dictionnaire pour le chantier de gpao
dict_cmd = {"projects": []}

# debut chantier polygonize
dict_cmd["projects"].append({"name": str(project_name+'_add_mtd'), "jobs": []})

# on ajoute la colonne colors = r, g, b
cmd_alter_table_colors = (
    'ogrinfo '
    + args.graph
    + ' -sql \"ALTER TABLE data ADD colors TEXT;\"'
)
if args.verbose > 0:
    print(cmd_alter_table_colors)
dict_cmd["projects"][0]["jobs"].append(
    {"name": "alter_table_add_colors", "command": cmd_alter_table_colors}
)

# on ajoute la colonne cliche
cmd_alter_table_opi_name = (
        'ogrinfo '
        + args.graph
        + ' -sql \"ALTER TABLE data ADD cliche TEXT;\"'
)
if args.verbose > 0:
    print(cmd_alter_table_opi_name)
dict_cmd["projects"][0]["jobs"].append(
    {"name": "alter_table_add_name", "command": cmd_alter_table_opi_name}
)

# on ajoute la colonne date
cmd_alter_table_date = (
        'ogrinfo '
        + args.graph
        + ' -sql \"ALTER TABLE data ADD date TEXT;\"'
)
if args.verbose > 0:
    print(cmd_alter_table_date)
dict_cmd["projects"][0]["jobs"].append(
    {"name": "alter_table_add_date", "command": cmd_alter_table_date}
)

# on ajoute la colonne date
cmd_alter_table_time = (
        'ogrinfo '
        + args.graph
        + ' -sql \"ALTER TABLE data ADD time_ut TEXT;\"'
)
if args.verbose > 0:
    print(cmd_alter_table_time)
dict_cmd["projects"][0]["jobs"].append(
    {"name": "alter_table_time_ut", "command": cmd_alter_table_time}
)

db = sqlite3.connect(args.graph)
cursor = db.cursor()

# on recupere tous les labels presents dans notre graphe
cursor.execute('SELECT color FROM data;')

for row in cursor:
    color_graph = int(str(row).replace('(', '').replace(')', '').replace(',', ''))
    for elem in overviews['list_OPI']:
        opi = overviews['list_OPI'].get(elem)
        color = opi['color'][0] + opi['color'][1]*256 + opi['color'][2]*256**2
        colors = f"{opi['color'][0]}, {opi['color'][1]}, {opi['color'][2]}"
        if color_graph == color:
            if args.verbose > 0:
                print('correspondance des labels')
                print(f"color : '{str(color_graph)}'")
                print(f"elem : '{elem}'")
                print(f"date : '{opi['date']}'")
                print(f"time_ut : '{opi['time_ut']}'")
            request = f"UPDATE data SET colors = '{colors}', cliche = '{elem}', \
                      date = '{str(opi['date'])}', \
                      time_ut = '{str(opi['time_ut'])}' WHERE color = '{str(color_graph)}'"
            cmd_update_data = f"ogrinfo {args.graph} -sql \"{request}\""
            if args.verbose > 0:
                print(cmd_alter_table_time)
            dict_cmd["projects"][0]["jobs"].append(
                {"name": "update_data_"+elem, "command": cmd_update_data,
                 "deps": [{"id": 0}, {"id": 1}, {"id": 2}, {"id": 3}]}
            )

json_file = args.output
with open(json_file, 'w', encoding='utf-8') as out_file:
    json.dump(dict_cmd, out_file, indent=4)

t_end = time.perf_counter()

# temps de calcul total
if args.verbose > 0:
    print(f"Temps global du calcul : {str(round(t_end-t_start, 2))}")
