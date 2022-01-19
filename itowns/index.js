/* eslint-disable no-console */
/* global setupLoadingScreen, GuiTools */
import * as itowns from 'itowns';
import Viewer from './Viewer';
import Editing from './Editing';
import Branch from './Branch';
import Controller from './Controller';

// Global itowns pour GuiTools -> peut être améliorer
global.itowns = itowns;

// fonction permettant d'afficher la valeur de l'echelle et du niveau de dezoom
function updateScaleWidget(view, resolution, maxGraphDezoom) {
  let distance = view.getPixelsToMeters(200);
  let unit = 'm';
  const dezoom = Math.fround(distance / (200 * resolution));
  if (distance >= 1000) {
    distance /= 1000;
    unit = 'km';
  }
  if (distance <= 1) {
    distance *= 100;
    unit = 'cm';
  }
  document.getElementById('spanZoomWidget').innerHTML = dezoom <= 1 ? `zoom: ${1 / dezoom}` : `zoom: 1/${dezoom}`;
  document.getElementById('spanScaleWidget').innerHTML = `${distance.toFixed(2)} ${unit}`;
  document.getElementById('spanGraphVisibWidget').classList.toggle('not_displayed', dezoom > maxGraphDezoom);
  return dezoom;
}

// check if string is in "x,y" format with x and y positive floats
// return "null" if incorrect string format, otherwise [x, y] array
function checkCoordString(coordStr) {
  const rgxFloat = '\\s*([0-9]+[.]?[0-9]*)\\s*';
  const rgxCoord = new RegExp(`^${rgxFloat},${rgxFloat}$`);
  const rgxCatch = rgxCoord.exec(coordStr);
  if (rgxCatch) {
    return [parseFloat(rgxCatch[1]), parseFloat(rgxCatch[2])];
  }
  return null;
}

async function main() {
  console.log(`Client in '${process.env.NODE_ENV}' mode.`);

  const urlParams = new URLSearchParams(window.location.search);
  const serverAPI = urlParams.get('serverapi') ? urlParams.get('serverapi') : 'localhost';
  const portAPI = urlParams.get('portapi') ? urlParams.get('portapi') : 8081;
  console.log('serverAPI:', serverAPI, 'portAPI:', portAPI);
  const apiUrl = `http://${serverAPI}:${portAPI}`;

  const nameCache = urlParams.get('namecache');

  itowns.Fetcher.json(`${apiUrl}/version`).then((obj) => {
    document.getElementById('spAPIVersion_val').innerText = obj.version_git;
  }).catch(() => {
    document.getElementById('spAPIVersion_val').innerText = 'unknown';
  });
  try {
    const getCaches = await itowns.Fetcher.json(`${apiUrl}/caches`);
    if (getCaches.length === 0) throw new Error('Pas de cache en base');

    let [activeCache] = getCaches.filter((cache) => cache.name === nameCache);
    if (!activeCache) [activeCache] = getCaches;
    console.log(activeCache);

    const getOverviews = itowns.Fetcher.json(`${apiUrl}/json/overviews?cachePath=${activeCache.path}`);
    const getBranches = itowns.Fetcher.json(`${apiUrl}/branches?idCache=${activeCache.id}`);
    // const getPatches = itowns.Fetcher.json(`${apiUrl}/0/patches`);
    // const getVectorList = itowns.Fetcher.json(`${apiUrl}/vectors?cachePath=${activeCache.path}`);

    const viewerDiv = document.getElementById('viewerDiv');
    const viewer = new Viewer(viewerDiv);

    const overviews = await getOverviews;

    // on ajoute les dataset.limits pour les layers graph/contour
    // avec uniquement les niveaux correspondants au COG mis à jour par les patchs
    // c'est-a-dire un seul niveau de COG
    // on a donc besoin de connaitre le nombre de niveaux inclus dans un COG
    const slabSize = Math.min(overviews.slabSize.width, overviews.slabSize.height);
    const nbSubLevelsPerCOG = Math.floor(Math.log2(slabSize));
    overviews.dataSet.limitsForGraph = {};
    // on copie les limites des (nbSubLevelsPerCOG + 1) derniers niveaux
    for (let l = overviews.dataSet.level.max - nbSubLevelsPerCOG;
      l <= overviews.dataSet.level.max; l += 1) {
      overviews.dataSet.limitsForGraph[l] = overviews.dataSet.limits[l];
    }
    viewer.zoomMinPatch = overviews.dataSet.level.max - nbSubLevelsPerCOG;
    // pour la fonction updateScaleWidget
    viewer.maxGraphDezoom = 2 ** nbSubLevelsPerCOG;

    viewer.createView(overviews, activeCache.id);
    setupLoadingScreen(viewerDiv, viewer.view);
    // FeatureToolTip.init(viewerDiv, viewer.view);

    viewer.view.isDebugMode = true;
    viewer.menuGlobe = new GuiTools('menuDiv', viewer.view);
    viewer.menuGlobe.gui.width = 300;

    viewer.menuGlobe.colorGui.show();
    viewer.menuGlobe.colorGui.open();
    viewer.menuGlobe.vectorGui = viewer.menuGlobe.gui.addFolder('Extra Layers');
    viewer.menuGlobe.vectorGui.open();

    const branch = new Branch(apiUrl, viewer);
    const editing = new Editing(branch, apiUrl);

    const controllers = new Controller(viewer.menuGlobe, editing);

    // Patch pour ajouter la modification de l'epaisseur des contours dans le menu
    viewer.menuGlobe.addImageryLayerGUI = function addImageryLayerGUI(layer) {
    /* eslint-disable no-param-reassign */
      let typeGui = 'colorGui';
      if (!['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].includes(layer.id)) {
        typeGui = 'vectorGui';
      }
      if (this[typeGui].hasFolder(layer.id)) { return; }
      if (layer.id === 'selectedFeature') { return; }

      const folder = this[typeGui].addFolder(layer.id);
      folder.add({ visible: layer.visible }, 'visible').onChange(((value) => {
        layer.visible = value;

        if (layer.id === editing.alertLayerName) {
          viewer.view.getLayerById('selectedFeature').visible = value;
        }

        viewer.view.notifyChange(layer);
      }));
      folder.add({ opacity: layer.opacity }, 'opacity').min(0.001).max(1.0).onChange(((value) => {
        layer.opacity = value;
        viewer.view.notifyChange(layer);
      }));
      if (layer.effect_parameter) {
        folder.add({ thickness: layer.effect_parameter }, 'thickness').min(0.5).max(5.0).onChange(((value) => {
          layer.effect_parameter = value;
          viewer.view.notifyChange(layer);
        }));
      }
      if (typeGui === 'vectorGui' && layer.id !== 'Remarks') {
        folder.add(branch, 'deleteVectorLayer').name('delete').onChange(() => {
          if (layer.id !== editing.alertLayerName) {
            branch.deleteVectorLayer(layer);
            viewer.view.notifyChange(layer);
            controllers.refreshDropBox('alert', [' -', ...branch.vectorList
              .filter((elem) => elem.name !== layer.id)
              .map((elem) => elem.name)]);
          } else {
            viewer.message = 'Couche en edition';
          }
        });
      }
    /* eslint-enable no-param-reassign */
    };

    viewer.menuGlobe.removeLayersGUI = function removeLayersGUI(nameLayer) {
      if (this.colorGui.hasFolder(nameLayer)) {
        this.colorGui.removeFolder(nameLayer);
      } else {
        this.vectorGui.removeFolder(nameLayer);
      }
    };

    // const branch = new Branch(apiUrl, viewer);
    branch.list = await getBranches;

    [branch.active] = branch.list;

    const getVectorList = itowns.Fetcher.json(`${apiUrl}/${branch.active.id}/vectors`);
    branch.vectorList = await getVectorList;

    branch.setLayers();
    viewer.refresh(branch.layers);

    // const editing = new Editing(branch, apiUrl);
    editing.cliche = 'none';
    editing.coord = `${viewer.xcenter.toFixed(2)},${viewer.ycenter.toFixed(2)}`;
    editing.color = [0, 0, 0];

    // const controllers = new Controller(viewer.menuGlobe, editing);

    // Gestion branche
    branch.branch = branch.active.name;
    controllers.branch = viewer.menuGlobe.gui.add(branch, 'branch', branch.list.map((elem) => elem.name)).name('Active branch');
    controllers.branch.onChange(async (name) => {
      console.log('choosed branch: ', name);
      branch.active = {
        name,
        id: branch.list.filter((elem) => elem.name === name)[0].id,
      };
      await branch.changeBranch();
      controllers.setEditingController();
      controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)]);
      controllers.resetAlerts();
    });
    controllers.createBranch = viewer.menuGlobe.gui.add(branch, 'createBranch').name('Add new branch');

    // Selection OPI
    controllers.select = viewer.menuGlobe.gui.add(editing, 'select').name('Select an OPI');
    controllers.cliche = viewer.menuGlobe.gui.add(editing, 'cliche').name('OPI selected');
    controllers.cliche.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Coord
    controllers.coord = viewer.menuGlobe.gui.add(editing, 'coord').name('Coordinates');
    controllers.coord.listen();

    // Saisie
    controllers.polygon = viewer.menuGlobe.gui.add(editing, 'polygon').name('Start polygon');
    controllers.undo = viewer.menuGlobe.gui.add(editing, 'undo');
    controllers.redo = viewer.menuGlobe.gui.add(editing, 'redo');
    controllers.clear = viewer.menuGlobe.gui.add(editing, 'clear');
    controllers.hide(['polygon', 'undo', 'redo', 'clear']);

    // Message
    viewer.message = '';
    controllers.message = viewer.menuGlobe.gui.add(viewer, 'message').name('Message');
    controllers.message.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Couche d'alertes
    editing.alert = ' -';
    controllers.alert = viewer.menuGlobe.gui.add(editing, 'alert', [' -', ...branch.vectorList.map((elem) => elem.name)]).name('Alerts Layer');
    controllers.alert.onChange(async (name) => {
      console.log('choosed alert vector layer: ', name);

      if (name !== ' -') {
        editing.alertLayerName = name;
        viewer.alertLayerName = name;

        const layerTest = viewer.view.getLayerById(editing.alertLayerName);
        editing.alertFC = await layerTest.source.loadData(undefined, layerTest);

        // if (editing.alertFC.features.length > 0) {
        editing.nbValidated = editing.alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status === true,
        ).length;
        editing.nbChecked = editing.alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status !== null,
        ).length;
        editing.nbTotal = editing.alertFC.features[0].geometries.length;
        editing.progress = `${editing.nbChecked}/${editing.nbTotal} (${editing.nbValidated} validés)`;
        // controllers.progress.updateDisplay();

        let featureIndex = 0;
        if (editing.alertFC.features[0].geometries[0].properties.status !== null) {
          while (featureIndex < editing.alertFC.features[0].geometries.length
            && editing.alertFC.features[0].geometries[featureIndex].properties.status !== null) {
            featureIndex += 1;
          }
          featureIndex -= 1;
        }
        editing.featureIndex = featureIndex;

        editing.id = 0;
        controllers.id.updateDisplay();

        editing.centerOnAlertFeature();
        editing.validated = editing.featureSelectedGeom.properties.status;
        controllers.validated.updateDisplay();
        viewer.remark = editing.featureSelectedGeom.properties.comment;
        controllers.remark.updateDisplay();

        controllers.setVisible(['progress', 'id', 'validated', 'unchecked']);
        if (name === 'Remarks') {
          controllers.setVisible(['remark']);
        } else {
          controllers.hide(['remark']);
        }
        // }
      } else {
        controllers.resetAlerts();
      }
      viewer.message = '';
      viewer.refresh(branch.layers);
      // viewer.refresh({ name: branch.layers[name] });
    });
    editing.id = '';
    controllers.id = viewer.menuGlobe.gui.add(editing, 'id').name('Alert id');
    controllers.id.onChange(() => {
      console.log("saisie d'une id");
      editing.currentStatus = editing.STATUS.WRITING;
    });
    controllers.id.onFinishChange((value) => {
      const newId = parseInt(value, 10);
      console.log("changement d'id : ", newId);
      editing.currentStatus = editing.STATUS.RAS;
      if (newId >= 0 && newId < editing.nbTotal) {
        editing.featureIndex = newId;

        editing.centerOnAlertFeature();
      } else {
        viewer.message = 'id non valide';
        editing.id = editing.featureIndex;
        controllers.id.updateDisplay();
      }
    });
    controllers.hide('id');

    editing.progress = '';
    controllers.progress = viewer.menuGlobe.gui.add(editing, 'progress').name('Progress');
    controllers.progress.listen().domElement.parentElement.style.pointerEvents = 'none';
    controllers.hide('progress');

    controllers.unchecked = viewer.menuGlobe.gui.add(editing, 'unchecked').name('Mark as unchecked');
    controllers.hide('unchecked');

    editing.validated = false;
    controllers.validated = viewer.menuGlobe.gui.add(editing, 'validated').name('Validated');
    controllers.validated.onChange(async (value) => {
      console.log('change status', value);
      const idFeature = editing.featureSelectedGeom.properties.id;
      const res = await fetch(`${apiUrl}/alert/${idFeature}?status=${value}`,
        {
          method: 'PUT',
        });
      if (res.status === 200) {
        // viewer.refresh(branch.layers);
        viewer.refresh({ [editing.alertLayerName]: branch.layers[editing.alertLayerName] });
        if (value === true) {
          editing.nbValidated += 1;
          if (editing.alertFC.features[0].geometries[editing.featureIndex]
            .properties.status === null) {
            editing.nbChecked += 1;
          }
        } else {
          editing.nbValidated -= 1;
        }
        editing.progress = `${editing.nbChecked}/${editing.nbTotal} (${editing.nbValidated} validés)`;
        editing.alertFC.features[0].geometries[editing.featureIndex].properties.status = value;
      } else {
        viewer.message = 'PB with validate';
      }
    });
    controllers.hide('validated');

    viewer.remark = '';
    controllers.remark = viewer.menuGlobe.gui.add(viewer, 'remark').name('Remark');
    controllers.remark.listen().domElement.parentElement.style.pointerEvents = 'none';
    controllers.hide('remark');

    // Remarques
    controllers.addRemark = viewer.menuGlobe.gui.add(editing, 'addRemark').name('Add remark');

    // editing controllers
    editing.controllers = {
      select: controllers.select,
      cliche: controllers.cliche,
      polygon: controllers.polygon,
      // checked: controllers.checked,
      id: controllers.id,
      validated: controllers.validated,
      // comment: controllers.comment,
      addRemark: controllers.addRemark,
    };
    viewerDiv.focus();

    // Listen to drag and drop actions
    document.addEventListener('dragenter', (e) => { e.preventDefault(); }, false);
    document.addEventListener('dragover', (e) => { e.preventDefault(); }, false);
    document.addEventListener('dragleave', (e) => { e.preventDefault(); }, false);
    document.addEventListener('drop', (e) => { viewer.addDnDFiles(e, e.dataTransfer.files); }, false);
    document.addEventListener('paste', (e) => { viewer.addDnDFiles(e, e.clipboardData.files); }, false);

    const { view } = viewer;
    view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, () => {
      console.info('-> View initialized');
      viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
    });
    view.addEventListener(itowns.PLANAR_CONTROL_EVENT.MOVED, () => {
      console.info('-> View moved');
      if (view.controls.state === -1) {
        viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
      }
    });

    view.addEventListener('file-dropped', async (event) => {
      console.log('-> A file had been dropped');
      // controllers.resetAlerts();
      await branch.saveLayer(event.name, event.data, event.style);
      controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)]);
    });

    view.addEventListener('branch-created', () => {
      console.log('-> New branch created');
      controllers.setEditingController();
      controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)]);
      controllers.resetAlerts();
      controllers.branch = controllers.branch.options(branch.list.map((elem) => elem.name))
        .setValue(branch.active.name);
      controllers.branch.onChange(async (name) => {
        console.log('choosed branch: ', name);
        branch.active = {
          name,
          id: branch.list.filter((elem) => elem.name === name)[0].id,
        };
        await branch.changeBranch();
        controllers.setEditingController();
        controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)]);
        controllers.resetAlerts();
      });
    });

    view.addEventListener('remark-added', async () => {
      console.log('-> A remark had been added');
      if (editing.alertLayerName === 'Remarks') {
        const layerAlert = viewer.view.getLayerById(editing.alertLayerName);
        await layerAlert.whenReady;
        editing.alertFC = await layerAlert.source.loadData(undefined, layerAlert);

        editing.nbValidated = editing.alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status === true,
        ).length;
        editing.nbChecked = editing.alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status !== null,
        ).length;
        editing.nbTotal = editing.alertFC.features[0].geometries.length;
        editing.progress = `${editing.nbChecked}/${editing.nbTotal} (${editing.nbValidated} validés)`;

        editing.centerOnAlertFeature();
        editing.validated = editing.featureSelectedGeom.properties.status;
        controllers.validated.updateDisplay();
        viewer.remark = editing.featureSelectedGeom.properties.comment;
        controllers.remark.updateDisplay();

        controllers.setVisible(['progress', 'id', 'validated', 'unchecked', 'remark']);
      }
    });

    viewerDiv.addEventListener('mousemove', (ev) => {
      ev.preventDefault();
      editing.mousemove(ev);
      return false;
    }, false);
    viewerDiv.addEventListener('click', async (ev) => {
      ev.preventDefault();

      if (editing.alertLayerName) {
        const layerTest = view.getLayerById(editing.alertLayerName);
        const features = view.pickFeaturesAt(ev, 5, layerTest.id);

        if (features[layerTest.id].length > 0) {
          const featureCollec = await layerTest.source.loadData(undefined, layerTest);
          editing.alertFC = featureCollec;
          for (let i = 0; i < featureCollec.features[0].geometries.length; i += 1) {
            if (featureCollec.features[0].geometries[i] === features[layerTest.id][0].geometry) {
              editing.featureIndex = i;
            }
          }

          if (features[layerTest.id][0].geometry.properties.status === null) {
            editing.postValue(features[layerTest.id][0].geometry.properties.id, 'status', false);
            editing.featureSelectedGeom.properties.status = false;
            editing.nbChecked += 1;
            editing.progress = `${editing.nbChecked}/${editing.nbTotal} (${editing.nbValidated} validés)`;
          }

          editing.id = editing.featureIndex;
          controllers.id.updateDisplay();
          editing.validated = features[layerTest.id][0].geometry.properties.status;
          controllers.validated.updateDisplay();
          viewer.remark = features[layerTest.id][0].geometry.properties.comment;

          editing.highlightSelectedFeature(featureCollec,
            features[layerTest.id][0].geometry,
            features[layerTest.id][0].type);
        }
      }

      editing.click(ev);
      return false;
    }, false);

    viewerDiv.addEventListener('mousedown', (ev) => {
      if (ev.button === 1) {
        console.log('middle button clicked');
        view.controls.initiateDrag();
        view.controls.updateMouseCursorType();
      }
    });

    controllers.coord.onChange(() => {
      if (!checkCoordString(editing.coord)) {
        editing.message = 'Coordonnees non valides';
      } else {
        editing.message = '';
      }
      return false;
    });

    controllers.coord.onFinishChange(() => {
      const coords = checkCoordString(editing.coord);
      if (coords) {
        viewer.centerCamera(coords[0], coords[1]);
      }
      editing.message = '';
      return false;
    });

    window.addEventListener('keydown', (ev) => {
      editing.keydown(ev);
      return false;
    });
    window.addEventListener('keyup', (ev) => {
      editing.keyup(ev);
      return false;
    });

    document.getElementById('recenterBtn').addEventListener('click', () => {
      viewer.centerCamera(viewer.xcenter, viewer.ycenter);
      return false;
    }, false);
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      console.log('Zoom-In');
      if ((view.getPixelsToMeters() / 2) > viewer.resolLvMax) {
        view.camera.camera3D.zoom *= 2;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
      }
      return false;
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      console.log('Zoom-Out');
      if ((view.getPixelsToMeters() * 2) < viewer.resolLvMin) {
        view.camera.camera3D.zoom *= 0.5;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
      }
      return false;
    });

    const helpContent = document.getElementById('help-content');
    helpContent.style.visibility = 'hidden';
    document.getElementById('help').addEventListener('click', () => {
      helpContent.style.visibility = (helpContent.style.visibility === 'hidden') ? 'visible' : 'hidden';
    });
  } catch (err) {
    /* eslint-disable no-alert */
    console.log(err);
    if (`${err.name}: ${err.message}` === 'TypeError: Failed to fetch') {
      const newApiUrl = window.prompt(`API non accessible à l'adresse renseignée (${apiUrl}). Veuillez entrer une adresse valide :`, apiUrl);
      const apiUrlSplit = newApiUrl.split('/')[2].split(':');
      window.location.assign(`${window.location.href.split('?')[0]}?serverapi=${apiUrlSplit[0]}&portapi=${apiUrlSplit[1]}`);
    } else {
      window.alert(err);
    }
    /* eslint-enable no-alert */
  }
}
main();
