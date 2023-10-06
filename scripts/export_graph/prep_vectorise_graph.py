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
    """Check if overviews file is compliant with standard"""
    overviews_path = os.path.join(cache, "overviews.json")

    # lecture du fichier overviews pour recuperer les infos du cache
    try:
        with open(overviews_path, encoding='utf-8') as file_overviews:
            overviews = json.load(file_overviews)
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
    """Get data for patches in input json"""
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
                x = slab[0]  # pylint: disable=C0103
                y = slab[1]  # pylint: disable=C0103

                slab_path = get_slab_path(int(x), int(y), int(path_depth))
                full_slab_path = os.path.join(cache, 'graph', str(level), slab_path[1:])
                list_patches.append(os.path.abspath(full_slab_path + '.tif'))

    return list_patches, id_branch_patch


def check_branch_patch(branch, id_branch_patch):
    """Check if input branch exists"""
    if branch and id_branch_patch and int(branch) != id_branch_patch:
        raise SystemExit(f"** ERREUR: "
                         f"Pas de correspondance entre la branche indiquée '{branch}' "
                         f"et celle des retouches '{id_branch_patch}' !")

    if not branch and id_branch_patch:
        print(f"** La branche de retouches traitée est : '{id_branch_patch}'")
        branch = str(id_branch_patch)


def create_list_slabs(cache, level, branch, path_out, list_patches):
    """Create slabs list for vectorization"""
    graph_dir = os.path.join(cache, 'graph', str(level))

    # on parcourt le repertoire graph du cache pour recuperer l'ensemble des images de graphe
    list_slabs = []
    for (root, dirs, files) in os.walk(graph_dir):
        for file in files:
            file = os.path.join(root, file)
            list_slabs.append(os.path.abspath(file))

    # fichier intermediaire contenant la liste de images pour le vrt
    with open(path_out + '.txt', 'w', encoding='utf-8') as f_out:
        for slab in list_slabs:
            # il faut filtrer uniquement les dalles presentes a l'origine
            # on recupere juste le nom de la dalle sans extension -> 2 caracteres
            filename = os.path.basename(slab).split('.')[0]

            if len(filename) > 2:  # cas des dalles avec retouche
                continue
            if slab in list_patches:
                # dans ce cas il faut ajouter la dalle index_branche + slab_name a la liste
                slab_name = os.path.basename(slab)
                slab_path = os.path.join(os.path.dirname(slab), str(branch) + '_' + slab_name)
                f_out.write(slab_path + '\n')
            else:
                # on ajoute la dalle d'origine dans la liste pour creer le vrt
                f_out.write(slab + '\n')


def build_full_vrt(path_out, resol):
    """Build full vrt"""
    # on construit un vrt a partir de la liste des images recuperee precedemment
    cmd_buildvrt = (
        'gdalbuildvrt'
        + ' -input_file_list '
        + path_out + '.txt '
        + path_out + '_graph_tmp.vrt'
        + ' -tap'
        + ' -tr ' + str(resol) + ' ' + str(resol) + ' '
    )
    os.system(cmd_buildvrt)


def build_vrt_emprise(path_out):
    """Build vrt to get correct spatial hold"""
    # on construit un 2eme vrt à partir du premier
    # (pour avoir la bonne structure avec les bons parametres : notamment l'emprise)
    cmd_buildvrt2 = (
        'gdalbuildvrt '
        + path_out + '_emprise_tmp.vrt '
        + path_out + '_graph_tmp.vrt'
    )
    os.system(cmd_buildvrt2)


def build_vrt_32bits(path_out):
    """Build vrt from a 3-8bits channels to 32bits monochannel"""
    # modification du VRT pour passage 32bits
    with open(path_out + '_emprise_tmp.vrt', 'r', encoding='utf-8') as file:
        lines = file.readlines()
    with open(path_out + '_32bits.vrt', 'w', encoding='utf-8') as file:
        for line in lines:
            # on ecrit le code python au bon endroit dans le VRT
            if 'band="1"' in line:
                file.write('\t<VRTRasterBand dataType="Int32" band="1" '
                           'subClass="VRTDerivedRasterBand">\n')
                file.write('\t<PixelFunctionType>color_to_int32</PixelFunctionType>\n')
                file.write('\t<PixelFunctionLanguage>Python</PixelFunctionLanguage>\n')
                file.write('\t<PixelFunctionCode>\n')
                file.write('<![CDATA[\n')
                file.write('import numpy as np\n')
                file.write('def color_to_int32(in_ar, out_ar, xoff, yoff, xsize, ysize, \
                        raster_xsize, raster_ysize, buf_radius, gt, **kwargs):\n')
                file.write('\tout_ar[:] = in_ar[0] + 256 * in_ar[1] + 256 * 256 * in_ar[2]\n')
                file.write(']]>\n')
                file.write('\t</PixelFunctionCode>\n')
            elif 'band="2"' in line:
                pass
            elif 'band="3"' in line:
                pass
            elif '</VRTRaster' in line:
                pass
            elif '<OverviewList' in line:
                file.write('\t</VRTRasterBand>\n')
                file.write(line)
            else:
                file.write(line)


def create_tiles_vrt(output, path_out, resol, tilesize, bbox):
    """Create command line for each tile to be vectorized"""
    tiles_dir = os.path.join(os.path.abspath(output), 'tiles')
    if not os.path.exists(tiles_dir):
        os.mkdir(tiles_dir)

    if any(elem is None for elem in str(bbox).split(' ')) or bbox is None:
        # on recupere l'emprise globale du chantier dont on veut extraire xmin, xmax, ymin, ymax
        info = gdal.Info(path_out + '_32bits.vrt')
        info_list = info.split('\n')

        upper_left, lower_right = '', ''
        for line in info_list:
            if 'Upper Left' in line:
                upper_left = line
            elif 'Lower Right' in line:
                lower_right = line

        upper_left = upper_left.replace('(', '').replace(')', '').replace(',', '')
        ul_split = upper_left.split(' ')
        x_min = ul_split[5]
        y_max = ul_split[6]

        lower_right = lower_right.replace('(', '').replace(')', '').replace(',', '')
        lr_split = lower_right.split(' ')
        x_max = lr_split[4]
        y_min = lr_split[5]

        # ces valeurs vont servir a gerer l'ensemble des gdalbuildvrt sur le chantier
        x_min = int(float(x_min) // 1000 * 1000)
        y_min = int(float(y_min) // 1000 * 1000)

        x_max = int((float(x_max) // 1000 + 1) * 1000)
        y_max = int((float(y_max) // 1000 + 1) * 1000)
    else:
        coords = str(bbox).split(' ')
        x_min = coords[0]
        y_min = coords[1]
        x_max = coords[2]
        y_max = coords[3]

    tile_size = int(resol * tilesize)

    for x in range(x_min, x_max, tile_size):  # pylint: disable=C0103
        for y in range(y_min, y_max, tile_size):  # pylint: disable=C0103
            cmd_vrt = (
                'gdalbuildvrt '
                + os.path.join(tiles_dir, str(x) + '_' + str(y) + '.vrt') + ' '
                + path_out + '_32bits.vrt'
                + ' -tr ' + str(resol) + ' ' + str(resol)
                + ' -te ' + str(x) + ' ' + str(y) + ' '
                + str(x + tile_size) + ' ' + str(y + tile_size)
            )
            os.system(cmd_vrt)
