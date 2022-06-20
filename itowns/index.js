/* eslint-disable no-console */
/* global setupLoadingScreen */
import * as itowns from 'itowns';
import Viewer from './Viewer';
import Editing from './Editing';
import Branch from './Branch';
import Controller from './Controller';
import Menu from './Menu';

// Global itowns pour setupLoadingScreen -> peut être améliorer
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

function createCacheDialog(listCaches) {
  const dial = document.getElementById('dialogCaches');
  const sel = document.getElementById('dialogCachesSelect');
  listCaches.forEach((c) => {
    const opt = document.createElement('option');
    opt.innerText = c;
    sel.appendChild(opt);
  });

  dial.addEventListener('close', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('namecache', sel.value);
    window.location.href = url.href;
  });

  dial.showModal();
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

    const listCaches = [];
    Object.keys(getCaches).forEach((key) => {
      listCaches.push(getCaches[key].name);
    });

    const [activeCache] = getCaches.filter((cache) => cache.name === nameCache);

    if (activeCache === undefined) {
      createCacheDialog(listCaches);
      return;
    }

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

    overviews.with_rgb = true;
    overviews.with_ir = true;
    const tabOpi = Object.keys(overviews.list_OPI);
    if (tabOpi.length > 0) {
      overviews.with_rgb = overviews.list_OPI[tabOpi[0]].with_rgb;
      overviews.with_ir = overviews.list_OPI[tabOpi[0]].with_ir;
    }
    if (overviews.with_rgb) {
      viewer.view.styles = overviews.with_ir ? ['RVB', 'IRC', 'IR'] : ['RVB'];
    } else {
      viewer.view.styles = ['IR'];
    }
    [viewer.view.style] = viewer.view.styles;
    viewer.view.Opi = { style: viewer.view.styles[0] };

    setupLoadingScreen(viewerDiv, viewer.view);
    // FeatureToolTip.init(viewerDiv, viewer.view);

    viewer.view.isDebugMode = true;

    viewer.menuGlobe = new Menu(document.getElementById('menuDiv'), viewer.view, viewer.shortCuts);

    // viewer.menuGlobe = new GuiTools('menuDiv', viewer.view);
    // viewer.menuGlobe.gui.width = 300;

    // viewer.menuGlobe.colorGui.show();
    // viewer.menuGlobe.colorGui.open();
    // viewer.menuGlobe.vectorGui = viewer.menuGlobe.gui.addFolder('Extra Layers [v]');
    // viewer.menuGlobe.vectorGui.domElement.id = 'extraLayers';
    // viewer.menuGlobe.vectorGui.open();

    const branch = new Branch(apiUrl, viewer);
    const editing = new Editing(branch, apiUrl);

    const controllers = new Controller(viewer.menuGlobe, editing);

    // const branch = new Branch(apiUrl, viewer);
    branch.list = await getBranches;

    [branch.active] = branch.list;

    await branch.setLayers();
    viewer.refresh(branch.layers);

    // const editing = new Editing(branch, apiUrl);

    // const controllers = new Controller(viewer.menuGlobe, editing);

    // Gestion branche
    controllers.branchName = branch.active.name;
    controllers.branch = viewer.menuGlobe.gui.add(controllers, 'branchName', branch.list.map((elem) => elem.name)).name('Active branch');
    controllers.branch.onChange((name) => {
      document.activeElement.blur();
      console.log('choosed branch: ', name);
      branch.changeBranch(name);
    });
    controllers.createBranch = viewer.menuGlobe.gui.add(branch, 'createBranch').name('Add new branch');

    // Selection OPI
    controllers.select = viewer.menuGlobe.gui.add(editing, 'select').name('Select an OPI [s]');
    editing.opiName = 'none';
    controllers.opiName = viewer.menuGlobe.gui.add(editing, 'opiName').name('OPI selected');
    controllers.opiName.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Coord
    editing.coord = `${viewer.xcenter.toFixed(2)},${viewer.ycenter.toFixed(2)}`;
    controllers.coord = viewer.menuGlobe.gui.add(editing, 'coord').name('Coordinates');
    controllers.coord.listen();

    // Saisie
    controllers.polygon = viewer.menuGlobe.gui.add(editing, 'polygon').name('Start polygon [p]');
    controllers.undo = viewer.menuGlobe.gui.add(editing, 'undo').name('undo [CTRL+Z]');
    controllers.redo = viewer.menuGlobe.gui.add(editing, 'redo').name('redo [CTRL+Y]');
    controllers.clear = viewer.menuGlobe.gui.add(editing, 'clear');
    // controllers.hide(['polygon', 'undo', 'redo', 'clear']);

    // Message
    viewer.message = '';
    controllers.message = viewer.menuGlobe.gui.add(viewer, 'message').name('Message');
    controllers.message.listen().domElement.parentElement.style.pointerEvents = 'none';

    // Couche d'alertes
    editing.alert = '-';
    editing.alertLayerName = '-';
    controllers.alert = viewer.menuGlobe.gui.add(editing, 'alert', [editing.alert, ...branch.vectorList.map((elem) => elem.name)]).name('Alerts Layer');
    controllers.alert.onChange(async (layerName) => {
      document.activeElement.blur();

      editing.featureIndex = null;
      editing.nbChecked = 0;
      editing.nbTotal = 0;
      editing.nbValidated = 0;
      if (editing.alertLayerName !== '-') viewer.view.getLayerById(editing.alertLayerName).isAlert = false;

      controllers.resetAlerts();

      if (layerName !== '-') {
        editing.alertLayerName = layerName;

        const layerAlert = viewer.view.getLayerById(layerName);
        layerAlert.isAlert = true;
        editing.alertFC = await layerAlert.source.loadData(undefined, layerAlert);

        if (editing.alertFC.features.length > 0) {
          editing.nbValidated = editing.alertFC.features[0].geometries.filter(
            (elem) => elem.properties.status === true,
          ).length;
          editing.nbChecked = editing.alertFC.features[0].geometries.filter(
            (elem) => elem.properties.status !== null,
          ).length;
          editing.nbTotal = editing.alertFC.features[0].geometries.length;
          editing.progress = `${editing.nbChecked}/${editing.nbTotal} (${editing.nbValidated} validés)`;

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

          editing.comment = editing.featureSelectedGeom.properties.comment;
          // controllers.comment.updateDisplay();
        }
      }

      viewer.refresh(branch.layers);
      controllers.setAlertCtr(editing.nbTotal === 0 ? '-' : layerName);
    });
    editing.id = '';
    controllers.id = viewer.menuGlobe.gui.add(editing, 'id').name('Alert id');
    controllers.id.onChange(() => {
      console.log("saisie d'une id");
      editing.currentStatus = editing.STATUS.WRITING;
    });
    controllers.id.onFinishChange((value) => {
      const newId = parseInt(value, 10);
      console.log('Nouvelle id : ', newId);
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
    // controllers.hide('id');

    editing.progress = '';
    controllers.progress = viewer.menuGlobe.gui.add(editing, 'progress').name('Progress');
    controllers.progress.listen().domElement.parentElement.style.pointerEvents = 'none';
    // controllers.hide('progress');

    controllers.unchecked = viewer.menuGlobe.gui.add(editing, 'unchecked').name('Mark as unchecked');
    // controllers.hide('unchecked');

    editing.validated = false;
    controllers.validated = viewer.menuGlobe.gui.add(editing, 'validated').name('Validated [c]');
    controllers.validated.domElement.id = 'validatedAlert';
    controllers.validated.onChange(async (value) => {
      console.log('change status', value);
      const idFeature = editing.featureSelectedGeom.properties.id;
      const res = await fetch(`${apiUrl}/vector/${idFeature}?status=${value}`,
        {
          method: 'PUT',
        });
      if (res.status === 200) {
        // viewer.refresh(branch.layers);
        viewer.refresh([editing.alertLayerName]);
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
    // controllers.hide('validated');

    editing.comment = '';
    controllers.comment = viewer.menuGlobe.gui.add(editing, 'comment').name('comment');
    controllers.comment.listen().domElement.parentElement.style.pointerEvents = 'none';
    // controllers.hide('comment');

    // Remarques
    controllers.addRemark = viewer.menuGlobe.gui.add(editing, 'addRemark').name('Add remark [a]');
    controllers.delRemark = viewer.menuGlobe.gui.add(editing, 'delRemark').name('Delete remark [d]');
    // controllers.hide('delRemark');

    controllers.setPatchCtr('orig');
    controllers.setAlertCtr('-');

    // editing controllers
    editing.controllers = {
      select: controllers.select,
      opiName: controllers.opiName,
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
      await branch.saveLayer(event.name, event.data, event.style);
      controllers.refreshDropBox('alert', ['-', ...branch.vectorList.map((elem) => elem.name)]);
    });

    view.addEventListener('vectorLayer-removed', (event) => {
      branch.deleteLayer(event.layerId, event.layerName)
        .then(() => {
          console.log(`-> Vector '${event.layerName} (id: ${event.layerId}) had been deleted`);
          controllers.refreshDropBox('alert', ['-', ...branch.vectorList.map((elem) => elem.name)]);
        })
        .catch((error) => {
          view.dispatchEvent({
            type: 'error',
            error,
          });
        });
    });

    view.addEventListener('branch-created', (newBranch) => {
      console.log(`-> New branch created (name: '${newBranch.name}', id: ${newBranch.id})`);
      branch.changeBranch(newBranch.name);
      controllers.refreshDropBox('branch', [...branch.list.map((elem) => elem.name)], newBranch.name);
    });

    view.addEventListener('branch-changed', (newBranch) => {
      console.log(`branche changed to '${newBranch.name}'`);
      controllers.setPatchCtr(newBranch.name);
      controllers.refreshDropBox('alert', ['-', ...branch.vectorList.map((elem) => elem.name)], '-');
      controllers.setAlertCtr('-');
      controllers.resetAlerts();
      viewer.removeExtraLayers(viewer.menuGlobe);
      viewer.view.changeBranch(newBranch.id, apiUrl);
      viewer.refresh(branch.layers);
    });

    view.addEventListener('remark-added', async () => {
      console.log('-> A remark had been added');
      if (editing.alertLayerName === 'Remarques') {
        const layerAlert = viewer.view.getLayerById('Remarques');
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

        if (editing.nbTotal === 1) {
          editing.featureIndex = 0;
          editing.centerOnAlertFeature();
        }
        editing.validated = editing.featureSelectedGeom.properties.status;
        controllers.validated.updateDisplay();
        editing.comment = editing.featureSelectedGeom.properties.comment;
        // controllers.comment.updateDisplay();

        controllers.setAlertCtr('Remarques');
      }
    });

    view.addEventListener('remark-deleted', async () => {
      console.log('-> A remark had been deleted');
      const layerAlert = viewer.view.getLayerById(editing.alertLayerName);
      await layerAlert.whenReady;
      editing.alertFC = await layerAlert.source.loadData(undefined, layerAlert);

      if (editing.alertFC.features.length > 0) {
        editing.nbValidated = editing.alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status === true,
        ).length;
        editing.nbChecked = editing.alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status !== null,
        ).length;
        editing.nbTotal = editing.alertFC.features[0].geometries.length;
        editing.progress = `${editing.nbChecked}/${editing.nbTotal} (${editing.nbValidated} validés)`;
        editing.featureIndex -= 1;
        if (editing.featureIndex === -1) {
          editing.featureIndex = editing.alertFC.features[0].geometries.length - 1;
        }

        if (editing.nbTotal === 1) {
          editing.featureIndex = 0;
          editing.centerOnAlertFeature();
        }
        editing.validated = editing.featureSelectedGeom.properties.status;
        controllers.validated.updateDisplay();
        editing.comment = editing.featureSelectedGeom.properties.comment;
        // controllers.comment.updateDisplay();
      } else {
        controllers.setAlertCtr('-');
        view.removeLayer('selectedFeature');
      }
    });

    view.addEventListener('error', (ev) => {
      // eslint-disable-next-line no-alert
      console.log(ev.error instanceof Array ? ev.error.map((error) => error.message).join('') : ev.error.message);
      window.alert(ev.error instanceof Array ? ev.error.join('') : ev.error);
    });

    viewerDiv.addEventListener('mousemove', (ev) => {
      ev.preventDefault();
      editing.mousemove(ev);
      return false;
    }, false);
    viewerDiv.addEventListener('click', async (ev) => {
      ev.preventDefault();

      if (editing.alertLayerName !== '-') {
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
          editing.comment = features[layerTest.id][0].geometry.properties.comment;
          // controllers.comment.updateDisplay();

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
      editing.currentStatus = editing.STATUS.WRITING;
      if (!checkCoordString(editing.coord)) {
        viewer.message = 'Coordonnees non valides';
      } else {
        viewer.message = '';
      }
    });

    controllers.coord.onFinishChange(() => {
      const coords = checkCoordString(editing.coord);
      if (coords) {
        viewer.centerCamera(coords[0], coords[1]);
      }
      editing.currentStatus = editing.STATUS.RAS;
      viewer.message = '';
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

    // disable itowns shortcuts because of conflicts with endogenous shortcuts
    /* eslint-disable-next-line no-underscore-dangle */
    view.domElement.removeEventListener('keydown', view.controls._handlerOnKeyDown, false);

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
