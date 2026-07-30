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
import math
import random


def openProject():
    username = os.environ['USERNAME']
    computername = os.environ['COMPUTERNAME']
    fic_info_path = PurePath().joinpath(Path(QgsProject.instance().homePath(),
                                             Path(f'OUVERT_SUR_{computername}_PAR_{username}')))
    Path(fic_info_path).touch()
    print(os.getcwd())
    os.chdir(QgsProject.instance().homePath())
    print(os.getcwd())
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
style = __STYLE__
crs = __CRS__
pixel_size_x = __PIXELSIZEX__
pixel_size_y = __PIXELSIZEY__
# ===================================

url_graph = url_server + id_branch + '/graph'
url_patch = url_server + id_branch + '/patch'
url_undo = url_server + id_branch + '/patch/undo'
url_redo = url_server + id_branch + '/patch/redo'
url_wmts = url_server + id_branch + '/wmts'
source='contextualWMSLegend=0&crs=EPSG:'+crs+'&dpiMode=7&featureCount=10&format=image/png&layers=opi&styles='+style+'&tileDimensions=Name%3DXXX&tileMatrixSet='+tile_matrix_set+'&url='+url_wmts+'?SERVICE%3DWMTS%26REQUEST%3DGetCapabilities%26VERSION%3D1.0.0'
OPI=None
color=None
opi_layer = None
ortho_layer = None
ortho_irc_layer = None
patch_layer = None
patch_layer_auto = None
patch_layer_triple = None
retinfo_layer = None
retinfosauv_layer = None
avancement_layer = None
graph_layer = None
graph_surface_layer = None
nb_undo = 0

for layer in QgsProject.instance().mapLayers().values():
    name = layer.name().upper()
    if (name[0:3] == 'OPI'):
        opi_layer = layer
    if (name == 'ORTHO'):
        ortho_layer = layer
    if (name == 'ORTHOIRC'):
        ortho_irc_layer = layer
    if (name == 'RACCORDS_MANUEL'):
        patch_layer = layer
    if (name == 'RACCORDS_AUTO'):
        patch_layer_auto = layer
    if (name == 'NOEUDS_MANUEL'):
        patch_layer_triple = layer
    if (name == 'RETOUCHES_INFO'):
        retinfo_layer = layer
    if (name == 'RETOUCHES_INFO_SAUV'):
        retinfosauv_layer = layer
    if (name == 'GRAPHE_CONTOUR'):
        graph_layer = layer
    if (name == 'GRAPHE_SURFACE'):
        graph_surface_layer = layer
    if (name == 'AVANCEMENT'):
        avancement_layer = layer

# verification des paramètres de visibilité pour les couches de graphe
# la bascule contour/surface doit etre réglée en fonction du nombre
# tuiles dans une dalle du cache
# ca depend aussi des DPI de l'écran puisque QGis raisonne en échelle
dpi=iface.mapCanvas().logicalDpiX()
res = graph_surface_layer.rasterUnitsPerPixelX()
echelle=math.ceil(8*res/(0.0254/dpi))
graph_surface_layer.setScaleBasedVisibility(True)
graph_surface_layer.setMaximumScale(echelle)
graph_layer.setScaleBasedVisibility(True)
graph_layer.setMinimumScale(echelle)
iface.mapCanvas().refresh()

def setZoom(factor):
    pixel_size = ortho_layer.rasterUnitsPerPixelX()
    canvas = iface.mapCanvas()
    current = canvas.mapUnitsPerPixel()
    canvas.zoomByFactor(factor * pixel_size / current)
    canvas.refresh()

def sendPatch(patch):
    print('sendPatch...')
    #print(patch)
    QApplication.setOverrideCursor(Qt.WaitCursor)
    res = requests.post(url_patch, json=patch)
    QApplication.restoreOverrideCursor()
    print(res)
    print('...sendPatch')
    return res.text, res.status_code


def selectOPI(x, y):
    # print("selectOPI")
    res = requests.get(url_graph, params={'x': x, 'y': y})
    sel = json.loads(res.text)
    # print(sel)
    if 'opiName' in sel.keys():
        return sel['opiName'], sel['color']
    else:
        return None, None

def search_limit(pts, start, end, cache):
    print(start, end)
    if (end-start)==1:
        print('limite: ', end)
        return end
    i=int((start+end)//2)
    print("on teste :",i)
    if not(i in cache):
        pt = pts[i]
        o, null = selectOPI(pt.x(), pt.y())
        cache[i] = o
    if cache[i] == cache[start]:
        return search_limit(pts, i, end, cache)
    return search_limit(pts, start, i, cache)

def on_key(event):
    global OPI
    global color
    global nb_undo
    # print("on_key")
    touche = event.key()
    # print(touche)
    iface.messageBar().clearWidgets()

    # choix des niveaux de zoom
    if (touche == Qt.Key_Ampersand):
        setZoom(1)
    if (touche == Qt.Key_Eacute):
        setZoom(2)
    if (touche == Qt.Key_QuoteDbl):
        setZoom(4)
    if (touche == Qt.Key_Apostrophe):
        setZoom(8)
    if (touche == Qt.Key_ParenLeft):
        setZoom(16)

    if (touche == Qt.Key_M):
        iface.messageBar().pushMessage("PATCH ", "EN COURS : ", level=Qgis.Warning, duration=0)
        nb_features = patch_layer.featureCount()
        # changement de comportement: s'il n'y a pas d'OPI selectionnée, on prend celle du premier point du polygone
        # if (OPI is None) or (color is None):
        #     msg = QMessageBox()
        #     msg.setIcon(QMessageBox.Information)
        #     msg.setText("PAS D'OPI SELECTIONNEE'")
        #     msg.setWindowTitle("ERREUR")
        #     msg.setStandardButtons(QMessageBox.Ok)
        #     msg.exec_()
        #     OPI = None
        #     return
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
        # recuperation de l'OPI si nécessaire
        if (OPI is None) or (color is None):
            first_pt = feature.geometry().asPolygon()[0][0]
            print(first_pt)
            OPI, color = selectOPI(first_pt.x(), first_pt.y())
            print(OPI, color)
        exporter = QgsJsonExporter()
        patch=json.loads(exporter.exportFeatures([feature]))
        patch['crs'] = {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::2154'}}
        # patch['features'][0]['properties'] = {'opiRef': {'name': OPI, 'color': color}}
        patch['features'][0]['properties'] = {'opiName': OPI, 'color': color, 'is_auto': False}
        mess, code = sendPatch(patch)
        if code != 200:
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Information)
            msg.setText(mess)
            msg.setWindowTitle("ERREUR")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            OPI = None
            return
        else:
            nb_undo = 1

        print(mess)
        patch_layer.deleteFeature(feature.id())
        patch_layer.commitChanges()
        iface.messageBar().pushMessage("PATCH ", "APPLIQUÉ : ", level=Qgis.Success, duration=0)
        graph_layer.setDataSource(graph_layer.source(), "graphe_contour", "gdal")
        ortho_layer.setDataSource(ortho_layer.source(), "ortho", "gdal")
        if ortho_irc_layer:
            ortho_irc_layer.setDataSource(ortho_irc_layer.source(), "orthoIRC", "gdal")
        OPI = None
        # pour ne pas a avoir a remettre en mode edition pour la prochaine saisie
        patch_layer.startEditing()
        return

    if (touche == Qt.Key_N):
        # on recupére un polygone
        patch_layer_triple.startEditing()
        feature = list(patch_layer_triple.getFeatures())[0]
        list_pt = feature.geometry().asPolygon()[0]
        ctr_x = 0
        ctr_y = 0
        print("nb pts : ", len(list_pt))
        # recherche du centre
        for pt in list_pt:
            ctr_x += pt.x()
            ctr_y += pt.y()
        ctr_x /= len(list_pt)
        ctr_y /= len(list_pt)
        print(ctr_x, ctr_y)
        # recherche des OPI
        # on test au hasard des points jusqu'à trouver un point dans 3 OPI différentes
        dic_opi = {}
        cache = {}
        T=[]
        while (len(dic_opi) < 3) and len(cache) < len(list_pt)/2:
            i = random.randint(1, len(list_pt)-1)
            if not(i in cache):
                pt = list_pt[i]
                o, c = selectOPI(pt.x(), pt.y())
                cache[i] = o
                if not(o in dic_opi):
                    dic_opi[o]={'color': c, 'pts': []}
                    T.append(i)
        print(len(dic_opi), len(cache))
        if len(dic_opi) < 3:
            # on a peut-etre pas eu de chance au tirage, on va vérifier tous les pt manquants
            print("verification exhaustive")
            for i in range(len(list_pt)):
                if not(i in cache):
                    pt = list_pt[i]
                    o, c = selectOPI(pt.x(), pt.y())
                    cache[i] = o
                    if not(o in dic_opi):
                        dic_opi[o]={'color': c, 'pts': []}
                        T.append(i)
        print(len(dic_opi), len(cache))
        if len(dic_opi)<3:
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Information)
            msg.setText("IL N'Y A PAS 3 OPI SUR LE DISQUE")
            msg.setWindowTitle("ERREUR")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            OPI = None
            return
        T.sort()
        i = 0
        if not(i in cache):
            pt = list_pt[i]
            o, c = selectOPI(pt.x(), pt.y())
            cache[i] = o
        # premier segment: entre 0 et T[0]
        print("arc entre 0 et ", T[0])
        if cache[0] == cache[T[0]]:
            # tous les points de cet arc sont dans la même opi
            for i in range(T[0]+1):
                dic_opi[cache[T[0]]]['pts'].append(list_pt[i])
        else:
            fin = search_limit(list_pt, 0, T[0], cache)
            for i in range(fin+1):
                dic_opi[cache[0]]['pts'].append(list_pt[i])
            for i in range(fin, T[0]):
                dic_opi[cache[T[0]]]['pts'].append(list_pt[i])
        # deuxieme segment: entre T[0] et T[1]
        print("arc entre ", T[0], " et ", T[1])
        fin = search_limit(list_pt, T[0], T[1], cache)
        for i in range(T[0], fin+1):
            dic_opi[cache[T[0]]]['pts'].append(list_pt[i])
        for i in range(fin, T[1]):
            dic_opi[cache[T[1]]]['pts'].append(list_pt[i])
        # troisieme segment entre T[1] et T[2]
        # on prepare un buffer au cas il soit nécessaire d'insérer les pts dans la premiere OPI
        buffer=[]
        print("arc entre ", T[1], " et ", T[2])
        fin = search_limit(list_pt, T[1], T[2], cache)
        for i in range(T[1], fin+1):
            dic_opi[cache[T[1]]]['pts'].append(list_pt[i])
        # attention, si on retombe sur la premier opi il faut les insérer mettre dans un buffer
        if cache[T[2]] == cache[0]:
            for i in range(fin, T[2]):
                buffer.append(list_pt[i])
        else:
            for i in range(fin, T[2]):
                dic_opi[cache[T[2]]]['pts'].append(list_pt[i])
        # dernier segment entre T[2] et la fin
        print("dernier arc entre ", T[2], " et ", len(list_pt)-1)
        # on va stocker dans un tableau a ajouter eventuellement
        # a l'OPI du premier arc
        last = len(list_pt)-1
        if not(last in cache):
            pt = list_pt[last]
            o, c = selectOPI(pt.x(), pt.y())
            cache[last] = o
        if cache[last] == cache[T[2]]:
            print("tous les points du dernier arc sont dans la même opi")
            # tous les points de cet arc sont dans la même opi
            for i in range(T[2], last+1):
                buffer.append(list_pt[i])
        else:
            print("on cherche la limite sur le dernier arc")
            fin = search_limit(list_pt, T[2], len(list_pt)-1, cache)
            for i in range(T[2], fin+1):
                dic_opi[cache[T[2]]]['pts'].append(list_pt[i])
            for i in range(fin, len(list_pt)):
                buffer.append(list_pt[i])
        if cache[0] == cache[last]:
            # le premier et le dernier arc sont dans la meme opi
            print("on fait la jointure entre le premier et le dernier")
            print(len(dic_opi[cache[0]]['pts']), len(buffer))
            dic_opi[cache[0]]['pts'] = buffer + dic_opi[cache[0]]['pts']
            print(len(dic_opi[cache[0]]['pts']))
        else:
            # logiquement il y a une opi qui n'a pas encore d'arc
            print("on creer le dernier arc manquant ", len(dic_opi[cache[last]]['pts']))
            dic_opi[cache[last]]['pts'] = buffer
        print("nb de test effectués: ", len(cache))

        # il reste a créer les polygones
        exporter = QgsJsonExporter()
        nb_undo = 0
        for opiname, opi in dic_opi.items():
            points = opi["pts"]
            points.append(QgsPointXY(ctr_x, ctr_y))
            points.append(points[0])
            geom = QgsGeometry.fromPolygonXY([points])
            new_feature = QgsFeature(patch_layer_triple.fields())
            new_feature.setGeometry(geom)
            patch=json.loads(exporter.exportFeatures([new_feature]))
            patch['crs'] = {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::2154'}}
            patch['features'][0]['properties'] = {'opiName': opiname, 'color': opi["color"], 'is_auto': False}
            # patch['features'][0]['properties'] = {'opiRef': {'name': opiname, 'color': opi["color"]}}
            # patch_layer_triple.addFeature(new_feature)
            mess, code = sendPatch(patch)
            if code != 200:
                msg = QMessageBox()
                msg.setIcon(QMessageBox.Information)
                msg.setText(mess)
                msg.setWindowTitle("ERREUR")
                msg.setStandardButtons(QMessageBox.Ok)
                msg.exec_()
                OPI = None
                return
            else:
                nb_undo += 1
        patch_layer_triple.deleteFeature(feature.id())
        patch_layer_triple.commitChanges()
        iface.messageBar().pushMessage("PATCH ", "APPLIQUÉ : ", level=Qgis.Success, duration=0)
        graph_layer.setDataSource(graph_layer.source(), "graphe_contour", "gdal")
        ortho_layer.setDataSource(ortho_layer.source(), "ortho", "gdal")
        if ortho_irc_layer:
            ortho_irc_layer.setDataSource(ortho_irc_layer.source(), "orthoIRC", "gdal")
        OPI = None
        # pour ne pas a avoir a remettre en mode edition pour la prochiane saisie
        patch_layer_triple.startEditing()
        return


    if (touche == Qt.Key_A):
        nb_features = patch_layer_auto.featureCount()
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
        patch_layer_auto.startEditing()
        feature = list(patch_layer_auto.getFeatures())[0]
        print(QgsWkbTypes.displayString(feature.geometry().wkbType()))
        print(feature.geometry().wkbType())
        firstLine=feature.geometry().asPolyline()
        sOPI1=selectOPI(firstLine[0].x(),firstLine[0].y())
        sOPI2=sOPI1
        next_sommet = 1
        while (next_sommet < len(firstLine) and sOPI1 == sOPI2):
            sOPI2=selectOPI(firstLine[next_sommet].x(),firstLine[next_sommet].y())
            next_sommet +=1
        print(sOPI1, sOPI2)
        if sOPI1 == sOPI2:
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Information)
            msg.setText("LA RETOUCHE DOIT COUPER LE GRAPHE AU MOINS DEUX FOIS")
            msg.setWindowTitle("ERREUR")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            OPI = None
            return

        exporter = QgsJsonExporter()
        patch=json.loads(exporter.exportFeatures([feature]))
        patch['crs'] = {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::2154'}}
        # patch['features'][0]['properties'] = {'opiRef': {'name': sOPI1[0], 'color': sOPI1[1]}, 'opiSec': {'name': sOPI2[0], 'color': sOPI2[1]}}
        patch['features'][0]['properties'] = {'opiName': sOPI1[0], 'color': sOPI1[1], 'opiNameSec': sOPI2[0], 'colorSec': sOPI2[1], 'is_auto': True}
        mess, code = sendPatch(patch)
        if code != 200:
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Information)
            msg.setText(mess)
            msg.setWindowTitle("ERREUR")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            OPI = None
            return
        else:
            nb_undo = 1

        print(mess)
        patch_layer_auto.deleteFeature(feature.id())
        patch_layer_auto.commitChanges()
        iface.messageBar().pushMessage("PATCH ", "APPLIQUÉ : ", level=Qgis.Success, duration=0)
        graph_layer.setDataSource(graph_layer.source(), "graphe_contour", "gdal")
        ortho_layer.setDataSource(ortho_layer.source(), "ortho", "gdal")
        if ortho_irc_layer:
            ortho_irc_layer.setDataSource(ortho_irc_layer.source(), "orthoIRC", "gdal")
        OPI = None
        # pour ne pas a avoir a remettre en mode edition pour la prochiane saisie
        patch_layer_auto.startEditing()
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
        res = None
        if nb_undo > 1:
            for i in range(nb_undo):
                res = requests.put(url_undo)
        else:
            res = requests.put(url_undo)
        nb_undo = 0
        # print(res.text)
        # iface.mapCanvas().refreshAllLayers()
        graph_layer.setDataSource(graph_layer.source(), "graphe_contour", "gdal")
        ortho_layer.setDataSource(ortho_layer.source(), "ortho", "gdal")
        if ortho_irc_layer:
            ortho_irc_layer.setDataSource(ortho_irc_layer.source(), "orthoIRC", "gdal")
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

    if (touche == Qt.Key_I) and ortho_irc_layer:
        id_ortho_irc_layer = QgsProject.instance().layerTreeRoot().findLayer(ortho_irc_layer.id())
        if id_ortho_irc_layer.isVisible():
            id_ortho_irc_layer.setItemVisibilityChecked(False)
        else:
            id_ortho_irc_layer.setItemVisibilityChecked(True)
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

            cmd = f'gdalwarp -tr {pixel_size_x} {pixel_size_y} -tap -r near -co TFW=YES {ortho_layer.source()} {chem_export}\
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

