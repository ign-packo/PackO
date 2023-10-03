import json, requests
from PyQt5.QtCore import *
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from qgis.utils import iface
from qgis.gui import *
from qgis.core import *
import time
from pathlib import Path, PurePath
import os


def openProject():
    username = os.environ['USERNAME']
    computername = os.environ['COMPUTERNAME']
    fic_info_path = PurePath().joinpath(Path(QgsProject.instance().homePath(),
                                             Path(f'OUVERT_SUR_{computername}_PAR_{username}')))
    Path(fic_info_path).touch()
    pass

def saveProject():
    pass

def closeProject():
    username = os.environ['USERNAME']
    computername = os.environ['COMPUTERNAME']
    fic_info_path = PurePath().joinpath(Path(QgsProject.instance().homePath(),
                                             Path(f'OUVERT_SUR_{computername}_PAR_{username}')))
    Path(fic_info_path).unlink()
    pass

# ===================================
# ==== CONFIG A VERIFIER ============
# ===================================
id_branch = __IDBRANCH__
url_server = __URLSERVER__
tile_matrix_set = __TILEMATRIXSET__
# ===================================

url_graph = url_server + id_branch + '/graph'
url_patch = url_server + id_branch + '/patch'
url_undo = url_server + id_branch + '/patch/undo'
url_redo = url_server + id_branch + '/patch/redo'
url_wmts = url_server + id_branch + '/wmts'
source='contextualWMSLegend=0&crs=EPSG:2154&dpiMode=7&featureCount=10&format=image/png&layers=opi&styles=RVB&tileDimensions=Name%3DXXX&tileMatrixSet='+tile_matrix_set+'&url='+url_wmts+'?SERVICE%3DWMTS%26REQUEST%3DGetCapabilities%26VERSION%3D1.0.0'
OPI=None
color=None
opi_layer = None
ortho_layer = None
patch_layer = None
retinfo_layer = None
retinfosauv_layer = None
avancement_layer = None
graph_layer = None

for layer in QgsProject.instance().mapLayers().values():
    name = layer.name().upper()
    if (name[0:3] == 'OPI'):
        opi_layer = layer
    if (name == 'ORTHO'):
        ortho_layer = layer
    if (name == 'RETOUCHES_GRAPHE'):
        patch_layer = layer
    if (name == 'RETOUCHES_INFO'):
        retinfo_layer = layer
    if (name == 'RETOUCHES_INFO_SAUV'):
        retinfosauv_layer = layer
    if (name == 'GRAPHE_CONTOUR'):
        graph_layer = layer
    if (name == 'AVANCEMENT'):
        avancement_layer = layer



#print("POC PACKO")
# iface.mapCanvas().setCachingEnabled(False)


def sendPatch(feature, OPI, color):
    # print("sendPatch:", feature, OPI, color)
    exporter = QgsJsonExporter()
    patch = json.loads(exporter.exportFeatures([feature]))
    # print(patch)
    patch['crs'] = {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::2154'}}
    patch['features'][0]['properties'] = {'color': color, 'opiName': OPI}
    res = requests.post(url_patch, json=patch)
    return res.text


def selectOPI(x, y):
    # print("selectOPI")
    res = requests.get(url_graph, params={'x': x, 'y': y})
    sel = json.loads(res.text)
    # print(sel)
    if 'opiName' in sel.keys():
        return sel['opiName'], sel['color']
    else:
        return None, None


def on_key(event):
    global OPI
    global color
    # print("on_key")
    touche = event.key()
    # print(touche)
    iface.messageBar().clearWidgets()

    if (touche == Qt.Key_M):
        iface.messageBar().pushMessage("PATCH ", "EN COURS : ", level=Qgis.Warning, duration=0)
        nb_features = patch_layer.featureCount()
        if (OPI is None) or (color is None):
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Information)
            msg.setText("PAS D'OPI SELECTIONNEE'")
            msg.setWindowTitle("ERREUR")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            OPI = None
            return
        if nb_features == 0:
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Information)
            msg.setText("PAS DE RETOUCHE")
            msg.setWindowTitle("ERREUR")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            OPI = None
            return
        if nb_features > 1:
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Information)
            msg.setText("UNE SEULE RETOUCHE A LA FOIS")
            msg.setWindowTitle("ERREUR")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            OPI = None
            return
        patch_layer.startEditing()
        feature = list(patch_layer.getFeatures())[0]
        mess = sendPatch(feature, OPI, color)
        print(mess)
        patch_layer.deleteFeature(feature.id())
        patch_layer.commitChanges()
        iface.messageBar().pushMessage("PATCH ", "APPLIQUÉ : ", level=Qgis.Success, duration=0)
        graph_layer.setDataSource(graph_layer.source(), "graphe_contour", "gdal")
        ortho_layer.setDataSource(ortho_layer.source(), "ortho", "gdal")
        OPI = None
        # pour ne pas a avoir a remettre en mode edition pour la prochiane saisie
        patch_layer.startEditing()
        return

    if (touche == Qt.Key_P):
        # Pick OPI
        lastPoint = iface.mapCanvas().mouseLastXY()
        lastPointTerr = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(lastPoint.x(), lastPoint.y())
        OPI, color = selectOPI(lastPointTerr.x(), lastPointTerr.y())
        if OPI:
            # print("ready: ", opi_layer, OPI, color)
            opi_layer.setDataSource(source.replace('XXX', OPI), "OPI--" + OPI, "wms")
            iface.messageBar().pushMessage("OPI ", "sélection actuelle : " + OPI + ' | ' + str(color),
                                           level=Qgis.Success, duration=0)
        else:
            # print("no OPI selected")
            iface.messageBar().pushMessage("OPI ", "sélection impossible", level=Qgis.Critical, duration=0)

        return

    if (touche == Qt.Key_U):
        # print("undo")
        res = requests.put(url_undo)
        # print(res.text)
        # iface.mapCanvas().refreshAllLayers()
        graph_layer.setDataSource(graph_layer.source(), "graphe_contour", "gdal")
        ortho_layer.setDataSource(ortho_layer.source(), "ortho", "gdal")
        iface.messageBar().pushMessage(res.text, level=Qgis.Success, duration=0)
        return

    if (touche == Qt.Key_R):
        # print("redo")
        res = requests.put(url_redo)
        # print(res.text)
        # iface.mapCanvas().refreshAllLayers()
        graph_layer.setDataSource(graph_layer.source(), "graphe_contour", "gdal")
        ortho_layer.setDataSource(ortho_layer.source(), "ortho", "gdal")
        iface.messageBar().pushMessage(res.text, level=Qgis.Success, duration=0)
        return

    if (touche == Qt.Key_O):
        id_opi_layer = QgsProject.instance().layerTreeRoot().findLayer(opi_layer.id())
        if id_opi_layer.isVisible():
            id_opi_layer.setItemVisibilityChecked(False)
        else:
            id_opi_layer.setItemVisibilityChecked(True)
        return

    if (touche == Qt.Key_V):
        id_groupe_vecteur = QgsProject.instance().layerTreeRoot().findGroup('VECTEURS')
        if id_groupe_vecteur.isVisible():
            id_groupe_vecteur.setItemVisibilityChecked(False)
        else:
            id_groupe_vecteur.setItemVisibilityChecked(True)
        return

    if (touche == Qt.Key_G):
        id_groupe_graph = QgsProject.instance().layerTreeRoot().findGroup('GRAPHE')
        if id_groupe_graph.isVisible():
            id_groupe_graph.setItemVisibilityChecked(False)
        else:
            id_groupe_graph.setItemVisibilityChecked(True)
        return

    if (touche == Qt.Key_Less):
        avancement_layer.startEditing()
        largeur_canvas = iface.mapCanvas().size().width()
        hauteur_canvas = iface.mapCanvas().size().height()
        coords_HG = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(51, 51)
        coords_HD = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(largeur_canvas - 52, 51)
        coords_BD = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(largeur_canvas - 52,
                                                                                hauteur_canvas - 52)
        coords_BG = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(51, hauteur_canvas - 52)
        geom = QgsGeometry.fromPolygonXY([[coords_HG, coords_HD, coords_BD, coords_BG]])
        f = QgsFeature(avancement_layer.fields())
        heurecomplete = time.localtime()
        f.setGeometry(geom)
        # f.setAttribute("H_SAISIE", str_heure)
        f.setAttribute("H_SAISIE", str(heurecomplete))
        avancement_layer.addFeatures([f])
        iface.vectorLayerTools().saveEdits(avancement_layer)
        iface.vectorLayerTools().stopEditing(avancement_layer)
        return

    Direction = {
        Qt.Key_1: "coords_BG - coords_HD",
        Qt.Key_2: "coords_BG - coords_HG",
        Qt.Key_3: "coords_BD - coords_HG",
        Qt.Key_4: "coords_HG - coords_HD",
        Qt.Key_6: "coords_HD - coords_HG",
        Qt.Key_7: "coords_HG - coords_BD",
        Qt.Key_8: "coords_HG - coords_BG",
        Qt.Key_9: "coords_HD - coords_BG"
    }

    if touche in Direction:
        largeur_canvas = iface.mapCanvas().size().width()
        hauteur_canvas = iface.mapCanvas().size().height()
        coords_HG = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(51, 51)
        coords_HD = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(largeur_canvas - 52, 51)
        coords_BD = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(largeur_canvas - 52,
                                                                                hauteur_canvas - 52)
        coords_BG = iface.mapCanvas().getCoordinateTransform().toMapCoordinates(51, hauteur_canvas - 52)

        decalage = eval(Direction[touche])
        centre = iface.mapCanvas().center()
        new_centre = centre + decalage
        iface.mapCanvas().setCenter(new_centre)
        iface.mapCanvas().redrawAllLayers()

    if (touche == Qt.Key_E):

        liste_ponts = []
        size_label = 200
        src_poly = retinfo_layer.source().split('|')[0]
        retinfo_layer.startEditing()
        iface.vectorLayerTools().saveEdits(retinfo_layer)

        chem_layer_ponts = retinfosauv_layer.source().split('|')[0]
        nb_ponts_ini = retinfosauv_layer.featureCount()
        retinfosauv_layer.startEditing()

        xmin, xmax, ymin, ymax = 1e9, 0, 1e9, 0
        nb_pont_ajoutes = 0
        for apoly in retinfo_layer.getFeatures():
            id_poly = apoly.id()
            id_pont = nb_ponts_ini + nb_pont_ajoutes
            ageom = apoly.geometry()
            abbox = ageom.boundingBox()
            acentroid = apoly.geometry().centroid().asPoint()
            x_centre = int(acentroid.x())
            y_centre = int(acentroid.y())

            apont = QgsFeature(retinfosauv_layer.fields())
            apont.setAttributes([id_pont, '%d_%d' % (x_centre, y_centre)])
            apont.setGeometry(ageom)
            liste_ponts.append(apont)

            OPI, color = selectOPI(x_centre, y_centre)

            nom_pont = '%d_%d_pont' % (x_centre, y_centre)
            nom_export = '%s.tif' % (nom_pont)

            rep_pont = os.path.join(QgsProject.instance().homePath(), "retouches_info", nom_pont)
            os.makedirs(rep_pont, exist_ok=True)
            chem_export = os.path.join(rep_pont, nom_export)

            chem_export_txt = os.path.join(rep_pont, nom_export.replace('.tif', '.txt'))

            cmd = f'gdalwarp -tr 0.05 0.05 -tap -r near -co TFW=YES {ortho_layer.source()} {chem_export}\
                -cutline {src_poly} -csql "select ret.geom from retouches_info as ret where ret.fid == {id_poly}"\
                -crop_to_cutline -overwrite -dstnodata 0'
            os.popen(cmd).readlines()

            with open(chem_export_txt, 'w') as f_liste_opi:
                print(OPI, file=f_liste_opi)

            nb_pont_ajoutes += 1

        retinfosauv_layer.addFeatures(liste_ponts)
        retinfosauv_layer.commitChanges()

        retinfo_layer.selectAll()
        retinfo_layer.deleteSelectedFeatures()
        iface.vectorLayerTools().saveEdits(retinfo_layer)
        iface.mapCanvas().refreshAllLayers()
        iface.mapCanvas().refresh()
        retinfo_layer.startEditing()

        msg = QMessageBox()
        msg.setIcon(QMessageBox.Information)
        msg.setText("DALLE_EXPORTÉE : %s" % nom_export)
        msg.setWindowTitle("EXPORT DES PONTS EFFECTUÉ")
        msg.setStandardButtons(QMessageBox.Ok)
        retval = msg.exec_()

        return


iface.mapCanvas().keyReleased.connect(on_key)

