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
function updateScaleWidget(view, resolution) {
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
  if (dezoom >= 32) {
    document.getElementById('spanGraphVisible').innerHTML = '<p style="color:#FF0000";>Graphe Non Visible</p>';
  } else {
    document.getElementById('spanGraphVisible').innerHTML = '<p style="color:#00FF00";>Graphe Visible</p>';
  }
  document.getElementById('spanZoomWidget').innerHTML = dezoom <= 1 ? `zoom: ${1 / dezoom}` : `zoom: 1/${dezoom}`;
  document.getElementById('spanScaleWidget').innerHTML = `${distance.toFixed(2)} ${unit}`;
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

    viewer.createView(overviews, activeCache.id);
    setupLoadingScreen(viewerDiv, viewer.view);

    viewer.view.isDebugMode = true;
    viewer.menuGlobe = new GuiTools('menuDiv', viewer.view);
    viewer.menuGlobe.gui.width = 300;

    // Patch pour ajouter la modification de l'epaisseur des contours dans le menu
    viewer.menuGlobe.addImageryLayerGUI = function addImageryLayerGUI(layer) {
    /* eslint-disable no-param-reassign */
      if (this.colorGui.hasFolder(layer.id)) { return; }
      this.colorGui.show();
      const folder = this.colorGui.addFolder(layer.id);
      folder.add({ visible: layer.visible }, 'visible').onChange(((value) => {
        layer.visible = value;
        this.view.notifyChange(layer);
      }));
      folder.add({ opacity: layer.opacity }, 'opacity').min(0.001).max(1.0).onChange(((value) => {
        layer.opacity = value;
        this.view.notifyChange(layer);
      }));
      folder.add({ frozen: layer.frozen }, 'frozen').onChange(((value) => {
        layer.frozen = value;
        this.view.notifyChange(layer);
      }));
      if (layer.effect_parameter) {
        folder.add({ thickness: layer.effect_parameter }, 'thickness').min(0.5).max(5.0).onChange(((value) => {
          layer.effect_parameter = value;
          this.view.notifyChange(layer);
        }));
      }
    /* eslint-enable no-param-reassign */
    };
    const branch = new Branch(apiUrl, viewer);
    branch.list = await getBranches;

    [branch.active] = branch.list;

    const getVectorList = itowns.Fetcher.json(`${apiUrl}/${branch.active.id}/vectors`);
    branch.vectorList = await getVectorList;

    branch.setLayers();
    viewer.refresh(branch.layers);

    const editing = new Editing(branch, viewer.layer, apiUrl);
    editing.cliche = 'unknown';
    editing.coord = `${viewer.xcenter.toFixed(2)},${viewer.ycenter.toFixed(2)}`;
    editing.color = [0, 0, 0];

    const controllers = new Controller(viewer.menuGlobe, editing);

    controllers.select = viewer.menuGlobe.gui.add(editing, 'select');
    controllers.cliche = viewer.menuGlobe.gui.add(editing, 'cliche');
    controllers.cliche.listen().domElement.parentElement.style.pointerEvents = 'none';
    viewer.message = '';
    controllers.coord = viewer.menuGlobe.gui.add(editing, 'coord');
    controllers.coord.listen();
    controllers.message = viewer.menuGlobe.gui.add(viewer, 'message');
    controllers.message.listen().domElement.parentElement.style.pointerEvents = 'none';
    branch.branch = branch.active.name;
    controllers.branch = viewer.menuGlobe.gui.add(branch, 'branch', branch.list.map((elem) => elem.name));
    controllers.branch.onChange((name) => {
      console.log('choosed branch: ', name);
      branch.active = {
        name,
        id: branch.list.filter((elem) => elem.name === name)[0].id,
      };
      branch.changeBranch();
      controllers.setEditingController(name);
    });
    controllers.createBranch = viewer.menuGlobe.gui.add(branch, 'createBranch');
    editing.controllers = {
      select: controllers.select,
      cliche: controllers.cliche,
      polygon: controllers.polygon,
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
      updateScaleWidget(view, viewer.resolution);
    });
    view.addEventListener(itowns.PLANAR_CONTROL_EVENT.MOVED, () => {
      console.info('-> View moved');
      if (view.controls.state === -1) {
        updateScaleWidget(view, viewer.resolution);
      }
    });

    view.addEventListener('file-dropped', (event) => {
      console.log('-> A file had been dropped');
      branch.saveLayer(event.name, event.data, event.style);
    });

    view.addEventListener('branch-created', () => {
      console.log('-> New branch created');
      controllers.setEditingController();
      controllers.branch = controllers.branch.options(branch.list.map((elem) => elem.name))
        .setValue(branch.active.name);
      controllers.branch.onChange((name) => {
        console.log('choosed branch: ', name);
        branch.active = {
          name,
          id: branch.list.filter((elem) => elem.name === name)[0].id,
        };
        branch.changeBranch();
        controllers.setEditingController(name);
      });
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
        itowns.CameraUtils.transformCameraToLookAtTarget(
          view,
          view.camera.camera3D,
          {
            coord: new itowns.Coordinates(viewer.crs, coords[0], coords[1]),
            heading: 0,
          },
        );
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
    // });

    document.getElementById('recenterBtn').addEventListener('click', () => {
    // bug itowns...
    // itowns.CameraUtils.animateCameraToLookAtTarget( ... )
      itowns.CameraUtils.transformCameraToLookAtTarget(
        view,
        view.camera.camera3D,
        {
          coord: new itowns.Coordinates(viewer.crs, viewer.xcenter, viewer.ycenter),
          heading: 0,
        },
      );
      return false;
    }, false);
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      console.log('Zoom-In');
      if ((view.getPixelsToMeters() / 2) > viewer.resolLvMax) {
        view.camera.camera3D.zoom *= 2;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        updateScaleWidget(view, viewer.resolution);
      }
      return false;
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      console.log('Zoom-Out');
      if ((view.getPixelsToMeters() * 2) < viewer.resolLvMin) {
        view.camera.camera3D.zoom *= 0.5;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        updateScaleWidget(view, viewer.resolution);
      }
      return false;
    });

    const helpContent = document.getElementById('help-content');
    helpContent.style.visibility = 'hidden';
    document.getElementById('help').addEventListener('click', () => {
      helpContent.style.visibility = (helpContent.style.visibility === 'hidden') ? 'visible' : 'hidden';
    });
  } catch (err) {
    console.log(err);
    if (`${err.name}: ${err.message}` === 'TypeError: Failed to fetch') {
      const newApiUrl = window.prompt(`API non accessible à l'adresse renseignée (${apiUrl}). Veuillez entrer une adresse valide :`, apiUrl);
      const apiUrlSplit = newApiUrl.split('/')[2].split(':');
      window.location.assign(`${window.location.href.split('?')[0]}?serverapi=${apiUrlSplit[0]}&portapi=${apiUrlSplit[1]}`);
    } else {
      window.alert(err);
    }
  }
}
main();
