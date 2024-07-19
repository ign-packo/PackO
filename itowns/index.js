/* eslint-disable no-console */
/* global setupLoadingScreen */
import * as itowns from 'itowns';
import Viewer from './Viewer';
import Editing from './Editing';
import Alert from './Alert';
import Branch from './Branch';
import Menu from './Menu';
import API from './Api';

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
    const api = new API(apiUrl, activeCache.id);

    const getOverviews = itowns.Fetcher.json(`${apiUrl}/json/overviews?cachePath=${activeCache.path}`);
    const getBranches = itowns.Fetcher.json(`${apiUrl}/branches?idCache=${activeCache.id}`);

    const viewerDiv = document.getElementById('viewerDiv');
    const viewer = new Viewer(viewerDiv);
    viewer.api = api;

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

    // TO be modified in link with cache => add a property overview.style
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

    const menu = new Menu(document.getElementById('menuDiv'), viewer, viewer.shortCuts);

    const alert = new Alert(viewer);
    const branch = new Branch(viewer, alert);
    const editing = new Editing(branch, menu);

    branch.list = await getBranches;

    [branch.active] = branch.list;

    await branch.setLayers();
    viewer.refresh(branch.layers);

    // Gestion branche
    menu.add({ activeBranch: branch.active.name }, 'activeBranch', branch.list.map((elem) => elem.name))
      .name('Active branch')
      .onChange((name) => {
        document.activeElement.blur();
        branch.changeBranch(name);
      });
    menu.add(branch, 'createBranch')
      .name('Add new branch');

    // Selection OPI ref
    menu.add(editing, 'selectRefOpi').name('Select ref OPI [s]');
    menu.add(editing, 'opiRefName')
      .name('Selected Ref OPI').listen()
      .onChange((name) => {
        console.log('Selected ref Opi : ', name);
      })
      .domElement.parentElement.style.pointerEvents = 'none';
    menu.add(editing, 'opiRefDate')
      .name('Date').listen()
      .domElement.parentElement.style.pointerEvents = 'none';
    menu.add(editing, 'opiRefTime')
      .name('Time').listen()
      .domElement.parentElement.style.pointerEvents = 'none';

    // Selection OPI sec
    menu.add(editing, 'selectSecOpi').name('Select sec OPI [w]');
    menu.add(editing, 'opiSecName')
      .name('Selected Sec OPI').listen()
      .onChange((name) => {
        console.log('Selected sec Opi : ', name);
      })
      .domElement.parentElement.style.pointerEvents = 'none';
    menu.add(editing, 'opiSecDate')
      .name('Date').listen()
      .domElement.parentElement.style.pointerEvents = 'none';
    menu.add(editing, 'opiSecTime')
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
    menu.add(editing, 'polygon').name('Start patch [p]');
    menu.add(editing, 'polygon4Auto').name('Start patch auto [t]');
    menu.add(editing, 'undo').name('undo [CTRL+Z]');
    menu.add(editing, 'redo').name('redo [CTRL+Y]');
    menu.add(editing, 'clear')
      .domElement.parentElement.parentElement.style.display = 'none';

    // Message
    viewer.message = '';
    menu.add(viewer, 'message')
      .name('Message').listen()
      .domElement.parentElement.style.pointerEvents = 'none';

    // Couche d'alertes
    menu.add({ alertLayer: '-' }, 'alertLayer', [alert.layerName, ...branch.vectorList.map((elem) => elem.name)])
      .name('Alerts Layer')
      .onChange(async (layerName) => {
        document.activeElement.blur();
        await alert.changeLayer(layerName);
        menu.setAlertCtr(alert.nbTotal === 0 ? '-' : layerName);
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

    // visibility of controllers
    menu.setPatchCtr(branch.active.name);// branch.active.name = 'orig'
    menu.setAlertCtr(alert.layerName);// alert.layerName = '-'
    menu.setOpiRefCtr(editing.opiRefName);// editing.opiRefName = 'none'
    menu.setOpiSecCtr(editing.opiRefName);// editing.opiRefName = 'none'

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
          view.refresh(branch.layers.filter((layer) => layer.name === ev.name));
          menu.refreshDropBox('alertLayer', ['-', ...branch.vectorList.map((elem) => elem.name)]);
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
          menu.refreshDropBox('alertLayer', ['-', ...branch.vectorList.map((elem) => elem.name)]);
        })
        .catch((error) => {
          view.dispatchEvent({
            type: 'error',
            error,
          });
        });
    });

    view.addEventListener('oref-selected', (newOpi) => {
      console.log(`-> Ref Opi '${newOpi.name}' selected.`);
      if (newOpi.name === 'none') {
        view.getLayerById('Opi').visible = false;
        view.notifyChange(view.getLayerById('Opi'), true);
      } else {
        viewer.refresh('Opi');
      }
      menu.setOpiRefCtr(newOpi.name);
    });

    view.addEventListener('osec-selected', (newOpi) => {
      console.log(`-> Sec Opi '${newOpi.name}' selected.`);
      /* if (newOpi.name === 'none') {
        view.getLayerById('Opi').visible = false;
        view.notifyChange(view.getLayerById('Opi'), true);
      } else {
        viewer.refresh('Opi');
      } */
      menu.setOpiSecCtr(newOpi.name);
    });

    view.addEventListener('branch-created', (newBranch) => {
      console.log(`-> New branch created (name: '${newBranch.name}', id: ${newBranch.id})`);
      branch.changeBranch(newBranch.name);
      menu.refreshDropBox('activeBranch', [...branch.list.map((elem) => elem.name)], newBranch.name);
    });

    view.addEventListener('branch-changed', (newBranch) => {
      console.log(`branch changed to '${newBranch.name}'`);
      menu.setPatchCtr(newBranch.name);
      menu.refreshDropBox('alertLayer', ['-', ...branch.vectorList.map((elem) => elem.name)], '-');
      menu.setAlertCtr('-');
      viewer.removeExtraLayers();
      viewer.view.changeBranch(newBranch.id);
      viewer.refresh(branch.layers);
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
          alert.changeFeature(0, { centerOnFeature: true, forceRefresh: true });
          menu.setAlertCtr('Remarques');
        }
      }
    });

    view.addEventListener('remark-deleted', async () => {
      console.log('-> A remark had been deleted');
      viewer.refresh(['Remarques']);
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
        alert.nbTotal = 0;
        menu.setAlertCtr('-');
      }
    });

    view.addEventListener('alert-selected', (ev) => {
      viewer.refresh([...ev.layersToRefresh]);
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
