# coding: utf-8
""" This script handles requests """

import json
import requests
from osgeo import gdal


def check_get_post(req, is_get=True):
    """ Check GET or POST request """
    try:
        if is_get:
            response = requests.get(req)
        else:
            response = requests.post(req)
        response.raise_for_status()
    except Exception as err:
        msg = 'ERROR:\n\t'
        try:
            msg += f'{response.json()}\n\t'
        except json.decoder.JSONDecodeError:
            pass
        msg += str(err)
        raise SystemExit(msg)
    return response


def xml_from_wmts(wmts_in, xml_out):
    """ Create xml file from wmts GetCapabilities request """
    src_ds = gdal.Open(wmts_in)
    if src_ds is None:
        raise SystemExit(f"ERROR: Invalid request {wmts_in}")
    _ = gdal.Translate(xml_out, src_ds, format='WMTS')
    # close dataset to flush to disk
    _ = None
    src_ds = None
    print(f"File '{xml_out}' written")
