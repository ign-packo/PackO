/* eslint-disable no-console */
/* global setupLoadingScreen, GuiTools */
import * as itowns from 'itowns';
import Saisie from './Saisie';

// Global itowns pour GuiTools -> peut être améliorer
global.itowns = itowns;

console.log(`Client in '${process.env.NODE_ENV}' mode.`);

const urlParams = new URLSearchParams(window.location.search);
const serverAPI = urlParams.get('serverapi') ? urlParams.get('serverapi') : 'localhost';
const portAPI = urlParams.get('portapi') ? urlParams.get('portapi') : 8081;
console.log('serverAPI:', serverAPI, 'portAPI:', portAPI);

const apiUrl = `http://${serverAPI}:${portAPI}`;

itowns.Fetcher.json(`${apiUrl}/version`).then((obj) => {
  document.getElementById('spAPIVersion_val').innerText = obj.version_git;
})
  .catch(() => {
    document.getElementById('spAPIVersion_val').innerText = 'unknown';
  });

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

itowns.Fetcher.json(`${apiUrl}/json/overviews`).then((json) => {
  const overviews = json;

  // Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
  const crs = `${overviews.crs.type}:${overviews.crs.code}`;
  if (crs !== 'EPSG:4326' && overviews.crs.proj4Definition) {
    itowns.CRS.defs(crs, overviews.crs.proj4Definition);
  } else {
    throw new Error('EPSG proj4.defs not defined in overviews.json');
  }

  // limite du crs
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;

  // limite du dataSet
  const xmin = overviews.dataSet.boundingBox.LowerCorner[0];
  const xmax = overviews.dataSet.boundingBox.UpperCorner[0];
  const ymin = overviews.dataSet.boundingBox.LowerCorner[1];
  const ymax = overviews.dataSet.boundingBox.UpperCorner[1];

  // Define geographic extent of level 0 : CRS, min/max X, min/max Y
  const resolutionLv0 = overviews.resolution * 2 ** overviews.level.max;
  const extent = new itowns.Extent(
    crs,
    xOrigin, xOrigin + (overviews.tileSize.width * resolutionLv0),
    yOrigin - (overviews.tileSize.height * resolutionLv0), yOrigin,
  );

  const dezoomInitial = 4;
  const resolInit = overviews.resolution * 2 ** dezoomInitial;
  const xcenter = (xmin + xmax) * 0.5;
  const ycenter = (ymin + ymax) * 0.5;

  viewerDiv.height = viewerDiv.clientHeight;
  viewerDiv.width = viewerDiv.clientWidth;
  const placement = new itowns.Extent(
    crs,
    xcenter - viewerDiv.width * resolInit * 0.5, xcenter + viewerDiv.width * resolInit * 0.5,
    ycenter - viewerDiv.height * resolInit * 0.5, ycenter + viewerDiv.height * resolInit * 0.5,
  );

  const resolLvMin = overviews.resolution * 2 ** (overviews.level.max - overviews.level.min);

  // Instanciate PlanarView*
  const view = new itowns.PlanarView(viewerDiv, extent, {
    camera: {
      type: itowns.CAMERA_TYPE.ORTHOGRAPHIC,
    },
    placement,
    maxSubdivisionLevel: 30,
    disableSkirt: true,
    controls: {
      enableSmartTravel: false,
      zoomFactor: 2,
      maxResolution: 0.5 * overviews.resolution,
      minResolution: 2 * resolLvMin,
    },
  });

  setupLoadingScreen(viewerDiv, view);

  view.isDebugMode = true;
  const menuGlobe = new GuiTools('menuDiv', view);
  menuGlobe.gui.width = 300;

  const opacity = {
    ortho: 1,
    graph: 0.2,
    opi: 0.5,
  };

  const layer = {};
  ['ortho', 'graph', 'opi'].forEach((id) => {
    layer[id] = {
      name: id.charAt(0).toUpperCase() + id.slice(1),
      config: {
        source: {
          url: `${apiUrl}/wmts`,
          crs,
          format: 'image/png',
          name: id,
          tileMatrixSet: overviews.identifier,
          tileMatrixSetLimits: overviews.dataSet.limits,
        },
        opacity: opacity[id],
      },
    };
    layer[id].config.source = new itowns.WMTSSource(layer[id].config.source);
    layer[id].config.source.extentInsideLimit = function extentInsideLimit() {
      return true;
    };

    layer[id].colorLayer = new itowns.ColorLayer(layer[id].name, layer[id].config);
    if (id === 'opi') layer[id].colorLayer.visible = false;
    view.addLayer(layer[id].colorLayer);// .then(menuGlobe.addLayerGUI.bind(menuGlobe));
  });
  itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
  itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
  itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
  // Et ouvrir l'onglet "Color Layers" par defaut ?

  // Request redraw
  view.notifyChange();

  const saisie = new Saisie(view, layer, apiUrl);
  saisie.cliche = 'unknown';
  saisie.message = '';
  saisie.coord = `${xcenter.toFixed(2)},${ycenter.toFixed(2)}`;
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

  viewerDiv.focus();

  // fonction permettant d'afficher la valeur de l'echelle et du niveau de dezoom
  function updateScaleWidget() {
    let distance = view.getPixelsToMeters(200);
    let unit = 'm';
    const dezoom = Math.fround(distance / (200 * overviews.resolution));
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

  view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, () => {
    // eslint-disable-next-line no-console
    console.info('View initialized');
    updateScaleWidget();
  });
  view.addEventListener(itowns.PLANAR_CONTROL_EVENT.MOVED, () => {
    // eslint-disable-next-line no-console
    console.info('View moved');
    if (view.controls.state === -1) {
      updateScaleWidget();
    }
  });

  viewerDiv.addEventListener('mousemove', (ev) => {
    ev.preventDefault();
    saisie.mousemove(ev);
    return false;
  }, false);

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
          coord: new itowns.Coordinates(crs, coords[0], coords[1]),
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

  document.getElementById('recenterBtn').addEventListener('click', () => {
    // bug itowns...
    // itowns.CameraUtils.animateCameraToLookAtTarget( ... )
    itowns.CameraUtils.transformCameraToLookAtTarget(
      view,
      view.camera.camera3D,
      {
        coord: new itowns.Coordinates(crs, xcenter, ycenter),
        heading: 0,
      },
    );
    return false;
  }, false);
  document.getElementById('zoomInBtn').addEventListener('click', () => {
    console.log('Zoom-In');
    if (view.getPixelsToMeters() > overviews.resolution) {
      view.camera.camera3D.zoom *= 2;
      view.camera.camera3D.updateProjectionMatrix();
      view.notifyChange(view.camera.camera3D);
      updateScaleWidget();
    }
    return false;
  });
  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    console.log('Zoom-Out');
    if (view.getPixelsToMeters() < resolLvMin) {
      view.camera.camera3D.zoom *= 0.5;
      view.camera.camera3D.updateProjectionMatrix();
      view.notifyChange(view.camera.camera3D);
      updateScaleWidget();
    }
    return false;
  });

  const helpContent = document.getElementById('help-content');
  helpContent.style.visibility = 'hidden';
  document.getElementById('help').addEventListener('click', () => {
    helpContent.style.visibility = (helpContent.style.visibility === 'hidden') ? 'visible' : 'hidden';
  });
})
  .catch((err) => {
    console.log(`${err.name}: ${err.message}`);
    if (`${err.name}: ${err.message}` === 'TypeError: Failed to fetch') {
      const newApiUrl = window.prompt(`API non accessible à l'adresse renseignée (${apiUrl}). Veuillez entrer une adresse valide :`, apiUrl);
      const apiUrlSplit = newApiUrl.split('/')[2].split(':');
      window.location.assign(`${window.location.href.split('?')[0]}?serverapi=${apiUrlSplit[0]}&portapi=${apiUrlSplit[1]}`);
    } else {
      window.alert(err);
    }
  });
