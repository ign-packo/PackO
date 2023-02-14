# coding: utf-8
"""This script creates a PackO client view for QGIS"""

import argparse
import re
import os.path
from copy import deepcopy
from lxml import etree
from osgeo import gdal
from process_requests import check_get_post, response2pyobj, xml_from_wmts


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
                        help="output path (default: ./)",
                        type=str, default='./')
    parser.add_argument("-v", "--verbose",
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

# check input url
url_pattern = '^https?:\/\/[0-9A-z.]+\:[0-9]+$'
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

# check if valid output directory
dirpath_out = os.path.normpath(ARG.output)
if not os.path.isdir(dirpath_out):
    raise SystemExit(f"ERROR: '{dirpath_out}' is not a valid directory")

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
