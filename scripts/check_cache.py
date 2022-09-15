# coding: utf-8
"""This script tests if two caches are equivalent"""
import os
import argparse
import hashlib
import json


def read_args():
    """Parameters management"""

    parser = argparse.ArgumentParser()
    parser.add_argument("-s", "--sample",
                        help="cache path to be tested",
                        type=str)
    parser.add_argument("-r", "--ref",
                        help="reference cache path",
                        type=str)
    parser.add_argument("-v", "--verbose",
                        help="verbose (default: 0, meaning no verbose)",
                        type=int,
                        default=0)
    args_val = parser.parse_args()

    if args_val.verbose > 1:
        print("\nArguments: ", args_val)

    if not os.path.isdir(args_val.sample):
        raise SystemExit("Cache '" + args_val.sample + "' doesn't exist.")
    if not os.path.isdir(args_val.ref):
        raise SystemExit("Cache '" + args_val.ref + "' doesn't exist.")

    return args_val


def count_files(path, ext=""):
    """Return the number of files in a path"""
    return sum(f.endswith(ext) for root, dirs, files in os.walk(path) for f in files)


def get_list_files(path):
    """Return the list of files in a path"""
    list_files = []
    for (root, _, files) in os.walk(path):
        list_files += [os.path.join(root, file) for file in files]
    return list_files


def hash_bytestr_iter(bytesiter, hasher, ashexstr=False):
    """Return a hash depending on parameters"""
    for block in bytesiter:
        hasher.update(block)
    return hasher.hexdigest() if ashexstr else hasher.digest()


def file_as_blockiter(afile, blocksize=65536):
    """Read a file by blocks"""
    with afile:
        block = afile.read(blocksize)
        while len(block) > 0:
            yield block
            block = afile.read(blocksize)


def check_files_count(sample, ref):
    """Check files count between two datasets"""
    # directories for cache
    sample_opi_num = count_files(os.path.join(sample, 'opi'))
    sample_ortho_num = count_files(os.path.join(sample, 'ortho'))
    sample_graph_num = count_files(os.path.join(sample, 'graph'))

    # directories for ref
    ref_opi_num = count_files(os.path.join(ref, 'opi'))
    ref_ortho_num = count_files(os.path.join(ref, 'ortho'))
    ref_graph_num = count_files(os.path.join(ref, 'graph'))

    print('# Test nombre de fichiers')
    if not sample_opi_num == ref_opi_num:
        raise SystemExit('## ERREUR : Nb OPI diff entre les deux caches')

    if not sample_ortho_num == ref_ortho_num:
        raise SystemExit(
            '## ERREUR : Nb ortho diff entre les deux caches'
        )

    if not sample_graph_num == ref_graph_num:
        raise SystemExit(
            '## ERREUR : Nb graph diff entre les deux caches'
        )

    # total
    sample_file_num = count_files(sample)
    ref_file_num = count_files(ref)

    if not sample_file_num == ref_file_num:
        raise SystemExit(
            '## ERREUR : Nb fichiers diff entre les deux caches')

    # total json
    sample_file_num_json = count_files(sample, 'json')
    ref_file_num_json = count_files(ref, 'json')

    if sample_file_num_json != ref_file_num_json:
        raise SystemExit(
            '## ERREUR : Nb JSON diff entre les deux caches')

    # total tif
    sample_file_num_tif = count_files(sample, 'tif')
    ref_file_num_tif = count_files(ref, 'tif')

    if sample_file_num_tif != ref_file_num_tif:
        raise SystemExit(
            '## ERREUR : Nb TIFF diff entre les deux caches')
    print('## Fin test nombre de fichiers : OK')


def no_empty_file(sample):
    """Check if the dataset has no empty files"""
    list_files = get_list_files(sample)

    print('# Test fichiers vides')

    result = any(os.path.getsize(file) == 0 for file in list_files)
    if result:
        raise SystemExit('ERREUR : Le cache contient au moins un fichier vide')
    print('## Fin test fichiers vides : OK')


def check_md5(sample, ref):
    """Check if both datasets have the same files"""
    # opis
    list_files_sample_opi = get_list_files(os.path.join(sample, 'opi'))
    list_files_ref_opi = get_list_files(os.path.join(ref, 'opi'))

    list_keys_ref_opi = [(file,
                          hash_bytestr_iter(file_as_blockiter(open(file, 'rb')),
                                            hashlib.md5(), True))
                         for file in list_files_ref_opi]

    list_keys_sample_opi = [(file,
                             hash_bytestr_iter(file_as_blockiter(open(file, 'rb')),
                                               hashlib.md5(), True))
                            for file in list_files_sample_opi]

    # [[file, md5_sample, md5_ref],[file2, md5_sample, md5_ref],...]
    print('# Test clés MD5 OPI')
    for key, value in list_keys_sample_opi:
        for ref_elem in list_keys_ref_opi:
            if os.path.basename(ref_elem[0]) == key:
                if ref_elem[1] != value:
                    raise SystemExit(
                        f"## ERREUR : Les hash pour le fichier '{key}' ne sont pas égaux"
                    )

    print("## Fin test clés MD5 OPI : OK")

    # ortho
    list_files_sample_ortho = get_list_files(os.path.join(sample, 'ortho'))
    list_files_ref_ortho = get_list_files(os.path.join(ref, 'ortho'))

    list_keys_ref_ortho = [(file,
                            hash_bytestr_iter(file_as_blockiter(open(file, 'rb')),
                                              hashlib.md5(), True))
                           for file in list_files_ref_ortho]

    list_keys_sample_ortho = [(file,
                               hash_bytestr_iter(file_as_blockiter(open(file, 'rb')),
                                                 hashlib.md5(), True))
                              for file in list_files_sample_ortho]

    # [[file, md5_sample, md5_ref],[file2, md5_sample, md5_ref],...]
    print('# Test clés MD5 ORTHO')
    for value in list_keys_sample_ortho:
        key = os.path.basename(value[0])
        hash_value = value[1]
        for ref_elem in list_keys_ref_ortho:
            if os.path.basename(ref_elem[0]) == key:
                if ref_elem[1] != hash_value:
                    raise SystemExit(
                        f"## ERREUR : Les hash pour le fichier '{key}' ne sont pas égales \ "
                        f"MD5 {value[0]} = {value[1]} / {ref_elem[0]} = {ref_elem[1]}"
                    )

    print('## Fin test clés MD5 ORTHO : OK')


def check_overviews(sample, ref):
    """Check overviews files of the two datasets"""
    try:
        with open(ref + '/overviews.json') as ref_overviews:
            ref_data = json.load(ref_overviews)
            # on prend la premiere opi pour retrouver type cache
            ref_first_opi = list(ref_data['list_OPI'])[0]
            try:
                with open(sample + '/overviews.json') as sample_overviews:
                    sample_data = json.load(sample_overviews)
                    # on prend la premiere opi pour retrouver type cache
                    sample_first_opi = list(sample_data['list_OPI'])[0]
                    print('# Test fichiers overviews')
                    # test canaux des caches
                    ref_rgb = ref_data['list_OPI'][ref_first_opi]['with_rgb']
                    ref_ir = ref_data['list_OPI'][ref_first_opi]['with_ir']

                    sample_rgb = sample_data['list_OPI'][sample_first_opi]['with_rgb']
                    sample_ir = sample_data['list_OPI'][sample_first_opi]['with_ir']

                    if ref_rgb != sample_rgb or ref_ir != sample_ir:
                        raise SystemExit('## ERREUR : Incohérence type cache')

                    print('## Test type cache : OK')

                    # on parcourt la reference en vérifiant que
                    # les données à tester correspondent bien
                    for key in ref_data:
                        if key == 'list_OPI':
                            if key not in sample_data:
                                raise SystemExit(
                                    f"## ERREUR : attribut '{key}' non présent \
                                     dans '{os.path.join(sample, 'overviews.json')}'"
                                )

                            # on vérifie qu'on a bien les memes noms d'OPI
                            if set(ref_data[key]) != set(sample_data[key]):
                                raise SystemExit("## ERREUR : Incohérence de nom d'OPI")

                            for opi in ref_data[key]:
                                opi_ref = ref_data[key][opi]
                                opi_sample = sample_data[key][opi]
                                if len(opi_ref['color']) != len(opi_sample['color']):
                                    raise SystemExit('## ERREUR : Incohérence couleurs graphe')

                                result = all(str(c).isdigit() for c in opi_sample['color'])
                                if not result:
                                    raise SystemExit(
                                        '## ERREUR : Valeur(s) couleur(s) incorrecte(s)'
                                    )

                                if opi_ref['date'] != opi_sample['date'] or \
                                        opi_ref['time_ut'] != opi_sample['time_ut']:
                                    raise SystemExit('## ERREUR : Incohérence métadonnées')
                        else:
                            if key not in sample_data:
                                raise SystemExit(
                                    f"## ERREUR : Attribut '{key}' non présent \
                                     dans '{os.path.join(ref, 'overviews.json')}'"
                                )

                            if ref_data[key] != sample_data[key]:
                                raise SystemExit(f"## ERREUR : Non correspondance pour '{key}'")

                    print('## Fin test fichiers overviews : OK')
            except IOError:
                print(f"ERREUR: Le fichier '{sample + '/overviews.json'}' n'existe pas.")
    except IOError:
        print(f"ERREUR: Le fichier '{ref + '/overviews.json'}' n'existe pas.")


args_input = read_args()

print(f"Cache de référence : '{args_input.ref}'")
print(f"Cache testé : '{args_input.sample}'")

# vérifier l'overviews en premier
check_overviews(args_input.sample, args_input.ref)

# vérification sur les fichiers
check_files_count(args_input.sample, args_input.ref)
no_empty_file(args_input.sample)

# check_md5(args_input.sample, args_input.ref)
