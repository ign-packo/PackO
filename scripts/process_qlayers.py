# coding: utf-8
""" This script handles QGIS layers """

from qgis.core import QgsRasterLayer, QgsVectorLayer, QgsVectorFileWriter, QgsEditFormConfig


def add_layer_to_map(data_source, layer_name, qgs_project, provider_name,
                     is_raster=True, show=False, disable_att_form_popup=False):
    """ add layer to map """
    layer = QgsRasterLayer(data_source, layer_name, provider_name) if is_raster\
        else QgsVectorLayer(data_source, layer_name, provider_name)
    if not layer or not layer.isValid():
        raise SystemExit(f"ERROR: Layer '{layer_name}' failed to load! - "
                         f'{layer.error().summary()}')
    qgs_project.addMapLayer(layer, show)
    if disable_att_form_popup is True:
        form_config = layer.editFormConfig()
        form_config.setSuppress(QgsEditFormConfig.SuppressOn)
        layer.setEditFormConfig(form_config)
    return layer


def create_vector(vector_filename, fields, geom_type, crs, qgs_project, driver_name='GPKG'):
    """ create vector """
    transform_context = qgs_project.transformContext()
    save_options = QgsVectorFileWriter.SaveVectorOptions()
    save_options.driverName = driver_name
    save_options.fileEncoding = "UTF-8"
    wrt = QgsVectorFileWriter.create(vector_filename,
                                     fields,
                                     geom_type,
                                     crs,
                                     transform_context,
                                     save_options)
    if wrt.hasError() != QgsVectorFileWriter.NoError:
        raise SystemExit(f"ERROR when creating vector '{vector_filename}': {wrt.errorMessage()}")
    # flush to disk
    del wrt


def set_layer_resampling(raster_layer, resampling_method_zoomedin=None,
                         resampling_method_zoomedout=None, max_oversampling=1.0):
    """ set zoomed in and out resampling methods (None means nearest neighbor)
        and max oversampling"""
    resample_filter = raster_layer.resampleFilter()
    resample_filter.setZoomedInResampler(resampling_method_zoomedin)
    resample_filter.setZoomedOutResampler(resampling_method_zoomedout)
    resample_filter.setMaxOversampling(max_oversampling)
