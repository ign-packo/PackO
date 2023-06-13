# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import json
import platform
import sqlite3


# creation du chantier de vectorisation
def create_chantier_polygonize(dict_cmd, output, project_name):
    """Create vectorize project"""
    dict_cmd["projects"].append({"name": str(project_name+'_polygonize'), "jobs": []})

    script = "gdal_polygonize.py"
    if platform.system() == "Windows":
        script = script.split('.', maxsplit=1)[0]+".bat"

    tiles_dir = os.path.join(output, "tiles")
    gpkg_dir = os.path.join(output, "gpkg")

    if not os.path.exists(gpkg_dir):
        os.mkdir(gpkg_dir)

    # on recupere la liste des tuiles creees
    list_tiles_graph = os.listdir(tiles_dir)

    # on vectorise chaque tuile separement
    for tile in list_tiles_graph:
        gpkg_path = os.path.join(gpkg_dir, tile.split('.')[0] + '.gpkg')
        if os.path.exists(gpkg_path):
            print(f"Le fichier '{gpkg_path}' existe déjà. "
                  f"On le supprime avant de relancer le calcul.")
            os.remove(gpkg_path)
        cmd_polygonize = (
            script + ' '
            + os.path.join(tiles_dir, tile) + ' '
            + gpkg_path
            + ' -f "GPKG" '
            + '-mask ' + os.path.join(tiles_dir, tile)
        )
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
def add_chantier_merge(dict_cmd, project_name):
    """Add merge project to dictionary"""
    dict_cmd["projects"].append({"name": str(project_name+'_merge'),
                                 "jobs": [], "deps": [{"id": 0}]})


def add_job_merge(dict_cmd, output, project_name, proj):
    """Add merge job to merge project"""
    script_merge = "ogrmerge.py"
    if platform.system() == "Windows":
        script_merge = script_merge.split('.', maxsplit=1)[0]+".bat"

    gpkg_dir = os.path.join(output, "gpkg")
    tmp_dir = os.path.join(output, 'tmp')
    if not os.path.exists(tmp_dir):
        os.mkdir(tmp_dir)

    merge_file = project_name + '_merge.gpkg'
    merge_path = os.path.join(tmp_dir, merge_file)
    all_gpkg = os.path.join(gpkg_dir, '*.gpkg')
    cmd_merge = (
        script_merge
        + ' -o ' + merge_path
        + ' ' + all_gpkg
        + ' -a_srs ' + proj
        + ' -nln data'
        + ' -single'
        + ' -field_strategy Union'
        + ' -overwrite_ds'
    )
    dict_cmd["projects"][1]["jobs"].append({"name": "ogrmerge", "command": cmd_merge})
    return merge_path, tmp_dir


def add_job_dissolve(dict_cmd, project_name, merge_path, tmp_dir):
    """Add dissolve job to merge project"""
    dissolve_file = project_name + '_dissolve.gpkg'
    dissolve_path = os.path.join(tmp_dir, dissolve_file)
    cmd_dissolve = (
        'ogr2ogr '
        + dissolve_path + ' '
        + merge_path
        + ' -nlt PROMOTE_TO_MULTI'
        + ' -nln data'
        + ' -dialect sqlite'
        + ' -makevalid'
        + ' -sql "SELECT DN as color, ST_union(geom) as geom FROM data GROUP BY DN"'
    )
    dict_cmd["projects"][1]["jobs"].append(
        {"name": "dissolve", "command": cmd_dissolve, "deps": [{"id": 0}]}
    )
    return dissolve_path

# fin chantier merge


# chantier metadonnees
def add_chantier_mtd(dict_cmd, project_name):
    """Add mtd project to dictionary"""
    dict_cmd["projects"].append({"name": str(project_name+'_mtd'),
                                 "jobs": [], "deps": [{"id": 1}]})


# recuperation des metadonnees
def add_table_mtd(dissolve_path):
    """Add mtd table creation to mtd project"""
    conn = sqlite3.connect(dissolve_path)
    cursor = conn.cursor()

    cursor.execute('''
              CREATE TABLE IF NOT EXISTS mtd
              ([id] INTEGER PRIMARY KEY, [color_32] INTEGER, [opi] TEXT, [rgb] TEXT,
              [date_cliche] TEXT, [time_ut_cliche] TEXT)
              ''')
    conn.commit()

# TODO: test de performance sur cache gros > 1000 OPIs | export graphe + mtd


# TODO: verifier json gpao dans TNR ?
def create_mtd_dico(tmp_dir, overviews):
    """Create mtd list for OPIs"""
    dico = {}

    mtd_file = os.path.join(tmp_dir, 'mtd.csv')
    with open(mtd_file, 'w', encoding='utf-8') as file:
        file.write('opi;color;rgb;date;time_ut\n')
        for opi in overviews['list_OPI']:
            dico[opi] = []
            opi_mtd = overviews['list_OPI'].get(opi)
            color = str(opi_mtd['color'])
            color_32 = opi_mtd['color'][0] + opi_mtd['color'][1]*256 + opi_mtd['color'][2]*256**2
            date = opi_mtd['date']
            time_ut = opi_mtd['time_ut']
            dico[opi].append((color_32, opi_mtd))
            file.write(f'{opi};{color_32};{color};{date};{time_ut}\n')

    return mtd_file


# conversion gpkg -> fgb
def add_job_gpkg_to_fgb(dict_cmd, dissolve_path):
    """Create gpkg to fgb job"""
    cmd_gpkg_to_fgb = (
        'ogr2ogr '
        + '-f FlatGeobuf '
        + dissolve_path.split('.')[0] + '.fgb '
        + dissolve_path
    )
    dict_cmd["projects"][2]["jobs"].append(
        {"name": "gpkg_to_fgb", "command": cmd_gpkg_to_fgb}
    )


# jointure metadonnees
def add_job_join_mtd(dict_cmd, dissolve_path, mtd_file):
    """Add mtd joint to mtd project"""
    cmd_join_mtd = (
        'ogr2ogr '
        + '-dialect sqlite '
        + '-sql "SELECT data.*, mtd.* FROM data JOIN \''+mtd_file+'\'.mtd as mtd '
                                                                  'on data.color = mtd.color" '
        + dissolve_path.split('.')[0] + '_mtd.fgb '
        + dissolve_path.split('.')[0] + '.fgb'
    )
    dict_cmd["projects"][2]["jobs"].append(
        {"name": "cmd_join_mtd", "command": cmd_join_mtd, "deps": [{"id": 0}]}
    )


# conversion fgb -> gpkg
def add_job_fbg_to_gpkg(dict_cmd, dissolve_path, output, project_name):
    """Add fbg to gpkg job to mts project"""
    gpkg_file = project_name + '_mtd.gpkg'
    gpkg_path = os.path.join(output, gpkg_file)
    cmd_fgb_to_gpkg = (
        'ogr2ogr '
        + '-f GPKG '
        + gpkg_path + ' '
        + dissolve_path.split('.')[0] + '_mtd.fgb'
    )
    dict_cmd["projects"][2]["jobs"].append(
        {"name": "cmd_fgb_to_gpkg", "command": cmd_fgb_to_gpkg, "deps": [{"id": 1}]}
    )

# fin chantier metadonnees


# TODO : supprimer dossier temp si necessaire
def write_json_file(dict_cmd, output, project_name):
    """Write dictionary into json file"""
    json_file = project_name + "_gpao.json"
    json_path = os.path.join(output, json_file)
    with open(json_path, "w", encoding='utf-8') as out_file:
        json.dump(dict_cmd, out_file, indent=4)
