/* eslint-disable no-console */
/* global setupLoadingScreen, GuiTools */
import * as itowns from 'itowns';
import Vue from './Vue';
import Saisie from './Saisie';
// import DragNDrop from './DragNDrop';

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

  itowns.Fetcher.json(`${apiUrl}/version`).then((obj) => {
    document.getElementById('spAPIVersion_val').innerText = obj.version_git;
  }).catch(() => {
    document.getElementById('spAPIVersion_val').innerText = 'unknown';
  });

  const getOverviews = itowns.Fetcher.json(`${apiUrl}/json/overviews`);
  const getVectorList = itowns.Fetcher.json(`${apiUrl}/0/vectors`);
  const getBranches = itowns.Fetcher.json(`${apiUrl}/branches`);

  const viewerDiv = document.getElementById('viewerDiv');
  const vue = new Vue(viewerDiv);
  vue.apiUrl = apiUrl;

  const overviews = await getOverviews;

  vue.createView(overviews);
  setupLoadingScreen(viewerDiv, vue.view);

  vue.view.isDebugMode = true;
  const menuGlobe = new GuiTools('menuDiv', vue.view);
  menuGlobe.gui.width = 300;

  // const opacity = {
  //   ortho: 1,
  //   graph: 1,
  //   contour: 0.5,
  //   opi: 0.5,
  //   patches: 1,
  // };

  const layerTest = {};
  layerTest.ortho = {
    type: 'raster',
    url: `${apiUrl}/0/wmts`,
    crs: vue.crs,
    opacity: 1,
  };
  layerTest.graph = {
    type: 'raster',
    url: `${apiUrl}/0/wmts`,
    crs: vue.crs,
    opacity: 1,
  };
  layerTest.contour = {
    type: 'raster',
    url: `${apiUrl}/0/wmts`,
    crs: vue.crs,
    opacity: 0.5,
  };
  layerTest.opi = {
    type: 'raster',
    url: `${apiUrl}/0/wmts`,
    crs: vue.crs,
    opacity: 0.5,
  };
  layerTest.patches = {
    type: 'vector',
    url: `${apiUrl}/0/patches`,
    crs: vue.crs,
    opacity: 1,
    visible: false,
    style: {
      stroke: {
        color: 'Yellow',
        width: 2,
      },
    },
  };

  vue.drawLayers(layerTest, getVectorList, overviews, menuGlobe, apiUrl);

  try {
    const { view } = vue;

    vue.branches = await getBranches;
    vue.branches.forEach((element) => {
      vue.branchNames.push(element.name);
    });

    const { layer } = vue;
    const { currentBranch } = vue;

    const saisie = new Saisie(vue, layer, apiUrl, currentBranch.id);
    saisie.cliche = 'unknown';
    saisie.message = '';
    saisie.branch = currentBranch.name;
    saisie.branchId = currentBranch.id;
    saisie.coord = `${vue.xcenter.toFixed(2)},${vue.ycenter.toFixed(2)}`;
    saisie.color = [0, 0, 0];
    saisie.controllers = {};
    saisie.controllers.select = menuGlobe.gui.add(saisie, 'select');
    saisie.controllers.cliche = menuGlobe.gui.add(saisie, 'cliche');
    saisie.controllers.cliche.listen().domElement.parentElement.style.pointerEvents = 'none';
    saisie.controllers.coord = menuGlobe.gui.add(saisie, 'coord');
    saisie.controllers.coord.listen();// .domElement.parentElement.style.pointerEvents = 'none';
    saisie.controllers.polygon = menuGlobe.gui.add(saisie, 'polygon');
    saisie.controllers.undo = menuGlobe.gui.add(saisie, 'undo');
    saisie.controllers.redo = menuGlobe.gui.add(saisie, 'redo');
    if (process.env.NODE_ENV === 'development') saisie.controllers.clear = menuGlobe.gui.add(saisie, 'clear');
    saisie.controllers.message = menuGlobe.gui.add(saisie, 'message');
    saisie.controllers.message.listen().domElement.parentElement.style.pointerEvents = 'none';
    saisie.controllers.branch = menuGlobe.gui.add(saisie, 'branch', vue.branchNames);
    saisie.controllers.branch.onChange((value) => {
      console.log('new active branch : ', value);
      vue.branches.forEach((branch) => {
        if (branch.name === value) {
          saisie.branch = value;
          saisie.branchId = branch.id;
          saisie.changeBranchId(saisie.branchId);
        }
      });
    });

    saisie.controllers.createBranch = menuGlobe.gui.add(saisie, 'createBranch');

    viewerDiv.focus();

    // Listen to drag and drop actions
    document.addEventListener('dragenter', (e) => { e.preventDefault(); }, false);
    document.addEventListener('dragover', (e) => { e.preventDefault(); }, false);
    document.addEventListener('dragleave', (e) => { e.preventDefault(); }, false);
    document.addEventListener('drop', (e) => { vue.addDnDFiles(e, e.dataTransfer.files); }, false);
    document.addEventListener('paste', (e) => { vue.addDnDFiles(e, e.clipboardData.files); }, false);

    view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, () => {
      console.info('-> View initialized');
      updateScaleWidget(view, vue.resolution);
    });
    view.addEventListener(itowns.PLANAR_CONTROL_EVENT.MOVED, () => {
      console.info('-> View moved');
      if (view.controls.state === -1) {
        updateScaleWidget(view, vue.resolution);
      }
    });

    viewerDiv.addEventListener('mousemove', (ev) => {
      ev.preventDefault();
      saisie.mousemove(ev);
      return false;
    }, false);
    viewerDiv.addEventListener('click', (ev) => {
      ev.preventDefault();
      saisie.click(ev);
      return false;
    }, false);
    viewerDiv.addEventListener('mousedown', (ev) => {
      if (ev.button === 1) {
        console.log('middle button clicked');
        view.controls.initiateDrag();
        view.controls.updateMouseCursorType();
      }
    });

    saisie.controllers.coord.onChange(() => {
      if (!checkCoordString(saisie.coord)) {
        saisie.message = 'Coordonnees non valides';
      } else {
        saisie.message = '';
      }
      return false;
    });

    saisie.controllers.coord.onFinishChange(() => {
      const coords = checkCoordString(saisie.coord);
      if (coords) {
        itowns.CameraUtils.transformCameraToLookAtTarget(
          view,
          view.camera.camera3D,
          {
            coord: new itowns.Coordinates(vue.crs, coords[0], coords[1]),
            heading: 0,
          },
        );
      }
      saisie.message = '';
      return false;
    });

    window.addEventListener('keydown', (ev) => {
      saisie.keydown(ev);
      return false;
    });
    window.addEventListener('keyup', (ev) => {
      saisie.keyup(ev);
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
          coord: new itowns.Coordinates(vue.crs, vue.xcenter, vue.ycenter),
          heading: 0,
        },
      );
      return false;
    }, false);
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      console.log('Zoom-In');
      if ((view.getPixelsToMeters() / 2) > vue.resolLvMax) {
        view.camera.camera3D.zoom *= 2;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        updateScaleWidget(view, vue.resolution);
      }
      return false;
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      console.log('Zoom-Out');
      if ((view.getPixelsToMeters() * 2) < vue.resolLvMin) {
        view.camera.camera3D.zoom *= 0.5;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        updateScaleWidget(view, vue.resolution);
      }
      return false;
    });

    const helpContent = document.getElementById('help-content');
    helpContent.style.visibility = 'hidden';
    document.getElementById('help').addEventListener('click', () => {
      helpContent.style.visibility = (helpContent.style.visibility === 'hidden') ? 'visible' : 'hidden';
    });
  } catch (err) {
    console.log(`${err.name}: ${err.message}`);
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
