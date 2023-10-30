# coding: utf-8
"""This script creates a PackO client view for QGIS"""

import argparse
import re
import glob
import os.path
import platform
import sys
from copy import deepcopy
from lxml import etree
from osgeo import gdal
if platform.system() == 'Windows':
    osgeo_root = os.environ['OSGEO4W_ROOT']
    if osgeo_root is None:
        raise SystemExit("ERROR: 'OSGEO4W_ROOT' not found; unable to set 'PYTHONPATH'")
    sys.path.append(osgeo_root + r'\apps\qgis\python')
# pylint: disable=locally-disabled, wrong-import-position
from qgis.core import (
    QgsApplication,
    QgsProject,
    QgsCoordinateReferenceSystem,
    QgsColorRampShader,
    QgsPalettedRasterRenderer,
    QgsFields,
    QgsField,
    QgsWkbTypes,
    QgsLayerTreeLayer,
)
from qgis.gui import QgsMapCanvas
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtCore import QVariant
from process_requests import check_get_post, response2pyobj, xml_from_wmts
from process_qlayers import add_layer_to_map, create_vector, set_layer_resampling

gdal.UseExceptions()


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
                        help="name of new branch to be created on cache",
                        required=True,
                        type=str)
    parser.add_argument('-s', '--style_ortho',
                        help="style for ortho to be exported to xml (default: RVB)",
                        type=str, default='RVB', choices=['RVB', 'IR', 'IRC'])
    parser.add_argument('-o', '--output',
                        help="output qgis view path (default: ./view.qgs)",
                        type=str, default='./view.qgs')
    parser.add_argument('-z', '--zoom_pivot',
                        help="layer visibility scale for surface graph [1:10000000,1:zoom_pivot]\
                        & for contour graph [1:zoom_pivot,1:1] (default:3025)",
                        type=int, default=3025)
    parser.add_argument('--vect',
                        help="vectors folder path",
                        type=str)
    parser.add_argument('--bbox', nargs=4,
                        help="bounding box defining the view extent (Xmin Ymin Xmax Ymax)",
                        type=float)
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
    """ Suppress Cache tag from xml file to avoid creation of local cache """
    tree_xml = etree.parse(xml_in)
    root_xml = tree_xml.getroot()
    all_cache_tags = []
    for element in root_xml.iter('Cache'):
        all_cache_tags.append(element)
    if len(all_cache_tags) > 0:
        for tg in all_cache_tags:
            root_xml.remove(tg)
    else:
        print(f"WARNING: 'Cache' tag not found in '{xml_in}'=>'{xml_out}' identical to '{xml_in}'")
    tree_xml.write(xml_out)
    print(f"File '{xml_out}' written")


def set_nb_bands(xml_in, xml_out, nb_bands):
    """ Set number of bands or channels in xml file """
    if nb_bands is None or nb_bands < 0:
        raise SystemExit(f'ERROR: Bad number of bands (={nb_bands})')
    tree_xml = etree.parse(xml_in)
    root_xml = tree_xml.getroot()
    bands_count = root_xml.find('BandsCount')
    if bands_count is None:
        raise SystemExit(f"ERROR: 'BandsCount' tag not found in '{xml_in}'")
    bands_count.text = str(nb_bands)
    tree_xml.write(xml_out)


def set_extent_xml(xml_in, xml_out, extent_xmin, extent_ymin, extent_xmax, extent_ymax):
    """ Set extent limits in an xml file """
    tree_xml = etree.parse(xml_in)
    root_xml = tree_xml.getroot()
    data_window = root_xml.iter('DataWindow')
    if not data_window:
        raise SystemExit(f"ERROR: 'DataWindow' tag not found in '{xml_in}'")
    ul_x = root_xml.find('DataWindow/UpperLeftX')
    ul_y = root_xml.find('DataWindow/UpperLeftY')
    lr_x = root_xml.find('DataWindow/LowerRightX')
    lr_y = root_xml.find('DataWindow/LowerRightY')
    if ul_x is None or ul_y is None or lr_x is None or lr_y is None:
        raise SystemExit(f"ERROR: Missing tag child in 'DataWindow' in {xml_in}'")
    ul_x.text = str(extent_xmin)
    ul_y.text = str(extent_ymax)
    lr_x.text = str(extent_xmax)
    lr_y.text = str(extent_ymin)
    tree_xml.write(xml_out)
    print(f"File '{xml_out}' written")


def modify_xml(xml_in, xml_out, nb_bands, extent_xmin=None, extent_ymin=None,
               extent_xmax=None, extent_ymax=None):
    """ Suppress cache tag and set number of bands & extent in an xml file """
    suppress_cachetag(xml_in, xml_out)
    set_nb_bands(xml_out, xml_out, nb_bands)
    if extent_xmin and extent_ymin and extent_xmax and extent_ymax:
        set_extent_xml(xml_out, xml_out, extent_xmin, extent_ymin, extent_xmax, extent_ymax)
    print(f"File '{xml_out}' written")


ARG = read_args()


def print_info_add_layer(layer_name):
    """ print info when layer added to view """
    if ARG.verbose > 0:
        print(f"-> '{layer_name}' layer added to view")


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

# check zoom_pivot input
if ARG.zoom_pivot not in range(1, 10000000):
    raise SystemExit(f"ERROR: zoom_pivot={ARG.zoom_pivot} invalid value")

# check external vectors input
list_vect = []
if ARG.vect:
    dirpath_vect = os.path.normpath(ARG.vect)
    if not os.path.isdir(dirpath_vect):
        raise SystemExit(f"ERROR: Unable to open vectors directory '{ARG.vect}'")
    list_gpkg_vect = glob.glob(os.path.join(dirpath_vect, '*.gpkg'))
    list_shp_vect = glob.glob(os.path.join(dirpath_vect, '*.shp'))
    list_vect = [*list_gpkg_vect, *list_shp_vect]
    if len(list_vect) == 0:
        raise SystemExit(f"ERROR: No gpkg, nor shp files in '{ARG.vect}'")

# get info from overviews file
req_get_overviews = ARG.url + '/json/overviews?cachePath=' + str(cache['path'])
resp_get_overviews = check_get_post(req_get_overviews)
overviews = resp_get_overviews.json()
tms = overviews['identifier']
if tms is None:
    raise SystemExit("ERROR: No 'identifier' value in overviews")
dataset_bbox = overviews['dataSet']['boundingBox']
dataset_bbox_lowc = dataset_bbox['LowerCorner']
dataset_bbox_upc = dataset_bbox['UpperCorner']
if dataset_bbox is None or dataset_bbox_lowc is None or dataset_bbox_upc is None:
    raise SystemExit("ERROR: Incorrect 'boundingBox' values in overviews")
ds_extent = [dataset_bbox_lowc[0], dataset_bbox_lowc[1], dataset_bbox_upc[0], dataset_bbox_upc[1]]

# check bbox input
bbox_xmin = bbox_ymin = bbox_xmax = bbox_ymax = None
bbox = None
if ARG.bbox:
    bbox_coord = ARG.bbox
    if any(coord < 0 for coord in bbox_coord):
        raise SystemExit(f"ERROR: Negative value in '{bbox_coord}'")
    bbox_xmin = min(bbox_coord[0], bbox_coord[2])
    bbox_xmax = max(bbox_coord[0], bbox_coord[2])
    bbox_ymin = min(bbox_coord[1], bbox_coord[3])
    bbox_ymax = max(bbox_coord[1], bbox_coord[3])
    bbox = [bbox_xmin, bbox_ymin, bbox_xmax, bbox_ymax]
    if bbox_xmin < dataset_bbox_lowc[0] or bbox_ymin < dataset_bbox_lowc[1] or \
       bbox_xmax > dataset_bbox_upc[0] or bbox_ymax > dataset_bbox_upc[1]:
        raise SystemExit(f"ERROR: Input bbox '{bbox} exceeds dataset extent '{ds_extent}'")

# ---------- create new branch on cache ----------
req_post_branch = ARG.url + '/branch?name=' + branch_name + \
           '&idCache=' + str(ARG.cache_id)
resp_post_branch = check_get_post(req_post_branch, is_get=False)
# get branch id
resp_get_branches = check_get_post(ARG.url + '/branches' +
                                   '?idCache=' + str(ARG.cache_id), is_get=True)
list_all_branches = response2pyobj(resp_get_branches)
branch = next((b for b in list_all_branches if b['name'] == branch_name))
branch_id = branch['id']
print(f"Branch '{branch_name}' created (idBranch={branch_id}) on cache '{cache['name']}'")

# ---------- create ortho and graph xml ---------
# export ortho and graph xml
wmts_url = f'WMTS:{ARG.url}/{branch_id}/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0'
wmts_ortho = f'{wmts_url},layer=ortho,style={ARG.style_ortho}'
wmts_graph = f'{wmts_url},layer=graph'
xml_ortho_tmp = os.path.join(dirpath_out, 'ortho_tmp.xml')
xml_graph_tmp = os.path.join(dirpath_out, 'graphe_surface_tmp.xml')
xml_from_wmts(wmts_ortho, xml_ortho_tmp)
xml_from_wmts(wmts_graph, xml_graph_tmp)
# suppress Cache tag and set extent
xml_ortho = os.path.join(dirpath_out, 'ortho.xml')
xml_graph = os.path.join(dirpath_out, 'graphe_surface.xml')
# get number of channels or bands for ortho layer
nb_bands_from_style = {'RVB': 3, 'IR': 1, 'IRC': 3}
nb_bands_ortho = nb_bands_from_style.get(ARG.style_ortho)
modify_xml(xml_ortho_tmp, xml_ortho, nb_bands_ortho, bbox_xmin, bbox_ymin, bbox_xmax, bbox_ymax)
# graph layer is a RGB layer (3 channels)
modify_xml(xml_graph_tmp, xml_graph, 3, bbox_xmin, bbox_ymin, bbox_xmax, bbox_ymax)
# TODO: suppress xml ortho_tmp and graph_tmp - for now, useful for comparison

# --------- create contours vrt from graph.xml -----------
vrt_tmp = os.path.join(dirpath_out, 'graphe_contour_tmp.vrt')
ds_options = gdal.BuildVRTOptions(outputBounds=bbox)
ds = gdal.BuildVRT(vrt_tmp, xml_graph, options=ds_options)
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
            if rband.find('ComplexSource') is None and rband.find('SimpleSource') is None:
                raise SystemExit(f"ERROR: Neither 'ComplexSource' tag, nor 'SimpleSource' \
                                 could be found in '{vrt_tmp}' file")
            complsrc = rband.find('ComplexSource')
            if complsrc is None and rband.find('SimpleSource') is not None:
                complsrc = rband.find('SimpleSource')
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
vrt_final = os.path.join(dirpath_out, 'graphe_contour.vrt')
etree.tail = '\n'
etree.indent(root)
tree.write(vrt_final)
print(f"File '{vrt_final}' written")
# TODO: suppress vrt_tmp - for now, useful for comparison

# --------------- create qgis view -------------
if platform.system() == 'Linux':
    os.environ['QT_QPA_PLATFORM'] = 'offscreen'

QgsApplication.setPrefixPath('/usr/', True)
qgs = QgsApplication([], False)
qgs.initQgis()
project = QgsProject.instance()

# ------ create group for ortho elements --------
ortho_group = project.layerTreeRoot().insertGroup(1, 'ORTHOS')
# --- add ortho layer to group ---
ortho_lname = 'ortho'
ortho_layer = add_layer_to_map(xml_ortho, ortho_lname, project, 'gdal')
# set resampling
set_layer_resampling(ortho_layer)
# add to group
ortho_group.insertChildNode(1, QgsLayerTreeLayer(ortho_layer))
print_info_add_layer(ortho_lname)
# get pixel size from layer
pixel_size_x = round(ortho_layer.rasterUnitsPerPixelX(), 4)
pixel_size_y = round(ortho_layer.rasterUnitsPerPixelY(), 4)
# get crs from layer
crs = ortho_layer.crs()
# set project crs
project.setCrs(QgsCoordinateReferenceSystem(crs))
# --- add opi layer to group ---
opi_name = next(iter(overviews['list_OPI']))  # get first opi name
opi_uri_params = f'crs={crs.authid()}&format=image/png&layers=opi&'\
                 f'styles={ARG.style_ortho}&tileDimensions=Name={opi_name}&'\
                 f'tileMatrixSet={tms}&'\
                 f'url={ARG.url}/{branch_id}/wmts'
opi_lname = 'OPI'
opi_layer = add_layer_to_map(opi_uri_params, opi_lname, project, 'wms')
opi_layer.renderer().setOpacity(0.5)
# set resampling
set_layer_resampling(opi_layer)
# add to group
ortho_group.insertChildNode(0, QgsLayerTreeLayer(opi_layer))
project.layerTreeRoot().findLayer(opi_layer).setItemVisibilityChecked(False)
print_info_add_layer(opi_lname)

# ------ create group for graph elements --------
graph_group = project.layerTreeRoot().insertGroup(0, 'GRAPHE')
graph_group.setExpanded(False)
# --- create graph layer and add to group ----
graph_lname = 'graphe_surface'
graph_layer = add_layer_to_map(xml_graph, graph_lname, project, 'gdal')
graph_layer.renderer().setOpacity(0.3)
graph_layer.setScaleBasedVisibility(True)
# set visibility scale
zoom_min_graph = ARG.zoom_pivot
zoom_max_graph = 10000000
graph_layer.setMinimumScale(zoom_max_graph)
graph_layer.setMaximumScale(zoom_min_graph)
# set resampling
set_layer_resampling(graph_layer)
# add to group
graph_group.insertChildNode(0, QgsLayerTreeLayer(graph_layer))
print_info_add_layer(graph_lname)
# --- create contour layer and add to group ----
contour_lname = 'graphe_contour'
contour_layer = add_layer_to_map(vrt_final, contour_lname, project, 'gdal')
# set visibility scale
zoom_max_contour = ARG.zoom_pivot
zoom_min_contour = 1
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
# set resampling
set_layer_resampling(contour_layer)
# add to group
graph_group.insertChildNode(1, QgsLayerTreeLayer(contour_layer))
print_info_add_layer(contour_lname)

# ------ create group for patches elements --------
patch_group = project.layerTreeRoot().insertGroup(0, 'SAISIE')
# --- create patches layer and add to group ----
patches_fname = os.path.join(dirpath_out, 'retouches_graphe.gpkg')
patches_fields = QgsFields()
patches_fields.append(QgsField('fid', QVariant.Int))
create_vector(patches_fname, patches_fields, QgsWkbTypes.Polygon, crs, project)
patches_lname = 'retouches_graphe'
patches_layer = add_layer_to_map(patches_fname, patches_lname,
                                 project, 'ogr', is_raster=False,
                                 disable_att_form_popup=True)
# add to group
patch_group.insertChildNode(1, QgsLayerTreeLayer(patches_layer))
print_info_add_layer(patches_lname)
# --- create infographic patches layer and add to group ----
patches_infogr_fname = os.path.join(dirpath_out, 'retouches_info.gpkg')
patches_infogr_fields = QgsFields()
patches_infogr_fields.append(QgsField('fid', QVariant.Int))
create_vector(patches_infogr_fname, patches_infogr_fields, QgsWkbTypes.Polygon, crs, project)
patches_infogr_lname = 'retouches_info'
patches_infogr_layer = add_layer_to_map(patches_infogr_fname, patches_infogr_lname,
                                        project, 'ogr', is_raster=False,
                                        disable_att_form_popup=True)
# add to group
patch_group.insertChildNode(1, QgsLayerTreeLayer(patches_infogr_layer))
print_info_add_layer(patches_infogr_lname)
# --- create remarks layer and add to group ----
remarks_fname = os.path.join(dirpath_out, 'remarques.gpkg')
remarks_fields = QgsFields()
attr_comment = QgsField('commentaire', QVariant.String)
attr_comment.setLength(255)
remarks_fields.append(attr_comment)
attr_default = QgsField('defaut', QVariant.String)
attr_default.setLength(255)
remarks_fields.append(attr_default)
create_vector(remarks_fname, remarks_fields, QgsWkbTypes.Point, crs, project)
remarks_lname = 'remarques'
remarks_layer = add_layer_to_map(remarks_fname, remarks_lname,
                                 project, 'ogr', is_raster=False)
# add to group
patch_group.insertChildNode(0, QgsLayerTreeLayer(remarks_layer))
print_info_add_layer(remarks_lname)

# ------ create group for information elements --------
info_group = project.layerTreeRoot().insertGroup(1, 'INFOS')
# --- create info save layer and add to group ----
info_save_fname = os.path.join(dirpath_out, 'retouches_info_sauv.gpkg')
info_save_fields = QgsFields()
attr_name = QgsField('NOM', QVariant.String)
attr_name.setLength(20)
info_save_fields.append(attr_name)
create_vector(info_save_fname, info_save_fields, QgsWkbTypes.Polygon, crs, project)
info_save_lname = 'retouches_info_sauv'
info_save_layer = add_layer_to_map(info_save_fname, info_save_lname,
                                   project, 'ogr', is_raster=False)
# add to group
info_group.insertChildNode(0, QgsLayerTreeLayer(info_save_layer))
print_info_add_layer(info_save_lname)
# --- create advancement layer and add to group ----
advancement_fname = os.path.join(dirpath_out, 'avancement.gpkg')
advancement_fields = QgsFields()
advancement_fields.append(QgsField('H_SAISIE', QVariant.DateTime))
create_vector(advancement_fname, advancement_fields, QgsWkbTypes.Polygon, crs, project)
advancement_lname = 'avancement'
advancement_layer = add_layer_to_map(advancement_fname, advancement_lname,
                                     project, 'ogr', is_raster=False)
# add to group
info_group.insertChildNode(1, QgsLayerTreeLayer(advancement_layer))
print_info_add_layer(advancement_lname)

# ------ create group for external vectors --------
if len(list_vect) > 0:
    vect_group = project.layerTreeRoot().insertGroup(2, 'VECTEURS')
    for vect in list_vect:
        # create layer
        vect_lname = os.path.basename(vect).split('.')[0]
        vect_layer = add_layer_to_map(vect, vect_lname, project, 'ogr', is_raster=False)
        # add to group
        vect_group.insertChildNode(1, QgsLayerTreeLayer(vect_layer))
    if ARG.verbose > 0:
        print('->  vector layers added to view')

# ---- add macros to map ----
if ARG.macros:
    # adapt macros to working data
    words_to_replace = {'__IDBRANCH__': branch_id,
                        '__URLSERVER__': ARG.url+'/',
                        '__TILEMATRIXSET__': tms,
                        '__STYLE__': ARG.style_ortho,
                        '__PIXELSIZEX__': pixel_size_x,
                        '__PIXELSIZEY__': pixel_size_y}
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

# ---- set canvas extent ----
canvas = QgsMapCanvas()
canvas.setExtent(ortho_layer.extent())
canvas.refresh()

# ---- write qgis view output file ----
project.write(ARG.output)
print(f"File '{ARG.output}' written")

qgs.exitQgis()
