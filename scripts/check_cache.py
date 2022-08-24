# coding: utf-8
"""This script create or update a cache with a list of OPI"""
import os
import argparse
import hashlib
import json


def read_args():
    """Gestion des arguments"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-s", "--sample",
                        help="cache directory",
                        type=str)
    parser.add_argument("-r", "--ref",
                        help="reference cache directory",
                        type=str)
    parser.add_argument("-v", "--verbose",
                        help="verbose (default: 0, meaning no verbose)",
                        type=int,
                        default=0)
    args = parser.parse_args()

    if args.verbose > 1:
        print("\nArguments: ", args)

    if not os.path.isdir(args.sample):
        raise SystemExit("Cache '" + args.sample + "' doesn't exist.")
    if not os.path.isdir(args.ref):
        raise SystemExit("Cache '" + args.ref + "' doesn't exist.")

    return args


def count_files(path):
    count = sum([len(files) for root, dirs, files in os.walk(path)])
    return count


def get_list_files(path):
    list_files = []
    for (root, dirs, files) in os.walk(path):
        list_files += [os.path.join(root, file) for file in files]
    return list_files


def hash_bytestr_iter(bytesiter, hasher, ashexstr=False):
    for block in bytesiter:
        hasher.update(block)
    return hasher.hexdigest() if ashexstr else hasher.digest()


def file_as_blockiter(afile, blocksize=65536):
    with afile:
        block = afile.read(blocksize)
        while len(block) > 0:
            yield block
            block = afile.read(blocksize)


def check_files_count(sample, ref):
    # directories for cache
    sample_opi_num = count_files(os.path.join(sample, 'opi'))
    sample_ortho_num = count_files(os.path.join(sample, 'ortho'))
    sample_graph_num = count_files(os.path.join(sample, 'graph'))

    # directories for ref
    ref_opi_num = count_files(os.path.join(ref, 'opi'))
    ref_ortho_num = count_files(os.path.join(ref, 'ortho'))
    ref_graph_num = count_files(os.path.join(ref, 'graph'))


    print("# Test nombre de fichiers")


    # TODO : homogeneiser les messages d'erreur
    if not sample_opi_num == ref_opi_num:
        raise SystemExit(f"## ERREUR : Nb OPI diff {sample_opi_num} (cache) et {ref_opi_num} (ref)")

    if not sample_ortho_num == ref_ortho_num:
        raise SystemExit(
            f"## ERREUR : Nb ortho diff {sample_ortho_num} (cache) et {ref_ortho_num} (ref)")

    if not sample_graph_num == ref_graph_num:
        raise SystemExit(
            f"## ERREUR : Nb graph diff {sample_graph_num} (cache) et {ref_graph_num} (ref)"
        )

    # total
    sample_file_num = count_files(sample)
    ref_file_num = count_files(ref)

    if not sample_file_num == ref_file_num:
        raise SystemExit(
            f"##ERREUR : Nb fichiers diff {sample_file_num} (cache) et {ref_file_num} (sample)")
    # TODO
    print("## Fin test nombre de fichiers : OK")


def no_empty_file(sample):
    list_files = get_list_files(sample)

    print("# Test fichiers vides")

    result = any(os.path.getsize(file) == 0 for file in list_files)
    if result:
        raise SystemExit(f"ERREUR : Le cache {sample} contient au moins un fichier vide")
    print("## Fin test fichiers vides : OK")


def check_md5(sample, ref):
    # ortho
    list_files_sample_ortho = get_list_files(os.path.join(sample, 'ortho'))
    list_files_ref_ortho = get_list_files(os.path.join(ref, 'ortho'))

    if len(list_files_sample_ortho) != len(list_files_ref_ortho):
        raise SystemExit("# ERREUR : Il n'y a pas le même nombre d'ortho dans les deux caches")

    list_keys_ref_ortho = [(file, hash_bytestr_iter(file_as_blockiter(open(file, 'rb')), hashlib.md5(), True))
                           for file in list_files_ref_ortho]

    list_keys_sample_ortho = [(file, hash_bytestr_iter(file_as_blockiter(open(file, 'rb')), hashlib.md5(), True))
                              for file in list_files_sample_ortho]

    # [[file, md5_sample, md5_ref],[file2, md5_sample, md5_ref],...]
    print("# Test clés MD5 ORTHO")
    for value in list_keys_sample_ortho:
        key = os.path.basename(value[0])
        hash_value = value[1]
        for ref_elem in list_keys_ref_ortho:
            if os.path.basename(ref_elem[0]) == key:
                if ref_elem[1] != hash_value:
                    raise SystemExit(f"## ERREUR : Les hash pour le fichier {key} ne sont pas égales")

    print("## Fin test clés MD5 ORTHO : OK")

    # opis
    list_files_sample_opi = get_list_files(os.path.join(sample, 'opi'))
    list_files_ref_opi = get_list_files(os.path.join(ref, 'opi'))

    if len(list_files_sample_opi) != len(list_files_ref_opi):
        raise SystemExit("# ERREUR : Il n'y a pas le même nombre d'opi dans les deux caches")

    list_keys_ref_opi = [(file, hash_bytestr_iter(file_as_blockiter(open(file, 'rb')), hashlib.md5(), True))
                         for file in list_files_ref_opi]

    list_keys_sample_opi = [(file, hash_bytestr_iter(file_as_blockiter(open(file, 'rb')), hashlib.md5(), True))
                            for file in list_files_sample_opi]

    # [[file, md5_sample, md5_ref],[file2, md5_sample, md5_ref],...]
    print("# Test clés MD5 OPI")
    for key, value in list_keys_sample_opi:
        for ref_elem in list_keys_ref_opi:
            if os.path.basename(ref_elem[0]) == key:
                if ref_elem[1] != value:
                    raise SystemExit(f"## ERREUR : Les hash pour le fichier {key} ne sont pas égaux")

    print("## Fin test clés MD5 OPI : OK")


def check_overviews(sample, ref):
    with open(sample + '/overviews.json') as sample_overviews:
        sample_data = json.load(sample_overviews)

    with open(ref + '/overviews.json') as ref_overviews:
        ref_data = json.load(ref_overviews)

    print(sample_data)

    print("# Test fichiers overviews")
    # on parcourt la reference en vérifiant que les donnees à tester correspondent bien
    for key in ref_data:
        print(key)
        if key not in sample_data:
            raise SystemExit(f"## ERREUR : attribut {key} non présent dans {os.path.join(ref, 'overviews.json')}")

    print("## Fin test fichiers overviews")


args = read_args()

print(f"Cache de référence : {args.ref}")
print(f"Cache testé : {args.sample}")

# vérifier l'overviews en premier
check_overviews(args.sample, args.ref)

# vérification sur les fichiers
check_files_count(args.sample, args.ref)
no_empty_file(args.sample)

check_md5(args.sample, args.ref)

