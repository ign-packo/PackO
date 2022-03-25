# -*- coding: utf-8 -*-
"""
Script d'export d'une table de correspondance entre les entiers 32bits du graphe de mosaiquage et les noms d'OPI
"""
import os
import argparse
import json


def read_args():
    """Gestion des arguments"""
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", required=True, help="input overview")
    parser.add_argument(
        "-o", "--output", required=True, help="output CSV file"
    )
    return  parser.parse_args()

args = read_args()

fileOverviews = open(args.input)
overviews = json.load(fileOverviews)
fileOverviews.close()

with open(args.output, 'w') as out:
    for opi in overviews['list_OPI']:
        colors = overviews['list_OPI'][opi]
        out.write(opi + ';' + str(colors[0] + 256 * (colors[1] + 256 * colors[2])) + '\n')

