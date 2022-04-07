# -*- coding: utf-8 -*-
"""
Script permettant de récupérer les métadonnées associées à un graphe issu d'un cache PackO
"""
import os
import argparse
import json
import sqlite3


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-g", "--graph", required=True, help="input graph")
    parser.add_argument(
        "-c", "--cache", required=True, help="cache associated with the graph"
    )
    parser.add_argument(
        "-o", "--output", required=True, help="output json gpao filepath"
    )
    parser.add_argument(
        "-v", "--verbose", help="verbose (default: 0)", type=int, default=0
    )
    args = parser.parse_args()

    if args.verbose >= 1:
        print("\nArguments: ", args)

    return args


args = read_args()

# on va egalement gerer la recuperation des metadonnees dans ce chantier
# lecture du fichier overviews pour recuperer les infos du cache
fileOverviews = open(os.path.join(args.cache, "overviews.json"))
overviews = json.load(fileOverviews)
fileOverviews.close()

# nom du chantier base sur le nom du cache
chantier_name = os.path.basename(args.cache)
# on cree le dictionnaire pour le chantier de gpao
dict_cmd = {"projects": []}

# debut chantier polygonize
dict_cmd["projects"].append({"name": str(chantier_name+'_polygonize'), "jobs": []})

# on ajoute la colonne name
request_name = 'ALTER TABLE data ADD name TEXT;'
cmd_alter_table_name = (
        'ogrinfo '
        + args.graph
        + ' -sql \"'
        + request_name + '\"'
)
if args.verbose > 0:
    print(cmd_alter_table_name)
dict_cmd["projects"][0]["jobs"].append({"name": "alter_table_add_name", "command": cmd_alter_table_name})

# on ajoute la colonne date
request_date = 'ALTER TABLE data ADD date TEXT;'
cmd_alter_table_date = (
        'ogrinfo '
        + args.graph
        + ' -sql \"'
        + request_date + '\"'
)
if args.verbose > 0:
    print(cmd_alter_table_date)
dict_cmd["projects"][0]["jobs"].append({"name": "alter_table_add_date", "command": cmd_alter_table_date})

# on ajoute la colonne date
request_time = 'ALTER TABLE data ADD time_ut TEXT;'
cmd_alter_table_time = (
        'ogrinfo '
        + args.graph
        + ' -sql \"'
        + request_time + '\"'
)
if args.verbose > 0:
    print(cmd_alter_table_time)
dict_cmd["projects"][0]["jobs"].append({"name": "alter_table_time_ut", "command": cmd_alter_table_time})

db = sqlite3.connect(args.graph)
cursor = db.cursor()

# on recupere tous les labels presents dans notre graphe
cursor.execute('SELECT color FROM data;')

for row in cursor:
    color_graph = int(str(row).replace('(', '').replace(')', '').replace(',', ''))
    print('color_graph = '+str(color_graph))
    for elem in overviews['list_OPI']:
        opi = overviews['list_OPI'].get(elem)
        color = opi['color'][0] + opi['color'][1]*256 + opi['color'][2]*256**2
        if color_graph == color:
            if args.verbose > 0:
                print('correspondance des labels')
                print('color : '+str(color_graph))
                print('elem : '+elem)
                print('date : '+opi['date'])
                print('time_ut : '+opi['time_ut'])
            request = 'UPDATE data SET name = \''+elem+'\', date = \''+str(opi['date'])+'\', time_ut = \
             \''+str(opi['time_ut'])+'\' WHERE color = \''+str(color_graph)+'\''
            cmd_update_data = 'ogrinfo '+args.graph+' -sql \"'+request+'\"'
            if args.verbose > 0:
                print(cmd_alter_table_time)
            dict_cmd["projects"][0]["jobs"].append({"name": "update_data_"+elem, "command": cmd_update_data,
                                                    "deps": [{"id": 0}, {"id": 1}, {"id": 2}]})

json_file = args.output
out_file = open(json_file, "w")
json.dump(dict_cmd, out_file, indent=4)
out_file.close()
