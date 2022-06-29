/* eslint-disable no-console */
/* global setupLoadingScreen */
import * as itowns from 'itowns';
import Viewer from './Viewer';
import Editing from './Editing';
import Alert from './Alert';
import Branch from './Branch';
import Controller from './Controller';
import Menu from './Menu';
import API from './Api';

// Global itowns pour setupLoadingScreen -> peut être améliorer
global.itowns = itowns;

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

  itowns.Fetcher.json(`${apiUrl}/version`)
    .then((obj) => {
      document.getElementById('spAPIVersion_val').innerText = obj.version_git;
    })
    .catch(() => {
      document.getElementById('spAPIVersion_val').innerText = 'unknown';
    });

  try {
    const getCaches = await itowns.Fetcher.json(`${apiUrl}/caches`);
    if (getCaches.length === 0) throw new Error('Pas de cache en base');

    const listCaches = getCaches.map((elem) => elem.name);

    const [activeCache] = getCaches.filter((cache) => cache.name === nameCache);

    if (activeCache === undefined) {
      createCacheDialog(listCaches);
      return;
    }

    console.log(activeCache);
    const api = new API(apiUrl, activeCache.id);

    const getOverviews = itowns.Fetcher.json(`${apiUrl}/json/overviews?cachePath=${activeCache.path}`);
    const getBranches = itowns.Fetcher.json(`${apiUrl}/branches?idCache=${activeCache.id}`);

    const viewerDiv = document.getElementById('viewerDiv');
    const viewer = new Viewer(viewerDiv);
    viewer.api = api;

    const overviews = await getOverviews;

    viewer.createView(overviews, activeCache.id);
    viewer.updateScaleWidget();

    const { view } = viewer;

    setupLoadingScreen(viewerDiv, view);
    // FeatureToolTip.init(viewerDiv, viewer.view);

    // view.isDebugMode = true;

    const menu = new Menu(document.getElementById('menuDiv'), viewer, viewer.shortCuts);

    const alert = new Alert(viewer);
    const branch = new Branch(viewer, alert);
    const editing = new Editing(branch);

    const controllers = new Controller(menu);

    // const branch = new Branch(apiUrl, viewer);
    branch.list = await getBranches;
    [branch.active] = branch.list;

    await branch.setLayers();
    view.refresh(branch.layers);

    // Gestion branche
    menu.add({ branchName: branch.active.name }, 'branchName', branch.list.map((elem) => elem.name))
      .name('Active branch')
      .onChange((name) => {
        document.activeElement.blur();
        branch.changeBranch(name);
      });
    menu.add(branch, 'createBranch')
      .name('Add new branch');

    // Selection OPI
    menu.add(editing, 'select').name('Select an OPI [s]');
    menu.add(editing, 'opiName')
      .name('OPI selected').listen()
      .onChange((name) => {
        console.log('opi selected: ', name);
      })
      .domElement.parentElement.style.pointerEvents = 'none';
    menu.add(editing, 'opiDate')
      .name('Date').listen()
      .domElement.parentElement.style.pointerEvents = 'none';
    menu.add(editing, 'opiTime')
      .name('Time').listen()
      .domElement.parentElement.style.pointerEvents = 'none';

    // Coord
    menu.add(editing, 'coord')
      .name('Coordinates').listen()
      .onChange(() => {
        if (!checkCoordString(editing.coord)) {
          viewer.message = 'Coordonnees non valides';
        } else {
          viewer.message = '';
        }
      })
      .onFinishChange(() => {
        const coords = checkCoordString(editing.coord);
        if (coords) {
          viewer.centerCameraOn(coords[0], coords[1]);
        }
        editing.currentStatus = editing.STATUS.RAS;
        viewer.message = '';
      })
      .domElement.addEventListener('click', () => {
        editing.currentStatus = editing.STATUS.WRITING;
      });

    // Saisie
    menu.add(editing, 'polygon').name('Start polygon [p]');
    menu.add(editing, 'undo').name('undo [CTRL+Z]');
    menu.add(editing, 'redo').name('redo [CTRL+Y]');
    menu.add(editing, 'clear');

    // Message
    viewer.message = '';
    menu.add(viewer, 'message')
      .name('Message').listen()
      .domElement.parentElement.style.pointerEvents = 'none';

    // Couche d'alertes
    menu.add({ alert: '-' }, 'alert', [alert.layerName, ...branch.vectorList.map((elem) => elem.name)])
      .name('Alerts Layer')
      .onChange(async (layerName) => {
        document.activeElement.blur();
        await alert.changeLayer(layerName);
        controllers.setAlertCtr(alert.nbTotal === 0 ? '-' : layerName);
      });
    menu.add(alert, 'id')
      .name('Alert id').listen()
      .onFinishChange((value) => {
        const newId = parseInt(value, 10);
        console.log('Nouvelle id : ', newId);
        editing.currentStatus = editing.STATUS.RAS;
        if (newId >= 0 && newId < alert.nbTotal) {
          alert.changeFeature(newId, { centerOnFeature: true });
        } else {
          viewer.message = 'id non valide';
          alert.id = alert.featureIndex;
        }
      })
      .domElement.addEventListener('click', () => {
        editing.currentStatus = editing.STATUS.WRITING;
      });

    menu.add(alert, 'progress')
      .name('Progress').listen()
      .domElement.parentElement.style.pointerEvents = 'none';

    menu.add(alert, 'uncheck').name('Mark as unchecked');

    menu.add(alert, 'validated')
      .name('Validated [c]').listen()
      .onChange((value) => { alert.setValidation(value); })
      .domElement.id = 'validatedAlert';

    menu.add(alert, 'comment')
      .name('comment').listen()
      .domElement.parentElement.style.pointerEvents = 'none';

    // Remarques
    menu.add(editing, 'addRemark').name('Add remark [a]');
    menu.add(editing, 'delRemark').name('Delete remark [d]');

    // visibilty of controllers
    controllers.setPatchCtr(branch.active.name);// branch.active.name = 'orig'
    controllers.setAlertCtr(alert.layerName);// alert.layerName = '-'
    controllers.setOpiCtr(editing.opiName);// editing.opiName = 'none'

    // editing controllers
    // editing.controllers = {
    //   select: controllers.select,
    //   opiName: controllers.opiName,
    //   polygon: controllers.polygon,
    //   addRemark: controllers.addRemark,
    // };
    editing.controllers = controllers;
    viewerDiv.focus();

    // Listen to drag and drop actions
    document.addEventListener('dragenter', (e) => { e.preventDefault(); }, false);
    document.addEventListener('dragover', (e) => { e.preventDefault(); }, false);
    document.addEventListener('dragleave', (e) => { e.preventDefault(); }, false);
    document.addEventListener('drop', (e) => { viewer.addDnDFiles(e, e.dataTransfer.files); }, false);
    document.addEventListener('paste', (e) => { viewer.addDnDFiles(e, e.clipboardData.files); }, false);

    // view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, () => {
    //   console.info('-> View initialized');
    //   // viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
    //   viewer.updateScaleWidget();
    // });
    view.addEventListener(itowns.PLANAR_CONTROL_EVENT.MOVED, () => {
      console.info('-> View moved');
      if (view.controls.state === -1) {
        // viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
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
            error,
          });
        });
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

    view.addEventListener('opi-selected', (newOpi) => {
      console.log(`-> Opi '${newOpi.name}' selected.`);
      if (newOpi.name === 'none') {
        view.getLayerById('Opi').visible = false;
        view.notifyChange(view.getLayerById('Opi'), true);
      } else {
        view.refresh('Opi');
      }
      controllers.setOpiCtr(newOpi.name);
    });

    view.addEventListener('branch-created', (newBranch) => {
      console.log(`-> New branch created (name: '${newBranch.name}', id: ${newBranch.id})`);
      branch.changeBranch(newBranch.name);
      controllers.refreshDropBox('branch', [...branch.list.map((elem) => elem.name)], newBranch.name);
    });

    view.addEventListener('branch-changed', (newBranch) => {
      console.log(`branch changed to '${newBranch.name}'`);
      controllers.setPatchCtr(newBranch.name);
      controllers.refreshDropBox('alert', ['-', ...branch.vectorList.map((elem) => elem.name)], '-');
      controllers.setAlertCtr('-');
      viewer.removeExtraLayers();
      viewer.view.changeBranch(newBranch.id);
      view.refresh(branch.layers);
    });

    view.addEventListener('remark-added', async () => {
      console.log('-> A remark had been added');
      if (alert.layerName === 'Remarques') {
        const layerAlert = viewer.view.getLayerById('Remarques');
        await layerAlert.whenReady;
        alert.featureCollection = await layerAlert.source.loadData(undefined, layerAlert);
        const alertFC = alert.featureCollection;

        alert.nbValidated = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status === true,
        ).length;
        alert.nbChecked = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status !== null,
        ).length;
        alert.nbTotal = alertFC.features[0].geometries.length;
        alert.progress = `${alert.nbChecked}/${alert.nbTotal} (${alert.nbValidated} validés)`;

        if (alert.nbTotal === 1) {
          alert.changeFeature(0, { centerOnFeature: true });
          controllers.setAlertCtr('Remarques');
        }
      }
    });

    view.addEventListener('remark-deleted', async () => {
      console.log('-> A remark had been deleted');
      view.refresh(['Remarques']);
      const layerAlert = viewer.view.getLayerById(alert.layerName);
      await layerAlert.whenReady;
      alert.featureCollection = await layerAlert.source.loadData(undefined, layerAlert);
      const alertFC = alert.featureCollection;

      if (alertFC.features.length > 0) {
        alert.nbValidated = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status === true,
        ).length;
        alert.nbChecked = alertFC.features[0].geometries.filter(
          (elem) => elem.properties.status !== null,
        ).length;
        alert.nbTotal = alertFC.features[0].geometries.length;
        alert.progress = `${alert.nbChecked}/${alert.nbTotal} (${alert.nbValidated} validés)`;

        alert.selectPrevious({ centerOnFeature: true, forceRefresh: true });
      } else {
        controllers.setAlertCtr('-');
      }
    });

    view.addEventListener('alert-selected', (ev) => {
      view.refresh([...ev.layersToRefresh]);
      if (ev.option.centerOnFeature) viewer.centerCameraOn(ev.featureCenter);
    });

    view.addEventListener('error', (ev) => {
      console.log(ev.error instanceof Array ? ev.error.map((error) => error.message).join('') : ev.error.message);
      // eslint-disable-next-line no-alert
      window.alert(ev.error instanceof Array ? ev.error.join('') : ev.error);
    });

    viewerDiv.addEventListener('mousemove', (ev) => {
      ev.preventDefault();
      editing.mousemove(ev);
    }, false);

    viewerDiv.addEventListener('click', async (ev) => {
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

    window.addEventListener('keydown', (ev) => {
      editing.keydown(ev);
      return false;
    });
    window.addEventListener('keyup', (ev) => {
      editing.keyup(ev);
      return false;
    });

    document.getElementById('recenterBtn').addEventListener('click', () => {
      viewer.centerCameraOn(viewer.xcenter, viewer.ycenter);
      return false;
    }, false);
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      console.log('Zoom-In');
      if ((view.getPixelsToMeters() / 2) > viewer.resolLvMax) {
        view.camera.camera3D.zoom *= 2;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        // viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
        viewer.updateScaleWidget();
      }
      return false;
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      console.log('Zoom-Out');
      if ((view.getPixelsToMeters() * 2) < viewer.resolLvMin) {
        view.camera.camera3D.zoom *= 0.5;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        // viewer.dezoom = updateScaleWidget(view, viewer.resolution, viewer.maxGraphDezoom);
        viewer.updateScaleWidget();
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
