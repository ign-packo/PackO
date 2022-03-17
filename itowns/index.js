/* eslint-disable no-console */
/* global setupLoadingScreen */
import * as itowns from 'itowns';
import Viewer from './Viewer';
import Editing from './Editing';
import Branch from './Branch';
import Controller from './Controller';
import API from './API';
import View from './View';
import Menu from './Menu';

// Global itowns pour setupLoadingScreen -> peut être améliorer
global.itowns = itowns;

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

    const dezoomInitial = 4;// to define

    // const overviews = await getOverviews;
    const view = new View(viewerDiv, await getOverviews, dezoomInitial);
    setupLoadingScreen(viewerDiv, view);

    const menuGlobe = new Menu(document.getElementById('menuDiv'), view);
    const viewer = new Viewer(viewerDiv, view, menuGlobe, api);

    // setupLoadingScreen(viewerDiv, viewer.view);
    // FeatureToolTip.init(viewerDiv, viewer.view);

    // viewer.view.isDebugMode = true;

    const branch = new Branch(viewer, activeCache.id);
    const editing = new Editing(branch);

    const controllers = new Controller(viewer.menuGlobe);

    branch.list = await getBranches;

    [branch.active] = branch.list;

    await branch.setLayers();
    view.refresh(branch.layers);

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
    editing.coord = `${view.x0.toFixed(2)},${view.y0.toFixed(2)}`;
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
    editing.alert = '-';
    controllers.alert = viewer.menuGlobe.gui.add(editing, 'alert', [editing.alert, ...branch.vectorList.map((elem) => elem.name)]).name('Alerts Layer');
    controllers.alert.onChange(async (layerName) => {
      document.activeElement.blur();
      console.log('choosed alert vector layer: ', layerName);
      if (branch.alert.layerName !== '-') viewer.view.getLayerById(branch.alert.layerName).isAlert = false;

      viewer.layersToRefresh = [];
      if (branch.alert.nbTotal > 0 && (branch.alert.layerName !== '-' || layerName === '-')) {
        viewer.layersToRefresh.push(branch.alert.layerName);
      }

      if (layerName !== '-') {
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
        } else {
          branch.alert.nbTotal = 0;
          view.refresh(viewer.layersToRefresh);
        }
      } else {
        branch.alert.reset();
        view.refresh(viewer.layersToRefresh);
      }
      controllers.setAlertCtr(layerName === 'Remarques' && branch.alert.featureCollection.features.length === 0 ? '-' : layerName);
      // view.refresh(viewer.layersToRefresh);
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
    controllers.validated.onChange((value) => { branch.alert.setValidation(value); });

    branch.alert.comment = '';
    controllers.comment = viewer.menuGlobe.gui.add(branch.alert, 'comment').name('Comment');
    controllers.comment.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Remarques
    controllers.addRemark = viewer.menuGlobe.gui.add(editing, 'addRemark').name('Add remark');
    controllers.suppRemark = viewer.menuGlobe.gui.add(editing, 'suppRemark').name('Delete remark');

    controllers.setPatchCtr('orig');
    controllers.setAlertCtr('-');

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

    // const { view } = viewer;
    view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, () => {
      console.info('-> View initialized');
      viewer.updateScaleWidget();
    });
    view.addEventListener(itowns.PLANAR_CONTROL_EVENT.MOVED, () => {
      console.info('-> View moved');
      if (view.controls.state === -1) {
        viewer.updateScaleWidget();
      }
    });

    view.addEventListener('file-dropped', (ev) => {
      console.log(`-> A file (${ev.name}) had been dropped`);
      branch.saveLayer(ev.name, ev.data, ev.style)
        .then(() => {
          view.refresh(branch.layers.filter((layer) => layer.name === ev.name));
          controllers.refreshDropBox('alert', ['-', ...branch.vectorList.map((elem) => elem.name)]);
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

          controllers.refreshDropBox('alert', ['-', ...branch.vectorList.map((elem) => elem.name)]);
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
      controllers.refreshDropBox('activeBranch', [...branch.list.map((elem) => elem.name)], Object.keys(branch.list).length - 1);
    });

    view.addEventListener('branch-changed', (newBranch) => {
      console.log(`branche changed to '${newBranch.name}'`);
      controllers.setPatchCtr(newBranch.name);
      controllers.refreshDropBox('alert', ['-', ...branch.vectorList.map((elem) => elem.name)], 0);
      // controllers.refreshAlertCtr();
      controllers.setAlertCtr('-');
      // branch.resetAlert();
      view.cleanUpExtraLayers(menuGlobe);
      view.refresh(branch.layers);
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
        controllers.setAlertCtr('-');
      }
    });

    view.addEventListener('alert-selected', (ev) => {
      const layerAlert = viewer.view.getLayerById(branch.alert.layerName);
      layerAlert.idSelected = ev.properties.id;

      // console.log(layerAlert.idSelected)

      view.refresh([...viewer.layersToRefresh, branch.alert.layerName]);
      viewer.layersToRefresh = [];

      if (ev.option.centerOnFeature) {
        viewer.centerCameraOn(ev.featureCenter);
      }

      branch.alert.id = branch.alert.featureIndex;
      controllers.id.updateDisplay();
      branch.alert.validated = ev.properties.status;
      controllers.validated.updateDisplay();
      branch.alert.comment = ev.properties.comment;
    });

    view.addEventListener('error', (ev) => {
      // eslint-disable-next-line no-alert
      window.alert(ev.msg instanceof Array ? ev.msg.join('') : ev.msg);
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
        viewer.centerCameraOn(coords);
      }
      editing.message = '';
      return false;
    });

    window.addEventListener('keydown', (ev) => {
      editing.keydown(ev);
    });
    window.addEventListener('keyup', (ev) => {
      editing.keyup(ev);
    });

    viewerDiv.addEventListener('mousemove', (ev) => {
      ev.preventDefault();
      editing.mousemove(ev);
    }, false);

    viewerDiv.addEventListener('click', (ev) => {
      ev.preventDefault();
      editing.click(ev);
    }, false);

    viewerDiv.addEventListener('mousedown', (ev) => {
      if (ev.button === 1) {
        console.log('middle button clicked');
        view.controls.initiateDrag();
        view.controls.updateMouseCursorType();
      }
    });

    document.getElementById('recenterBtn').addEventListener('click', () => {
      viewer.centerCameraOn();
    }, false);
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      viewer.zoomIn();
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      viewer.zoomOut();
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
