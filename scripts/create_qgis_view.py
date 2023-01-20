# coding: utf-8
"""This script creates a PackO client view for QGIS"""

import argparse
import re
import json
import os.path
import platform
from copy import deepcopy
import numpy as np
from lxml import etree
from osgeo import gdal
from qgis.core import (
    QgsApplication,
    QgsProject,
    QgsCoordinateReferenceSystem,
    QgsColorRampShader,
    QgsPalettedRasterRenderer,
    QgsFields,
    QgsField,
    QgsWkbTypes,
)
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtCore import QVariant
from process_requests import check_get_post, response2pyobj, xml_from_wmts
from process_qlayers import add_layer_to_map, create_vector


def read_args():
    """ Handle arguments """
    parser = argparse.ArgumentParser()
    parser.add_argument('-u', '--url',
                        help="http://[serveur]:[port] (default: http://localhost:8081)",
                        type=str, default='http://localhost:8081')
    parser.add_argument('-c', '--cache_id',
                        required=True,
                        help='cache id',
                        type=int)
    parser.add_argument('-b', '--branch_name',
                        help="name of new branch to be created on cache (default: newBranch)",
                        type=str, default='newBranch')
    parser.add_argument('-s', '--style_ortho',
                        help="style for ortho to be exported to xml (default: RVB)",
                        type=str, default='RVB', choices=['RVB', 'IR', 'IRC'])
    parser.add_argument('-o', '--output',
                        help="output qgis view path (default: ./view.qgz)",
                        type=str, default='./view.qgz')
    parser.add_argument('-z', '--zoom', nargs=2,
                        help="zoom levels as zmin zmax (default: 3025 10000000)\
                        -> graph layer visibility scale [1:zmax,1:zmin]",
                        type=int, default=[3025, 10000000])
    parser.add_argument('-m', '--macros',
                        help="macros file path",
                        type=str)
    parser.add_argument('-v', '--verbose',
                        help="verbose (default: 0, meaning no verbose)",
                        type=int, default=0)
    argum = parser.parse_args()

    if argum.verbose > 0:
        print('\nArguments: ', argum)

    return argum


def suppress_cachetag(xml_in, xml_out):
    """ Suppress Cache tag from xml file """
    tree_xml = etree.parse(xml_in)
    root_xml = tree_xml.getroot()
    all_cache_tags = []
    for element in root_xml.iter('Cache'):
        all_cache_tags.append(element)
    if len(all_cache_tags) > 0:
        for tg in all_cache_tags:
            root_xml.remove(tg)
    else:
        print(f"WARNING: 'Cache' not found in '{xml_in}' => '{xml_out}' identical to '{xml_in}'")
    tree_xml.write(xml_out)
    print(f"File '{xml_out}' written")


ARG = read_args()


def print_info_add_layer(layer_name):
    """ print info when layer added to view """
    if ARG.verbose > 0:
        print(f"-> '{layer_name}' layer added to view")


def print_info_visib_scale(layer_name, zmin, zmax):
    """ print info on visibility scale """
    if ARG.verbose > 0:
        print(f'\t{layer_name} layer visibility scale: [1:{zmax},1:{zmin}]')


# check input url
url_pattern = r'^https?:\/\/[0-9A-z.]+\:[0-9]+$'
if not re.match(url_pattern, ARG.url):
    raise SystemExit(f"ERROR: URL '{ARG.url}' is invalid")

# check input id cache
resp_get_caches = check_get_post(ARG.url + '/caches', is_get=True)
list_all_caches = response2pyobj(resp_get_caches)
cache = next((c for c in list_all_caches if c['id'] == ARG.cache_id), None)
if cache is None:
    raise SystemExit(f'ERROR: cache id {ARG.cache_id} is invalid')

# check input branch name
branch_name = ARG.branch_name.strip()
if not branch_name:
    raise SystemExit('ERROR: Empty branch name')

# check input macros filepath
if ARG.macros and not os.path.isfile(ARG.macros):
    raise SystemExit(f"ERROR: Unable to open macros file '{ARG.macros}'")

# check output directory
dirpath_out = os.path.dirname(os.path.normpath(ARG.output))
if not os.path.isdir(dirpath_out):
    raise SystemExit(f"ERROR: '{dirpath_out}' is not a valid directory")

# check overviews file and get info
overviews_path = cache['path'] + '/overviews.json'
try:
    with open(overviews_path, 'r', encoding='utf-8') as fileOverviews:
        overviews = json.load(fileOverviews)
        slab_width = overviews['slabSize']['width']
        slab_height = overviews['slabSize']['height']
        if slab_width is None or slab_height is None:
            raise SystemExit(f"ERROR: No 'slabSize' values in '{overviews_path}'!")
        if slab_width != slab_height:
            print(f"WARNING: Slab width(={slab_width}) <> height(={slab_height}) \
in '{overviews_path}'!")
        tms = overviews['identifier']
        if tms is None:
            raise SystemExit(f"ERROR: No 'identifier' value in '{overviews_path}'")
except IOError:
    raise SystemExit(f"ERROR: Unable to open file '{overviews_path}'")

# ---------- create new branch on cache ----------
req_post_branch = ARG.url + '/branch?name=' + branch_name + \
           '&idCache=' + str(ARG.cache_id)
resp_post_branch = check_get_post(req_post_branch, is_get=False)
# get branch id
resp_get_branches = check_get_post(ARG.url + '/branches', is_get=True)
list_all_branches = response2pyobj(resp_get_branches)
branch = next((b for b in list_all_branches if b['name'] == branch_name))
branch_id = branch['id']
print(f"Branch '{branch_name}' created (idBranch={branch_id}) on cache '{cache['name']}'")

# ---------- export ortho and graph xml ---------
wmts_url = f'WMTS:{ARG.url}/{branch_id}/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0'
wmts_ortho = f'{wmts_url},layer=ortho,style={ARG.style_ortho}'
wmts_graph = f'{wmts_url},layer=graph'

xml_ortho_tmp = dirpath_out + '/ortho_tmp.xml'
xml_graph_tmp = dirpath_out + '/graph_tmp.xml'
xml_from_wmts(wmts_ortho, xml_ortho_tmp)
xml_from_wmts(wmts_graph, xml_graph_tmp)

# suppress Cache tag from previous graph and ortho xml to avoid creation of local cache
xml_ortho = dirpath_out + '/ortho.xml'
xml_graph = dirpath_out + '/graph.xml'
suppress_cachetag(xml_ortho_tmp, xml_ortho)
suppress_cachetag(xml_graph_tmp, xml_graph)
# TODO: suppress xml_ortho_tmp and xml_graph_tmp

# --------- create contours vrt from graph.xml -----------
vrt_tmp = dirpath_out + '/graph_contour_tmp.vrt'
ds = gdal.BuildVRT(vrt_tmp, xml_graph)
ds = None
print(f"File '{vrt_tmp}' written")
# modify vrt
tree = etree.parse(vrt_tmp)
root = tree.getroot()
all_rband_tags = []
for elem in root.iter('VRTRasterBand'):
    all_rband_tags.append(elem)
if len(all_rband_tags) > 0:
    for rband in all_rband_tags:
        # keep one VRTRasterBand and suppress the rest
        if int(rband.attrib['band']) != 1:
            root.remove(rband)
        else:
            # add attribut subClass to VRTRasterBand tag
            rband.attrib.update({'subClass': 'VRTDerivedRasterBand'})
            # change text of ColorInterp tag
            col = rband.find('ColorInterp')
            col.text = 'Gray'
            # add child tag Metadata to VRTRasterBand tag
            mdata = etree.Element('Metadata')
            rband.insert(1, mdata)
            ch_mdata = {'STATISTICS_APPROXIMATE': 'YES', 'STATISTICS_MAXIMUM': '255',
                        'STATISTICS_MEAN': '0.01', 'STATISTICS_MINIMUM': '0',
                        'STATISTICS_STDDEV': '2.0', 'STATISTICS_VALID_PERCENT': '100'}
            # add subchildren tags MDI to Metadata tag
            for key, val in ch_mdata.items():
                ch = etree.SubElement(mdata, 'MDI', attrib={'key': key})
                ch.text = val
            # add children tags ComplexSource for band 2 and 3
            complsrc = rband.find('ComplexSource')
            for i in range(2, 4):
                tmp = deepcopy(complsrc)
                srcband = tmp.find('SourceBand')
                srcband.text = str(i)
                rband.append(tmp)
            # add Python tags and code
            pycode = etree.SubElement(rband, 'PixelFunctionLanguage')
            pycode.text = 'Python'
            pycode = etree.SubElement(rband, 'PixelFunctionType')
            pycode.text = 'color_to_contour'
            pycode2 = etree.SubElement(rband, 'PixelFunctionCode')
            data = '''
import numpy as np
def color_to_contour(in_ar, out_ar, xoff, yoff, xsize, ysize, raster_xsize, raster_ysize, \
buf_radius, gt, **kwargs):
    R = np.logical_or(in_ar[0] != np.pad(in_ar[0], 1, 'edge')[0:-2,1:-1], \
in_ar[0] != np.pad(in_ar[0], 1, 'edge')[1:-1,0:-2])
    V = np.logical_or(in_ar[1] != np.pad(in_ar[1], 1, 'edge')[0:-2,1:-1], \
in_ar[1] != np.pad(in_ar[1], 1, 'edge')[1:-1,0:-2])
    B = np.logical_or(in_ar[2] != np.pad(in_ar[2], 1, 'edge')[0:-2,1:-1], \
in_ar[2] != np.pad(in_ar[2], 1, 'edge')[1:-1,0:-2])
    out_ar[:]=255 * np.logical_or( np.logical_or(R, V), B)'''
            pycode2.text = etree.CDATA(data)
else:
    raise SystemExit(f"ERROR: 'VRTRasterBand' not found in '{vrt_tmp}'")

vrt_final = dirpath_out + '/graph_contour.vrt'
etree.tail = '\n'
etree.indent(root)
tree.write(vrt_final)
print(f"File '{vrt_final}' written")
# TODO: suppress vrt_tmp

# --------------- create qgz view -------------
# TODO: check if only needed for Linux
if platform.system() == 'Linux':
    os.environ['QT_QPA_PLATFORM'] = 'offscreen'

QgsApplication.setPrefixPath('/usr/', True)
qgs = QgsApplication([], False)
qgs.initQgis()
project = QgsProject.instance()

# ---- add ortho layer to map ----
ortho_lname = 'ortho'
ortho_layer = add_layer_to_map(xml_ortho, ortho_lname, project, 'gdal')
print_info_add_layer(ortho_lname)

# get crs from layer
crs = ortho_layer.crs()
# set project crs
project.setCrs(QgsCoordinateReferenceSystem(crs))

# ---- add graph layer to map ----
graph_lname = 'graph'
graph_layer = add_layer_to_map(xml_graph, graph_lname, project, 'gdal')
# print(f'{ortho_layer.extent()=}')
# print(f'{graph_layer.extent()=}')
graph_layer.renderer().setOpacity(0.3)
graph_layer.setScaleBasedVisibility(True)
# check and set zoom min, max inputs for visibility scale of graph layer
zoom_min_graph, zoom_max_graph = ARG.zoom if ARG.zoom[0] <= ARG.zoom[1]\
                     else (ARG.zoom[1], ARG.zoom[0])
graph_layer.setMinimumScale(zoom_max_graph)
graph_layer.setMaximumScale(zoom_min_graph)
print_info_add_layer(graph_lname)
print_info_visib_scale(graph_lname, zoom_min_graph, zoom_max_graph)

# ---- add contour layer to map ----
contour_lname = 'graphe_contour'
contour_layer = add_layer_to_map(vrt_final, contour_lname, project, 'gdal')
# set zoom min, max for visibility scale of contour layer
zoom_max_contour = zoom_min_graph - 1
zoom_min_contour = int(np.floor(zoom_max_contour/slab_width))
contour_layer.setScaleBasedVisibility(True)
contour_layer.setMinimumScale(zoom_max_contour)
contour_layer.setMaximumScale(zoom_min_contour)
# set renderer
colors = [QgsColorRampShader.ColorRampItem(255, QColor('#ff0000'), '255')]
renderer = QgsPalettedRasterRenderer(contour_layer.dataProvider(), 1,
                                     QgsPalettedRasterRenderer.
                                     colorTableToClassData(colors))
contour_layer.setRenderer(renderer)
contour_layer.triggerRepaint()
print_info_add_layer(contour_lname)
print_info_visib_scale(contour_lname, zoom_min_contour, zoom_max_contour)

# ---- add opi layer to map ----
# get 1st opi
opi_name = next(iter(overviews['list_OPI']))
opi_uri_params = f'crs={crs.authid()}&format=image/png&layers=opi&'\
                 f'styles={ARG.style_ortho}&tileDimensions=Name={opi_name}&'\
                 f'tileMatrixSet={tms}&'\
                 f'url={ARG.url}/{branch_id}/wmts'
opi_lname = 'OPI'
opi_layer = add_layer_to_map(opi_uri_params, opi_lname, project, 'wms')
opi_layer.renderer().setOpacity(0.5)
project.layerTreeRoot().findLayer(opi_layer).setItemVisibilityChecked(False)
print_info_add_layer(opi_lname)

# ---- create patches layer and add to map -----
patches_fname = dirpath_out + '/patches.gpkg'
patches_fields = QgsFields()
patches_fields.append(QgsField('fid', QVariant.Int))
patches_geom_type = QgsWkbTypes.Polygon
create_vector(patches_fname, patches_fields, patches_geom_type, crs, project)
patches_lname = 'patches'
patches_layer = add_layer_to_map(patches_fname, patches_lname,
                                 project, 'ogr', is_raster=False)
print_info_add_layer(patches_lname)

# ---- create advancement layer and add to map -----
advancement_fname = dirpath_out + '/avancement.gpkg'
advancement_fields = QgsFields()
advancement_fields.append(QgsField('fid', QVariant.Int))
advancement_geom_type = QgsWkbTypes.Polygon
create_vector(advancement_fname, advancement_fields, advancement_geom_type, crs, project)
advancement_lname = 'avancement'
advancement_layer = add_layer_to_map(advancement_fname, advancement_lname,
                                     project, 'ogr', is_raster=False)
print_info_add_layer(advancement_lname)

# ---- add macros to map ----
if ARG.macros:
    # adapt macros to working data
    words_to_replace = {'__IDBRANCH__': branch_id,
                        '__URLSERVER__': ARG.url+'/',
                        '__TILEMATRIXSET__': tms}
    words_not_found = []
    with open(ARG.macros, 'r', encoding='utf-8') as file_macro_in:
        macros_data = file_macro_in.read()
        for key, val in words_to_replace.items():
            regex_word = re.compile(f'(\'|\")?\\b{key}\\b(\'|\")?')
            macros_data, nb_occ = regex_word.subn(f"'{val}'", macros_data)
            if nb_occ == 0:
                words_not_found.append(key)
        if len(words_not_found) > 0:
            raise SystemExit(f"ERROR: {words_not_found} not found in '{ARG.macros}'")
        # add adapted macros
        QgsProject.instance().writeEntry("Macros", "/pythonCode", macros_data)
    if ARG.verbose > 0:
        print('->  macros added to view')

# ---- write qgz view output file ----
project.write(ARG.output)
print(f"File '{ARG.output}' written")

qgs.exitQgis()
