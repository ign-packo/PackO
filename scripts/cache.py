# coding: utf-8
"""This script create or update a cache with a list of OPI"""
import os
import argparse
import json
import glob
import multiprocessing
import gdal

import cache_def as cache

user = os.getenv('PGUSER', default='postgres')
host = os.getenv('PGHOST', default='localhost')
database = os.getenv('PGDATABASE', default='pcrs')
password = os.getenv('PGPASSWORD', default='postgres')  # En dur, pas top...
port = os.getenv('PGPORT', default='5432')

conn_string = "PG:host="\
    + host + " dbname=" + database\
    + " user=" + user + " password=" + password

if gdal.OpenEx(conn_string, gdal.OF_VECTOR) is None:
    raise SystemExit("Connection to database failed")

NB_BANDS = 3


def read_args(update):
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input",
                        required=True,
                        help="input OPI pattern")
    parser.add_argument("-c", "--cache",
                        help="cache directory (default: cache)",
                        type=str,
                        default="cache")
    if update is False:
        parser.add_argument("-o", "--overviews",
                            help="params for the mosaic (default: ressources/LAMB93_5cm.json)",
                            type=str,
                            default="ressources/LAMB93_5cm.json")
        parser.add_argument("-l", "--level",
                            help="level range for the calculation"
                            " (default: values from ressources file)"
                            " (e.g., 15 19)",
                            type=int,
                            nargs='+')
    parser.add_argument("-t", "--table",
                        help="graph table (default: graphe_pcrs56_zone_test)",
                        type=str,
                        default="graphe_pcrs56_zone_test")
    parser.add_argument("-v", "--verbose",
                        help="verbose (default: 0)",
                        type=int,
                        default=0)
    args = parser.parse_args()

    verbose = args.verbose

    if os.path.isdir(args.input):
        raise SystemExit("create_cache.py: error: invalid pattern: " + args.input)

    if update is False:
        if os.path.isdir(args.cache):
            raise SystemExit("Cache (" + args.cache + ") already in use")

        if args.level:
            if len(args.level) > 2:
                raise SystemExit("create_cache.py: error: argument -l/--level:"
                                 " one or two arguments expected.")
            if len(args.level) == 2 and args.level[0] > args.level[1]:
                lvl_max = args.level[0]
                args.level[0] = args.level[1]
                args.level[1] = lvl_max
    else:
        if not os.path.isdir(args.cache):
            raise SystemExit("Cache (" + args.cache + ") doesn't exist")

    if verbose > 0:
        print("Arguments: ", args)

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
        overviews_dict['dataSet']['level'] = {}

        if args.level:
            if args.level[0] < overviews_dict['level']['min'] \
                    or (len(args.level) == 1 and args.level[0] > overviews_dict['level']['max']) \
                    or (len(args.level) > 1 and args.level[1] > overviews_dict['level']['max']):
                raise SystemExit("create_cache.py: error: argument -l/--level: "
                                 + str(args.level) +
                                 ": out of default level range: "
                                 + str(overviews_dict['level']))

        level_min = overviews_dict['level']['min'] if args.level is None else args.level[0]
        level_max = overviews_dict['level']['max'] if args.level is None \
            else level_min if len(args.level) == 1 else args.level[1]

        overviews_dict['dataSet']['level'] = {
            'min': level_min,
            'max': level_max
        }

        color_dict = {}

    return overviews_dict, color_dict


def generate(update):
    """Create a cache from a list of input OPI."""

    args = read_args(update)
    overviews_dict, color_dict = prep_dict(args, update)

    spatial_ref = gdal.osr.SpatialReference()
    spatial_ref.ImportFromEPSG(overviews_dict['crs']['code'])
    spatial_ref_wkt = spatial_ref.ExportToWkt()

    list_filename = glob.glob(args.input)

    if (len(list_filename) == 0):
        raise SystemExit("WARNING: Empty input folder: nothing to add in cache")

    print(len(list_filename), "image(s) à traiter")
    # Decoupage des images et calcul de l'emprise globale
    print("Découpe des images :")
    print(" Préparation")

    args_cut_image, opi_duplicate, change = cache.prep_tiling(list_filename,
                                                              args.cache,
                                                              overviews_dict,
                                                              color_dict,
                                                              {
                                                                 'nbBands': NB_BANDS,
                                                                 'spatialRef': spatial_ref_wkt
                                                              })

    print(" Découpage")

    cpu_dispo = multiprocessing.cpu_count()
    pool = multiprocessing.Pool(cpu_dispo - 1)
    pool.map(cache.cut_image_1arg, args_cut_image)

    pool.close()
    pool.join()

    with open(args.cache + '/cache_mtd.json', 'w') as outfile:
        json.dump(color_dict, outfile)

    print('=> DONE')

    print("Génération du graph et de l'ortho (par tuile) :")

    args_create_ortho_and_graph = cache.prep_ortho_and_graph(args.cache,
                                                             overviews_dict,
                                                             {
                                                                 'connString': conn_string,
                                                                 'table': args.table
                                                             },
                                                             {
                                                                 'nbBands': NB_BANDS,
                                                                 'spatialRef': spatial_ref_wkt
                                                             },
                                                             change)

    print('   |', end='', flush=True)
    pool = multiprocessing.Pool(cpu_dispo - 1)
    pool.map(cache.create_ortho_and_graph_1arg, args_create_ortho_and_graph)

    pool.close()
    pool.join()
    print("|")

    print('=> DONE')

    # Finitions
    with open(args.cache + '/overviews.json', 'w') as outfile:
        json.dump(overviews_dict, outfile)

    print("\n",
          len(list_filename) - len(opi_duplicate),
          "/",
          len(list_filename), "OPI(s) ajoutée(s)")
    if len(opi_duplicate) > 0:
        print("présence de doublons :")
        for opi_name in opi_duplicate:
            print(" -", opi_name)
