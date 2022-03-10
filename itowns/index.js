/* eslint-disable no-console */
// /* global setupLoadingScreen, GuiTools */
import * as itowns from 'itowns';
import Viewer from './Viewer';
import Editing from './Editing';
import Branch from './Branch';
import Controller from './Controller';
import API from './API';

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
    return { x: parseFloat(rgxCatch[1]), y: parseFloat(rgxCatch[2]) };
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

  const api = new API(apiUrl);

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

    if (activeCache === undefined) {
      if (nameCache === null) {
        [activeCache] = getCaches;
        /* eslint-disable no-alert */
        if (!window.confirm(`Pas de nom de cache indiqué. Voulez-vous charger le cache '${activeCache.name}'?`)) {
          throw new Error('Pas de cache indiqué');
        }
        console.log(activeCache);
      } else throw new Error(`Cache '${nameCache}' inexistant`);
    } else console.log(activeCache);

    const getOverviews = itowns.Fetcher.json(`${apiUrl}/json/overviews?cachePath=${activeCache.path}`);
    const getBranches = itowns.Fetcher.json(`${apiUrl}/branches?idCache=${activeCache.id}`);

    const viewerDiv = document.getElementById('viewerDiv');
    const viewer = new Viewer(viewerDiv, api);

    const overviews = await getOverviews;

    viewer.createView(overviews);
    // setupLoadingScreen(viewerDiv, viewer.view);
    // FeatureToolTip.init(viewerDiv, viewer.view);

    // viewer.view.isDebugMode = true;

    const branch = new Branch(viewer, activeCache.id);
    const editing = new Editing(branch);

    const controllers = new Controller(viewer.menuGlobe);

    branch.list = await getBranches;

    [branch.active] = branch.list;

    await branch.setLayers();
    viewer.refresh(branch.layers);

    // Gestion branche
    controllers.branchName = branch.active.name;
    controllers.activeBranch = viewer.menuGlobe.gui.add(controllers, 'branchName', branch.list.map((elem) => elem.name))
      .name('Active branch');
    controllers.activeBranch.onChange((name) => {
      document.activeElement.blur();
      console.log('choosed branch: ', name);
      branch.changeBranch(name);
    });
    controllers.createBranch = viewer.menuGlobe.gui.add(branch, 'createBranch').name('Add new branch');

    // Selection OPI
    controllers.select = viewer.menuGlobe.gui.add(editing, 'select').name('Select an OPI');
    editing.opiName = 'none';
    controllers.opiName = viewer.menuGlobe.gui.add(editing, 'opiName').name('OPI selected');
    controllers.opiName.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Coord
    editing.coord = `${viewer.x.toFixed(2)},${viewer.y.toFixed(2)}`;
    controllers.coord = viewer.menuGlobe.gui.add(editing, 'coord').name('Coordinates');
    controllers.coord.listen();

    // Saisie
    controllers.polygon = viewer.menuGlobe.gui.add(editing, 'polygon').name('Start polygon');
    controllers.undo = viewer.menuGlobe.gui.add(editing, 'undo');
    controllers.redo = viewer.menuGlobe.gui.add(editing, 'redo');
    controllers.clear = viewer.menuGlobe.gui.add(editing, 'clear');

    // Message
    viewer.message = '';
    controllers.message = viewer.menuGlobe.gui.add(viewer, 'message').name('Message');
    controllers.message.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Couche d'alertes
    editing.alert = ' -';
    controllers.alert = viewer.menuGlobe.gui.add(editing, 'alert', [' -', ...branch.vectorList.map((elem) => elem.name)]).name('Alerts Layer');
    controllers.alert.onChange(async (layerName) => {
      document.activeElement.blur();
      console.log('choosed alert vector layer: ', layerName);
      if (branch.alert.layerName !== ' -') viewer.view.getLayerById(branch.alert.layerName).isAlert = false;

      const layersToRefresh = [];
      if (branch.alert.layerName !== ' -' || layerName === ' -') layersToRefresh.push(branch.alert.layerName);

      if (layerName !== ' -') {
        layersToRefresh.push(layerName);

        branch.alert.layerName = layerName;
        const layerAlert = viewer.view.getLayerById(branch.alert.layerName);
        layerAlert.isAlert = true;
        branch.alert.featureCollection = await layerAlert.source.loadData(undefined, layerAlert);
        const alertFC = branch.alert.featureCollection;

        if (alertFC.features.length > 0) {
          branch.alert.nbValidated = alertFC.features[0].geometries.filter(
            (elem) => elem.properties.status === true,
          ).length;
          branch.alert.nbChecked = alertFC.features[0].geometries.filter(
            (elem) => elem.properties.status !== null,
          ).length;
          branch.alert.nbTotal = alertFC.features[0].geometries.length;
          branch.alert.progress = `${branch.alert.nbChecked}/${branch.alert.nbTotal} (${branch.alert.nbValidated} validés)`;

          branch.alert.selectLastViewed({ centerOnFeature: true });
        }
      } else {
        if (viewer.view.getLayerById('selectedFeature')) {
          viewer.view.removeLayer('selectedFeature');
        }
        branch.alert.reset();
      }
      controllers.setAlertCtr(layerName === 'Remarques' && branch.alert.featureCollection.features.length === 0 ? ' -' : layerName);
      viewer.refresh(layersToRefresh);
    });
    branch.alert.id = '';
    controllers.id = viewer.menuGlobe.gui.add(branch.alert, 'id').name('Alert id');
    controllers.id.onChange(() => {
      console.log("saisie d'une id");
      editing.currentStatus = editing.STATUS.WRITING;
    });
    controllers.id.onFinishChange((value) => {
      const newId = parseInt(value, 10);
      console.log('Nouvelle id : ', newId);
      editing.currentStatus = editing.STATUS.RAS;
      if (newId >= 0 && newId < branch.alert.nbTotal) {
        branch.alert.changeFeature(newId, { centerOnFeature: true });
      } else {
        viewer.message = 'id non valide';
        branch.alert.id = branch.alert.featureIndex;
        controllers.id.updateDisplay();
      }
    });

    branch.alert.progress = '';
    controllers.progress = viewer.menuGlobe.gui.add(branch.alert, 'progress').name('Progress');
    controllers.progress.listen().domElement.parentElement.style.pointerEvents = 'none';

    controllers.uncheck = viewer.menuGlobe.gui.add(branch.alert, 'uncheck').name('Mark as unchecked');

    branch.alert.validated = false;
    controllers.validated = viewer.menuGlobe.gui.add(branch.alert, 'validated').name('Validated');
    controllers.validated.onChange((value) => {
      console.log('change status', value);

      const featureSelectedGeom = branch.alert.featureCollection.features[0]
        .geometries[branch.alert.featureIndex];

      branch.alert.postValue(featureSelectedGeom.properties.id, 'status', value);
      if (value === true) {
        branch.alert.nbValidated += 1;
        if (branch.alert.featureCollection.features[0].geometries[branch.alert.featureIndex]
          .properties.status === null) {
          branch.alert.nbChecked += 1;
        }
      } else {
        branch.alert.nbValidated -= 1;
      }
      branch.alert.progress = `${branch.alert.nbChecked}/${branch.alert.nbTotal} (${branch.alert.nbValidated} validés)`;
    });

    branch.alert.comment = '';
    controllers.comment = viewer.menuGlobe.gui.add(branch.alert, 'comment').name('Comment');
    controllers.comment.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Remarques
    controllers.addRemark = viewer.menuGlobe.gui.add(editing, 'addRemark').name('Add remark');
    controllers.suppRemark = viewer.menuGlobe.gui.add(editing, 'suppRemark').name('Delete remark');

    controllers.setPatchCtr('orig');
    controllers.setAlertCtr(' -');

    // editing controllers
    editing.controllers = {
      select: controllers.select,
      opiName: controllers.opiName,
      polygon: controllers.polygon,
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

    view.addEventListener('file-dropped', (ev) => {
      console.log(`-> A file (${ev.name}) had been dropped`);
      branch.saveLayer(ev.name, ev.data, ev.style)
        .then(() => {
          viewer.refresh(branch.layers.filter((layer) => layer.name === ev.name));
          controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)]);
        })
        .catch((error) => {
          view.dispatchEvent({
            type: 'error',
            msg: error,
          });
        });
    });

    view.addEventListener('vectorLayer-removed', (event) => {
      // console.log(`-> Layer '${event.layerName} (id: ${event.layerId}) had been removed`);
      branch.deleteLayer(event.layerName, event.layerId)
        .then(() => {
          console.log(`-> Vector '${event.layerName} (id: ${event.layerId}) had been deleted`);
          // const layer = branch.vectorList.filter((elem) => elem.id === event.layerId)[0];
          // const index = branch.vectorList.indexOf(layer);
          // branch.vectorList.splice(index, 1);
          // delete branch.layers[layer.name];

          controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)]);
        })
        .catch((error) => {
          view.dispatchEvent({
            type: 'error',
            msg: error,
          });
        });
    });

    view.addEventListener('branch-created', (newBranch) => {
      console.log(`-> New branch created (name: '${newBranch.name}', id: ${newBranch.id})`);
      branch.changeBranch(newBranch.name);
      // controllers.setEditingController();
      // controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)]);
      // controllers.resetAlerts();

      controllers.refreshDropBox('activeBranch', [...branch.list.map((elem) => elem.name)], Object.keys(branch.list).length - 1);
      // controllers.activeBranch = controllers.activeBranch
      //   .options(branch.list.map((elem) => elem.name))
      //   .setValue(branch.active.name);
      // controllers.activeBranch.onChange((name) => {
      //   console.log('choosed branch: ', name);
      //   branch.changeBranch(name);
      //   // controllers.setEditingController();
      //   // controllers.refreshDropBox('alert',
      //   //   [' -', ...branch.vectorList.map((elem) => elem.name)]);
      //   // controllers.resetAlerts();
      // });
    });

    view.addEventListener('branch-changed', (newBranch) => {
      console.log(`branche changed to '${newBranch.name}'`);
      controllers.setPatchCtr(newBranch.name);
      controllers.refreshDropBox('alert', [' -', ...branch.vectorList.map((elem) => elem.name)], 0);
      // controllers.refreshAlertCtr();
      controllers.setAlertCtr(' -');
      if (viewer.view.getLayerById('selectedFeature')) {
        viewer.view.removeLayer('selectedFeature');
      }
      // branch.resetAlert();
      viewer.cleanUpExtraLayers();
      viewer.refresh(branch.layers);
    });

    view.addEventListener('remark-added', async () => {
      console.log('-> A remark had been added');
      // if (editing.alertLayerName === 'Remarques') {
      //   const layerAlert = viewer.view.getLayerById(editing.alertLayerName);
      if (branch.alert.layerName === 'Remarques') {
        const layerAlert = viewer.view.getLayerById(branch.alert.layerName);
        await layerAlert.whenReady;
        branch.alert.featureCollection = await layerAlert.source.loadData(undefined, layerAlert);
        // const featureCollection = branch.alert.featureCollection.features;
        const alertFC = branch.alert.featureCollection;

        branch.alert.nbValidated = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status === true,
        ).length;
        branch.alert.nbChecked = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status !== null,
        ).length;
        branch.alert.nbTotal = alertFC.features[0].geometries.length;
        branch.alert.progress = `${branch.alert.nbChecked}/${branch.alert.nbTotal} (${branch.alert.nbValidated} validés)`;

        if (branch.alert.nbTotal === 1) {
          // branch.alert.featureIndex = 0;
          branch.alert.changeFeature(0, { centerOnFeature: true });
          // editing.centerOnAlertFeature();
          controllers.setAlertCtr('Remarques');
        }
        // branch.alert.validated = editing.featureSelectedGeom.properties.status;
        // controllers.validated.updateDisplay();
        // branch.alert.comment = editing.featureSelectedGeom.properties.comment;
        // controllers.comment.updateDisplay();
      }
    });

    view.addEventListener('remark-deleted', async () => {
      console.log('-> A remark had been deleted');
      // const layerAlert = viewer.view.getLayerById(editing.alertLayerName);
      const layerAlert = viewer.view.getLayerById(branch.alert.layerName);
      await layerAlert.whenReady;
      branch.alert.featureCollection = await layerAlert.source.loadData(undefined, layerAlert);
      // const featureCollection = branch.alert.featureCollection.features;
      const alertFC = branch.alert.featureCollection;

      if (alertFC.features.length > 0) {
        branch.alert.nbValidated = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status === true,
        ).length;
        branch.alert.nbChecked = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status !== null,
        ).length;
        branch.alert.nbTotal = alertFC.features[0].geometries.length;
        branch.alert.progress = `${branch.alert.nbChecked}/${branch.alert.nbTotal} (${branch.alert.nbValidated} validés)`;

        branch.alert.selectPrevious({ centerOnFeature: true });
        // branch.alert.centerOnAlertFeature();

        // branch.alert.validated = editing.featureSelectedGeom.properties.status;
        // controllers.validated.updateDisplay();
        // branch.alert.comment = editing.featureSelectedGeom.properties.comment;
        // controllers.comment.updateDisplay();
      } else {
        // controllers.hide(['progress', 'id', 'validated', 'unchecked', 'remark', 'delRemark'])
        branch.alert.featureIndex = null;
        controllers.setAlertCtr(' -');
        viewer.view.removeLayer('selectedFeature');
      }
    });

    view.addEventListener('alert-selected', (ev) => {
      viewer.highlightSelectedFeature(branch.alert);

      if (ev.option.centerOnFeature) {
        viewer.centerCamera(ev.featureCenter);
      }

      const featureSelectedGeom = branch.alert.featureCollection.features[0]
        .geometries[branch.alert.featureIndex];

      branch.alert.id = branch.alert.featureIndex;
      controllers.id.updateDisplay();
      branch.alert.validated = featureSelectedGeom.properties.status;
      controllers.validated.updateDisplay();
      branch.alert.comment = featureSelectedGeom.properties.comment;
    });

    view.addEventListener('error', (ev) => {
      // eslint-disable-next-line no-alert
      window.alert(ev.msg instanceof Array ? ev.msg.join('') : ev.msg);
    });

    viewerDiv.addEventListener('mousemove', (ev) => {
      ev.preventDefault();
      editing.mousemove(ev);
      return false;
    }, false);

    viewerDiv.addEventListener('click', (ev) => {
      ev.preventDefault();
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
        viewer.centerCamera(coords);
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
      viewer.centerCamera();
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
      const urlSplit = newApiUrl.split('/')[2].split(':');
      window.location.assign(`${window.location.href.split('?')[0]}?serverapi=${urlSplit[0]}&portapi=${urlSplit[1]}`);
    } else {
      window.alert(err);
    }
    /* eslint-enable no-alert */
  }
}
main();
