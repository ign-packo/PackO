# coding: utf-8
"""This script create or update a cache with a list of OPI"""
import os
import argparse
import glob
import multiprocessing
from pathlib import Path
import json
import time
from osgeo import gdal
from osgeo import osr

import cache_def as cache


cpu_dispo = multiprocessing.cpu_count()


def read_args(update, cut_opi, export_tile):
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    if not cut_opi and not export_tile:
        parser.add_argument("-R", "--rgb",
                            help="input RGB OPI pattern")

        parser.add_argument("-I", "--ir",
                            help="input IR OPI pattern")
    else:
        if cut_opi:
            parser.add_argument("-R", "--rgb",
                                help="input RGB OPI full path")

            parser.add_argument("-I", "--ir",
                                help="input IR OPI full path")
        else:
            parser.add_argument("-i", "--input",
                                required=True,
                                type=int,
                                nargs=5,
                                help="tile number (level, slabXMin, slabYMin, slabXMax, slabYMax)")
    parser.add_argument("-c", "--cache",
                        help="cache directory (default: cache)",
                        type=str,
                        default="cache")
    if update is False:
        parser.add_argument("-o", "--overviews",
                            help="params for the mosaic (default: ressources/LAMB93_5cm.json)",
                            type=str,
                            default="ressources/LAMB93_5cm.json")
    parser.add_argument("-g", "--graph",
                        help="GeoPackage filename or gdal connection string \
                        (\"PG:host=localhost user=postgres password=postgres dbname=demo\")",
                        type=str,
                        default="")
    parser.add_argument("-t", "--table",
                        help="graph table (default: graphe_pcrs56_zone_test)",
                        type=str,
                        default="graphe_pcrs56_zone_test")
    parser.add_argument("-p", "--processors",
                        help="number of processing units to allocate (default: Max_cpu-1)",
                        type=int,
                        default=(cpu_dispo-1, 1)[cpu_dispo - 1 == 0])
    parser.add_argument("-r", "--running",
                        help="launch the process locally (default: 0, meaning no process \
                        launching, only GPAO project file creation)",
                        type=int,
                        default=0)
    parser.add_argument("-s", "--subsize",
                        help="size of the subareas for processing the data \
                         (in slabs, default: 2, meaning 2x2 slabs)",
                        type=int,
                        default=2)
    parser.add_argument("-v", "--verbose",
                        help="verbose (default: 0, meaning no verbose)",
                        type=int,
                        default=0)
    args = parser.parse_args()

    if args.verbose > 1:
        print("\nArguments: ", args)

    if not export_tile and (args.rgb is not None) and os.path.isdir(args.rgb):
        raise SystemExit("ERROR: invalid pattern: " + args.rgb)
    if not export_tile and (args.ir is not None) and os.path.isdir(args.ir):
        raise SystemExit("ERROR: invalid pattern: " + args.ir)
    if not export_tile and (args.rgb is None) and (args.ir is None):
        raise SystemExit("ERROR: no input data")

    if update is False:
        if os.path.isdir(args.cache) and (cut_opi or export_tile) is False:
            raise SystemExit("ERROR: Cache (" + args.cache + ") already in use")
    else:
        if not os.path.isdir(args.cache):
            raise SystemExit("ERROR: Cache '" + args.cache + "' doesn't exist.")

    # gestion des echappements possible sur le nom de table
    args.table = args.table.strip("'").strip('"')

    if args.subsize < 1:
        raise SystemExit("ERROR: subsize must be equal or greater than 1.")

    if args.table[0].isdigit():
        raise SystemExit("ERROR: First char of table is digit. "
                         "Check table name and change it if needed.")

    if not cut_opi:
        db_graph = gdal.OpenEx(args.graph, gdal.OF_VECTOR)
        if db_graph is None:
            raise SystemExit("ERROR: Connection to database failed")

        # Test pour savoir si le nom de la table est correct
        if db_graph.ExecuteSQL("select * from " + args.table) is None:
            raise SystemExit("ERROR: table " + args.table + " doesn't exist")

        if not export_tile:
            args.x_min, args.x_max, args.y_min, args.y_max = \
                db_graph.GetLayer(args.table).GetExtent()
    return args


def prep_dict(args, update):
    """Création des différents dictionnaires"""
    if update is True:
        with open(args.cache + '/overviews.json') as json_overviews:
            overviews_dict = json.load(json_overviews)

        with open(args.cache + '/cache_mtd.json') as json_colors:
            color_dict = json.load(json_colors)

        # on vérifie que le type des OPI est le même
        with_rgb = args.rgb is not None
        with_ir = args.ir is not None
        first_opi = list(overviews_dict["list_OPI"].values())[0]
        cache_type = ''
        if first_opi['with_rgb']:
            cache_type += 'RGB'
        if first_opi['with_ir']:
            cache_type += 'IR'
        update_type = ''
        if with_rgb:
            update_type += 'RGB'
        if with_ir:
            update_type += 'IR'
        if cache_type != update_type:
            raise SystemExit("ERROR: opi type not compatible (existing cache type: " +
                             cache_type + " and update type: " + update_type + ")")
    else:
        with open(args.overviews) as json_overviews:
            overviews_dict = json.load(json_overviews)

        # overviews_dict = overviews_init
        overviews_dict["list_OPI"] = {}
        overviews_dict['dataSet'] = {}
        overviews_dict['dataSet']['boundingBox'] = {}
        overviews_dict['dataSet']['limits'] = {}
        overviews_dict['dataSet']['slabLimits'] = {}
        overviews_dict['dataSet']['level'] = {}
        overviews_dict['dataSet']['level'] = {
            'min': overviews_dict['level']['min'],
            'max': overviews_dict['level']['max']
        }

        color_dict = {}

    return overviews_dict, color_dict


def cut_opi():
    """Cut one OPI for update/create a cache"""
    args = read_args(False, True, False)
    args.cache = os.path.abspath(args.cache)
    with open(args.cache + '/overviews.json') as json_overviews:
        overviews_dict = json.load(json_overviews)

    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromEPSG(overviews_dict['crs']['code'])
    spatial_ref_wkt = spatial_ref.ExportToWkt()

    slabbox = args.rgb
    name_rgb = args.rgb
    name_ir = args.ir
    if args.rgb is None:
        slabbox = args.ir
        name_rgb = ""
    if args.ir is None:
        name_ir = ""

    args_cut_image = {
        'opi': {
            'rgb': args.rgb,
            'ir': args.ir,
            'name_rgb': Path(name_rgb).stem,
            'name_ir': Path(name_ir).stem
        },
        'overviews': overviews_dict,
        'slabBox': cache.get_slabbox(slabbox, overviews_dict),
        'cache': args.cache,
        'gdalOption': {
            'spatialRef': spatial_ref_wkt
        },
        'verbose': args.verbose
    }

    cache.cut_image_1arg(args_cut_image)


def generate_tile():
    """rasterize graph and export ortho for one tile"""
    args = read_args(False, False, True)
    args.cache = os.path.abspath(args.cache)
    with open(args.cache + '/overviews.json') as json_overviews:
        overviews_dict = json.load(json_overviews)

    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromEPSG(overviews_dict['crs']['code'])
    spatial_ref_wkt = spatial_ref.ExportToWkt()

    resol = overviews_dict['resolution'] * 2 ** (overviews_dict['level']['max'] - args.input[0])
    for slab_x in range(args.input[1], args.input[3] + 1):
        for slab_y in range(args.input[2], args.input[4] + 1):
            args_create_ortho_and_graph = {
                'slab': {
                    'x': slab_x,
                    'y': slab_y,
                    'level': args.input[0],
                    'resolution': resol
                },
                'overviews': overviews_dict,
                'dbOption': {
                    'connString': args.graph,
                    'table': args.table
                },
                'cache': args.cache,
                'gdalOption':  {
                    'spatialRef': spatial_ref_wkt
                }
            }
            cache.create_ortho_and_graph_1arg(args_create_ortho_and_graph)


def export_as_json(filename, jobs_1, jobs_2):
    """Export json file for gpao"""
    gpao = {'projects': [
        {'name': 'decoupage', 'jobs': []},
        {'name': 'export', 'jobs': [], 'deps': [{'id': 0}]}
        ]}
    for job in jobs_1:
        gpao['projects'][0]['jobs'].append(job)
    for job in jobs_2:
        gpao['projects'][1]['jobs'].append(job)
    with open(filename, 'w') as file:
        json.dump(gpao, file)


def generate(update):
    """Create a cache from a list of input OPI"""

    dir_script = Path(__file__).parent

    args = read_args(update, False, False)
    args.cache = os.path.abspath(args.cache)
    overviews_dict, color_dict = prep_dict(args, update)

    cpu_util = args.processors

    # on analyse le graphe pour recuperer l'emprise et la liste des cliches
    db_graph = gdal.OpenEx(args.graph, gdal.OF_VECTOR)

    list_filename_rgb = []
    list_filename_ir = []
    nb_files = 0
    with_rgb = False
    with_ir = False
    if args.rgb:
        list_filename_rgb = glob.glob(args.rgb)
        nb_files = len(list_filename_rgb)
        with_rgb = True
    if args.ir:
        list_filename_ir = glob.glob(args.ir)
        dir_ir = os.path.dirname(list_filename_ir[0])
        nb_files = max(nb_files, len(list_filename_ir))
        with_ir = True

    if nb_files == 0:
        raise SystemExit("WARNING: Empty input folder, nothing to add in cache")

    if with_rgb and with_ir:
        if len(list_filename_rgb) != len(list_filename_ir):
            raise SystemExit("ERROR: different rgb and ir OPI number")

    list_filename = list_filename_rgb
    # with_rgb = (len(list_filename_rgb) > 0)
    # with_ir = (len(list_filename_ir) > 0)
    if len(list_filename_rgb) == 0:
        list_filename = list_filename_ir

    # si on est en mise a jour
    # on suppose que le graphe n'a pas changé
    # donc la liste des clichés et l'emprise restent la même
    # donc pas de modification des MTD
    if not update:
        for filename in list_filename:
            basename = Path(filename).stem
            # on recupere les metadonnees d'acquisition
            graph_layer = db_graph.GetLayer(args.table)
            filename_tmp = basename.replace('OPI_', '').replace('_ix', 'x')
            graph_layer.SetAttributeFilter("CLICHE LIKE '" + filename_tmp + "'")
            opi_feature = graph_layer.GetNextFeature()
            # si l'OPI n'est pas presente, passer a la suite
            if opi_feature is None:
                continue
            date = opi_feature.GetField('DATE')
            time_ut = opi_feature.GetField('HEURE_TU')
            graph_layer.SetAttributeFilter(None)

            overviews_dict["list_OPI"][basename] = {
                'color': cache.new_color(basename, color_dict),
                'date': date.replace('/', '-'),
                'time_ut': time_ut.replace('h', ':'),
                'with_rgb': with_rgb,
                'with_ir': with_ir
            }

            # il faut recuperer les infos de la bbox par image
            cache.get_slabbox(filename, overviews_dict)

        # si necessaire, on cree le dossier et on exporte les MTD
        Path(args.cache).mkdir(parents=True, exist_ok=True)

        with open(args.cache + '/cache_mtd.json', 'w') as outfile:
            json.dump(color_dict, outfile)

        with open(args.cache + '/overviews.json', 'w') as outfile:
            json.dump(overviews_dict, outfile)
    else:
        # il faut ajouter les nouvelles OPIs dans overviews en cas d'upadte
        # il faut verifier si les OPIs sont deja presentes, si non, les ajouter
        with open(args.cache + '/overviews.json') as json_overviews:
            overviews_dict = json.load(json_overviews)

        with open(args.cache + '/cache_mtd.json') as json_colors:
            color_dict = json.load(json_colors)

        for filename in list_filename:
            basename = Path(filename).stem
            if basename not in overviews_dict['list_OPI']:
                graph_layer = db_graph.GetLayer(args.table)
                filename_tmp = basename.replace('OPI_', '').replace('_ix', 'x')
                graph_layer.SetAttributeFilter("CLICHE LIKE '" + filename_tmp + "'")
                opi_feature = graph_layer.GetNextFeature()
                # si l'OPI n'est pas presente, passer a la suite
                if opi_feature is None:
                    continue
                date = opi_feature.GetField('DATE')
                time_ut = opi_feature.GetField('HEURE_TU')
                graph_layer.SetAttributeFilter(None)

                overviews_dict["list_OPI"][basename] = {
                    'color': cache.new_color(basename, color_dict),
                    'date': date.replace('/', '-'),
                    'time_ut': time_ut.replace('h', ':'),
                    'with_rgb': with_rgb,
                    'with_ir': with_ir
                }

                # il faut recuperer les infos de la bbox par image
                cache.get_slabbox(filename, overviews_dict)

        with open(args.cache + '/cache_mtd.json', 'w') as outfile:
            json.dump(color_dict, outfile)

        with open(args.cache + '/overviews.json', 'w') as outfile:
            json.dump(overviews_dict, outfile)

    print(f'\n {len(list_filename)} image(s) à traiter ({cpu_util} cpu)')

    slabbox_export = None
    if not update:
        slabbox_export = overviews_dict['dataSet']['slabLimits']

    try:
        # Decoupage des images
        print("Préparation")
        opi_unused = []
        cmds1 = []
        for filename in list_filename:
            print(f"  Image : {filename}")
            opi = Path(filename).stem
            if opi not in overviews_dict['list_OPI'].keys():
                print('  ', opi, ' -> pas dans le graphe', sep="")
                opi_unused.append(opi)
            else:
                cmd1 = (
                    'python ' +
                    str(dir_script/'cut_opi.py')
                )
                if with_rgb:
                    cmd1 += ' -R ' + filename
                    if with_ir:
                        filename_ir = dir_ir+'/'+os.path.basename(filename).replace('x', '_ix')
                        cmd1 += ' -I ' + filename_ir
                else:
                    cmd1 += ' -I ' + filename
                cmd1 += ' -c ' + args.cache
                cmds1.append({'name': opi, 'command': cmd1})

                # si on est en mise a jour
                # il faut noter les dalles impactees pour savoir ce qu'il faudra
                # recalculer comme graphe/ortho
                if update:
                    slabbox = cache.get_slabbox(filename, overviews_dict)
                    if not slabbox_export:
                        slabbox_export = slabbox
                    else:
                        for level in slabbox.keys():
                            slabbox_export[level]['MinSlabCol'] = \
                                min(slabbox_export[level]['MinSlabCol'],
                                    slabbox[level]['MinSlabCol'])
                            slabbox_export[level]['MinSlabRow'] = \
                                min(slabbox_export[level]['MinSlabRow'],
                                    slabbox[level]['MinSlabRow'])
                            slabbox_export[level]['MaxSlabCol'] = \
                                max(slabbox_export[level]['MaxSlabCol'],
                                    slabbox[level]['MaxSlabCol'])
                            slabbox_export[level]['MaxSlabRow'] = \
                                max(slabbox_export[level]['MaxSlabRow'],
                                    slabbox[level]['MaxSlabRow'])

        if len(opi_unused) > 0:
            print(" Attention: ", len(opi_unused), " OPI non presentes dans le graphe", sep="")

        cmds2 = []

        # Calcul des ortho et graph
        if args.table.strip('"')[0].isdigit():
            table = '"\\' + args.table + '\\"'
        else:
            table = args.table
        for level in slabbox_export.keys():
            level_limits = slabbox_export[level]
            print(str(level)+":"+str(level_limits))
            for slab_x in range(level_limits["MinSlabCol"],
                                level_limits["MaxSlabCol"] + 1,
                                args.subsize):
                for slab_y in range(level_limits["MinSlabRow"],
                                    level_limits["MaxSlabRow"] + 1,
                                    args.subsize):
                    # il faut s'assurer qu'on ne va pas dépasser des max selon les deux axes
                    slab_x_max = slab_x + args.subsize - 1
                    if slab_x_max > level_limits["MaxSlabCol"]:
                        slab_x_max = level_limits["MaxSlabCol"]
                    slab_y_max = slab_y + args.subsize - 1
                    if slab_y_max > level_limits["MaxSlabRow"]:
                        slab_y_max = level_limits["MaxSlabRow"]
                    cmds2.append(
                        {'name': level+'_'+str(slab_x)+'_'+str(slab_y),
                         'command': 'python '+str(dir_script/'generate_tile.py') +
                                    ' -i ' + level + ' ' +
                                    str(slab_x) + ' ' + str(slab_y) + ' ' +
                                    str(slab_x_max) + ' ' + str(slab_y_max) + ' -c ' +
                                    args.cache + ' -g "' + args.graph + '" -t ' + table}
                    )

        if not args.running:
            if not update:
                export_as_json(args.cache + '/create.json', cmds1, cmds2)
            else:
                export_as_json(args.cache + '/update.json', cmds1, cmds2)

        if args.running:
            time_start_opi = time.perf_counter()
            # lancement des traitements de la phase 1
            print('Découpage OPI')
            cmds = []
            for cmd in cmds1:
                cmds.append(cmd['command'])
            pool = multiprocessing.Pool(cpu_util)
            pool.map(os.system, cmds)
            pool.close()
            pool.join()
            time_start_graph = time.perf_counter()
            if args.verbose > 0:
                time_opi = time_start_graph - time_start_opi
                print(f"Temps création tuiles OPIs : {time_opi:.2f} s")
            # lancement des traitements de la phase 2
            print("Génération tuiles graphe et ortho")
            cmds = []
            for cmd in cmds2:
                cmds.append(cmd['command'])
            pool = multiprocessing.Pool(cpu_util)

            def mycallback(r):
                del r
                mycallback.cnt += 1
                cache.display_bar(mycallback.cnt, mycallback.nb)

            mycallback.cnt = 0
            mycallback.nb = len(cmds)
            cache.display_bar(mycallback.cnt, mycallback.nb)

            results = []
            for cmd in cmds:
                r = pool.apply_async(os.system, (cmd,), callback=mycallback)
                results.append(r)
            for r in results:
                r.wait()

            time_end = time.perf_counter()

            if args.verbose > 0:
                time_graph_ortho = time_end - time_start_graph
                print(f"Temps création tuiles graphe et ortho : {time_graph_ortho:.2f} s")
                time_global = time_end - time_start_opi
                print(f"Temps total du calcul : {time_global:.2f} s")

    except Exception as err:
        raise SystemExit(f"ERROR: {err}")
