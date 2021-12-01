# coding: utf-8
"""This script create or update a cache with a list of OPI"""
import os
import argparse
import json
import glob
import multiprocessing
import time
from osgeo import gdal
from osgeo import osr

import cache_def as cache

user = os.getenv('PGUSER', default='postgres')
host = os.getenv('PGHOST', default='localhost')
database = os.getenv('PGDATABASE', default='pcrs')
password = os.getenv('PGPASSWORD', default='postgres')  # En dur, pas top...
port = os.getenv('PGPORT', default='5432')

conn_string = "PG:host="\
    + host + " dbname=" + database\
    + " user=" + user + " password=" + password

# NB_BANDS = 3
cpu_dispo = multiprocessing.cpu_count()


def read_args(update):
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-R", "--rgb",
                        help="input RGB OPI pattern")

    parser.add_argument("-I", "--ir",
                        help="input IR OPI pattern")

    parser.add_argument("-c", "--cache",
                        help="cache directory (default: cache)",
                        type=str,
                        default="cache")
    if update is False:
        parser.add_argument("-o", "--overviews",
                            help="params for the mosaic (default: ressources/LAMB93_5cm.json)",
                            type=str,
                            default="ressources/LAMB93_5cm.json")
        # parser.add_argument("-l", "--level",
        #                     help="level range for the overviews"
        #                     " (default: values from ressources file)"
        #                     " (e.g., 15 19)",
        #                     type=int,
        #                     nargs='+')
    if update is True:
        parser.add_argument("-r", "--reprocessing",
                            help="reprocessing of OPI already processed"
                            " (default: 0, existing OPIs are not reprocessed)",
                            type=int,
                            default=0)
    parser.add_argument("-g", "--geopackage",
                        help="in case the graph base is a GeoPackage"
                        " and not a postgres base define through env variables",
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
    parser.add_argument("-v", "--verbose",
                        help="verbose (default: 0)",
                        type=int,
                        default=0)
    args = parser.parse_args()

    if args.verbose > 1:
        print("\nArguments: ", args)

    if (args.rgb is not None) and os.path.isdir(args.rgb):
        raise SystemExit("create_cache.py: error: invalid pattern: " + args.rgb)

    if (args.ir is not None) and os.path.isdir(args.ir):
        raise SystemExit("create_cache.py: error: invalid pattern: " + args.ir)

    if (args.rgb is None) and (args.ir is None):
        raise SystemExit("create_cache.py: error: no input data")

    if update is False:
        if os.path.isdir(args.cache):
            raise SystemExit("Cache (" + args.cache + ") already in use")

        # if args.level:
        #     if len(args.level) > 2:
        #         raise SystemExit("create_cache.py: error: argument -l/--level:"
        #                          " one or two arguments expected.")
        #     if len(args.level) == 2 and args.level[0] > args.level[1]:
        #         lvl_max = args.level[0]
        #         args.level[0] = args.level[1]
        #         args.level[1] = lvl_max

        args.reprocessing = 0
    else:
        if not os.path.isdir(args.cache):
            raise SystemExit("Cache '" + args.cache + "' doesn't exist.")

    if not args.geopackage == "":
        if os.path.isfile(args.geopackage):
            global conn_string
            conn_string = args.geopackage
        else:
            raise SystemExit("Base '" + args.geopackage + "' doesn't exist.")

    db_graph = gdal.OpenEx(conn_string, gdal.OF_VECTOR)
    if db_graph is None:
        raise SystemExit("Connection to database failed")

    # Test pour savoir si le nom de la table est correct
    if db_graph.ExecuteSQL("select * from " + args.table) is None:
        raise SystemExit("table " + args.table + " doesn't exist")

    return args


def prep_dict(args, update):
    """Création des différents dictionnaires"""
    if update is True:
        with open(args.cache + '/overviews.json') as json_overviews:
            overviews_dict = json.load(json_overviews)

        with open(args.cache + '/cache_mtd.json') as json_colors:
            color_dict = json.load(json_colors)
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

        # if args.level:
        #     if args.level[0] < overviews_dict['level']['min'] \
        #             or (len(args.level) == 1 and args.level[0] > overviews_dict['level']['max']) \
        #             or (len(args.level) > 1 and args.level[1] > overviews_dict['level']['max']):
        #         raise SystemExit("create_cache.py: error: argument -l/--level: "
        #                          + str(args.level) +
        #                          ": out of default overviews level range: "
        #                          + str(overviews_dict['level']))

        # level_min = overviews_dict['level']['min'] if args.level is None else args.level[0]
        # level_max = overviews_dict['level']['max'] if args.level is None \
        #     else level_min if len(args.level) == 1 else args.level[1]

        # nbLevelInCOG = cache.get_slabdeepth(overviews_dict['slabSize'])
        overviews_dict['dataSet']['level'] = {
            # 'min': ((level_min - 1 - (level_max % nbLevelInCOG)) // nbLevelInCOG) * nbLevelInCOG
            # + (level_max % nbLevelInCOG) + 1,
            'min': overviews_dict['level']['min'],
            'max': overviews_dict['level']['max']
        }

        color_dict = {}

    return overviews_dict, color_dict


def generate(update):
    """Create a cache from a list of input OPI"""

    args = read_args(update)
    cpu_util = args.processors
    overviews_dict, color_dict = prep_dict(args, update)

    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromEPSG(overviews_dict['crs']['code'])
    spatial_ref_wkt = spatial_ref.ExportToWkt()

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
        nb_files = max(nb_files, len(list_filename_ir))
        with_ir = True

    if nb_files == 0:
        raise SystemExit("WARNING: Empty input folder: nothing to add in cache")

    if with_rgb and with_ir:
        if len(list_filename_rgb) != len(list_filename_ir):
            raise SystemExit("ERROR: different rgb and ir OPI number")

    tps0 = time.perf_counter()
    print("\n ", nb_files, " image(s) à traiter (", cpu_util, " cpu)", sep="")

    try:
        # Decoupage des images et calcul de l'emprise globale
        print("Découpe des images :")
        print(" Préparation")

        args_cut_image, opi_duplicate, change = cache.prep_tiling(list_filename_rgb,
                                                                  list_filename_ir,
                                                                  args.cache,
                                                                  overviews_dict,
                                                                  color_dict,
                                                                  {
                                                                    # 'nbBands': NB_BANDS,
                                                                    'spatialRef': spatial_ref_wkt
                                                                  },
                                                                  args.verbose,
                                                                  args.reprocessing)

        print(" Découpage")

        # cas où il y a moins d'images à traiter que de cpu aloué(s)
        if cpu_util > nb_files:
            nb_thread = nb_files
        else:
            nb_thread = cpu_util

        if nb_thread > 1:
            pool = multiprocessing.Pool(nb_thread)
            pool.map(cache.cut_image_1arg, args_cut_image)

            pool.close()
            pool.join()
        else:
            for arg in args_cut_image:
                cache.cut_image_1arg(arg)

        with open(args.cache + '/cache_mtd.json', 'w') as outfile:
            json.dump(color_dict, outfile)

        with open(args.cache + '/overviews.json', 'w') as outfile:
            json.dump(overviews_dict, outfile)

        tps1 = time.perf_counter()
        if args.verbose > 0:
            print('=> DONE in', tps1 - tps0)
        else:
            print('=> DONE')

        print("Génération du graph et de l'ortho (par tuile) :")

        args_create_ortho_and_graph = cache.prep_ortho_and_graph(args.cache,
                                                                 overviews_dict,
                                                                 {
                                                                    'connString': conn_string,
                                                                    'table': args.table
                                                                 },
                                                                 {
                                                                    # 'nbBands': NB_BANDS,
                                                                    'spatialRef': spatial_ref_wkt
                                                                 },
                                                                 change)

        tps2 = time.perf_counter()
        if args.verbose > 0:
            print("    in ", tps2 - tps1, sep="")

        print(" Calcul")
        nb_tiles = len(args_create_ortho_and_graph)
        tps3 = time.perf_counter()
        print(" ", nb_tiles, "tuiles à traiter")
        cache.progress_bar(50, nb_tiles, args_create_ortho_and_graph)
        print('   |', end='', flush=True)

        batchSize = cpu_util * 100
        for numBatch in range(0, len(args_create_ortho_and_graph), batchSize):
            argument = args_create_ortho_and_graph[numBatch:numBatch + batchSize]
            if cpu_util > 1:
                pool = multiprocessing.Pool(cpu_util)
                pool.map(cache.create_ortho_and_graph_1arg, argument)

                pool.close()
                pool.join()
            else:
                for arg in argument:
                    cache.create_ortho_and_graph_1arg(arg)

            with open(args.cache + '/log.txt', 'a') as outfile:
                print(str(numBatch) + " to " + str(numBatch + batchSize - 1) + ": DONE",
                      file=outfile)

        print("|")
        tps4 = time.perf_counter()
        if args.verbose > 0:
            print("    in ", tps4 - tps3, sep="")
        print('=> DONE')

        tpsf = time.perf_counter()

        print("\n",
              nb_files - len(opi_duplicate),
              "/",
              nb_files, "OPI(s) ajoutée(s)", end='')

        if args.verbose > 0:
            print(" in", tpsf - tps0)
        else:
            print()

        if len(opi_duplicate) > 0:
            print("présence de doublons :")
            for opi_name in opi_duplicate:
                print(" -", opi_name)

    except Exception as err:
        print(err)
