# -*- coding: utf-8 -*-
"""
Script de vectorisation du graphe à partir d'un cache d'images COG
"""
import os
import sys
import json
from osgeo import gdal

current = os.path.dirname(os.path.realpath(__file__))
parent = os.path.dirname(current)
sys.path.append(parent)

from cache_def import get_slab_path  # noqa: E402


def check_overviews(cache):
    overviews_path = os.path.join(cache, "overviews.json")

    # lecture du fichier overviews pour recuperer les infos du cache
    try:
        with open(overviews_path, encoding='utf-8') as fileOverviews:
            overviews = json.load(fileOverviews)
    except IOError:
        print(f"ERREUR: Le fichier '{overviews_path}' n'existe pas.")

    if 'pathDepth' not in overviews:
        raise SystemExit(f"ERREUR: L'attribut 'pathDepth' n'existe pas dans '{overviews_path}'.")
    path_depth = overviews['pathDepth']

    if 'level' not in overviews:
        raise SystemExit(f"ERREUR: L'attribut 'level' n'existe pas dans '{overviews_path}'.")
    if 'max' not in overviews['level']:
        raise SystemExit(f"ERREUR: L'attribut 'max' n'existe pas dans '{overviews_path}'.")
    level = overviews['level']['max']

    if 'resolution' not in overviews:
        raise SystemExit(f"ERREUR: L'attribut 'resolution' n'existe pas dans '{overviews_path}.")
    resol = overviews['resolution']

    proj = str(overviews['crs']['type']) + ':' + str(overviews['crs']['code'])

    return path_depth, level, resol, proj, overviews


# on recupere les infos concernant les patches dans le json en entree
def list_patches(patches, cache, path_depth, level):
    if 'features' not in patches:
        raise SystemExit(f"ERROR: Attribute 'features' does not exist in '{patches}'.")
    patches = patches['features']

    id_branch_patch = None
    list_patches = []
    for patch in patches:
        if patch['properties']['active'] is True:
            slabs = patch['properties']['slabs']
            id_branch_patch = patch['properties']['id_branch']
            for slab in slabs:
                x = slab[0]
                y = slab[1]

                slab_path = get_slab_path(int(x), int(y), int(path_depth))
                tile_path = os.path.join(cache, 'graph', str(level), slab_path[1:])
                list_patches.append(os.path.abspath(tile_path + '.tif'))

    return list_patches, id_branch_patch


def check_branch_patch(branch, id_branch_patch):
    if branch and id_branch_patch and int(branch) != id_branch_patch:
        raise SystemExit(f"** ERREUR: "
                         f"Pas de correspondance entre la branche indiquée '{branch}' "
                         f"et celle des retouches '{id_branch_patch}' !")

    if not branch and id_branch_patch:
        print(f"** La branche de retouches traitée est : '{id_branch_patch}'")
        branch = str(id_branch_patch)


def create_tiles(cache, level, branch, path_out, list_patches):
    graph_dir = os.path.join(cache, 'graph', str(level))

    # on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
    list_tiles = []
    for (root, dirs, files) in os.walk(graph_dir):
        for file in files:
            file = os.path.join(root, file)
            list_tiles.append(os.path.abspath(file))

    # fichier intermediaire contenant la liste de images pour le vrt
    with open(path_out + '.txt', 'w', encoding='utf-8') as f_out:
        for tile in list_tiles:
            # il faut filtrer uniquement les tuiles presentes a l'origine
            # on recupere juste le nom de la dalle sans extension -> 2 caracteres
            filename = os.path.basename(tile).split('.')[0]

            if len(filename) > 2:  # cas des tuiles avec retouche
                continue
            if tile in list_patches:
                # dans ce cas il faut ajouter la tuile index_branche + tilename a la liste
                tilename = os.path.basename(tile)
                tile_path = os.path.join(os.path.dirname(tile), str(branch) + '_' + tilename)
                f_out.write(tile_path + '\n')
            else:
                # on ajoute la tuile d'origine dans la liste pour creer le vrt
                f_out.write(tile + '\n')


def build_full_vrt(path_out, resol):
    # on construit un vrt a partir de la liste des images recuperee precedemment
    cmd_buildvrt = (
        'gdalbuildvrt'
        + ' -input_file_list '
        + path_out + '.txt '
        + path_out + '_graphTiles.vrt'
        + ' -tap'
        + ' -tr ' + str(resol) + ' ' + str(resol) + ' '
    )
    os.system(cmd_buildvrt)


def build_vrt_emprise(path_out):
    # on construit un 2eme vrt à partir du premier
    # (pour avoir la bonne structure avec les bons parametres : notamment l'emprise)
    cmd_buildvrt2 = (
        'gdalbuildvrt '
        + path_out + '_tmp.vrt '
        + path_out + '_graphTiles.vrt'
    )
    os.system(cmd_buildvrt2)


def build_vrt_32bits(path_out):
    # modification du VRT pour passage 32bits
    with open(path_out + '_tmp.vrt', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    with open(path_out + '_32bits.vrt', 'w', encoding='utf-8') as f:
        for line in lines:
            # on ecrit le code python au bon endroit dans le VRT
            if 'band="1"' in line:
                f.write('\t<VRTRasterBand dataType="Int32" band="1" '
                        'subClass="VRTDerivedRasterBand">\n')
                f.write('\t<PixelFunctionType>color_to_int32</PixelFunctionType>\n')
                f.write('\t<PixelFunctionLanguage>Python</PixelFunctionLanguage>\n')
                f.write('\t<PixelFunctionCode>\n')
                f.write('<![CDATA[\n')
                f.write('import numpy as np\n')
                f.write('def color_to_int32(in_ar, out_ar, xoff, yoff, xsize, ysize, \
                        raster_xsize, raster_ysize, buf_radius, gt, **kwargs):\n')
                f.write('\tout_ar[:] = in_ar[0] + 256 * in_ar[1] + 256 * 256 * in_ar[2]\n')
                f.write(']]>\n')
                f.write('\t</PixelFunctionCode>\n')
            elif 'band="2"' in line:
                pass
            elif 'band="3"' in line:
                pass
            elif '</VRTRaster' in line:
                pass
            elif '<OverviewList' in line:
                f.write('\t</VRTRasterBand>\n')
                f.write(line)
            else:
                f.write(line)


def create_tiles_vrt(output, path_out, resol, tilesize):
    tiles_dir = os.path.join(os.path.abspath(output), 'tiles')
    if not os.path.exists(tiles_dir):
        os.mkdir(tiles_dir)

    # on recupere l'emprise globale du chantier dont on veut extraire xmin, xmax, ymin, ymax
    info = gdal.Info(path_out + '_32bits.vrt')
    info_list = info.split('\n')

    ul, lr = '', ''
    for line in info_list:
        if 'Upper Left' in line:
            ul = line
        elif 'Lower Right' in line:
            lr = line

    ul = ul.replace('(', '').replace(')', '').replace(',', '')
    ul_split = ul.split(' ')
    x_min = ul_split[5]
    y_max = ul_split[6]

    lr = lr.replace('(', '').replace(')', '').replace(',', '')
    lr_split = lr.split(' ')
    x_max = lr_split[4]
    y_min = lr_split[5]

    # ces valeurs vont servir a gerer l'ensemble des gdalbuildvrt sur le chantier
    x_min = int(float(x_min) // 1000 * 1000)
    y_min = int(float(y_min) // 1000 * 1000)

    x_max = int((float(x_max) // 1000 + 1) * 1000)
    y_max = int((float(y_max) // 1000 + 1) * 1000)

    tile_size = int(resol * tilesize)

    for x in range(x_min, x_max, tile_size):
        for y in range(y_min, y_max, tile_size):
            cmd_vrt = (
                'gdalbuildvrt '
                + os.path.join(tiles_dir, str(x) + '_' + str(y) + '.vrt') + ' '
                + path_out + '_32bits.vrt'
                + ' -tr ' + str(resol) + ' ' + str(resol)
                + ' -te ' + str(x) + ' ' + str(y) + ' '
                + str(x + tile_size) + ' ' + str(y + tile_size)
            )
            os.system(cmd_vrt)
