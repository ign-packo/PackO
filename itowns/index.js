/* eslint-disable no-console */
/* global setupLoadingScreen, GuiTools */
import * as itowns from 'itowns';
import Saisie from './Saisie';

// Global itowns pour GuiTools -> peut être améliorer
global.itowns = itowns;

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

/*         function updateScaleWidget() {
    var pix = 200;
    const point1 = new itowns.THREE.Vector3();
    const point2 = new itowns.THREE.Vector3();
    const mousePosition = new itowns.THREE.Vector2();
    mousePosition.set(0, 0);
    view.getPickingPositionFromDepth(mousePosition, point1);
    mousePosition.set(pix, 0);
    view.getPickingPositionFromDepth(mousePosition, point2);
    var value = point1.distanceTo(point2);
    var unit = 'm';
    if (value >= 1000) {
        value /= 1000;
        unit = 'km';
    }
    divScaleWidget.innerHTML = `${value.toFixed(2)} ${unit}`;
    divScaleWidget.style.width = `${pix}px`;
} */

itowns.Fetcher.json(`${apiUrl}/json/overviews`).then((json) => {
  const overviews = json;

  // limite du crs
  const crs = `${overviews.crs.type}:${overviews.crs.code}`;
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;

  // Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
  if (crs !== 'EPSG:4326' && overviews.crs.proj4Definition) {
    itowns.CRS.defs(crs, overviews.crs.proj4Definition);
  } else {
    throw new Error('EPSG proj4.defs not defined in overviews.json');
  }

  // limite du dataSet
  const xmin = overviews.dataSet.boundingBox.LowerCorner[0];
  const xmax = overviews.dataSet.boundingBox.UpperCorner[0];
  const ymin = overviews.dataSet.boundingBox.LowerCorner[1];
  const ymax = overviews.dataSet.boundingBox.UpperCorner[1];

  const placement = {
    coord: new itowns.Coordinates(crs, (xmax + xmin) * 0.5, (ymax + ymin) * 0.5),
    range: 10000,
  };

  // `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
  const viewerDiv = document.getElementById('viewerDiv');

  // Define geographic extent of level 0 : CRS, min/max X, min/max Y
  const resolutionLv0 = overviews.resolution * 2 ** overviews.level.max;

  const extent = new itowns.Extent(
    crs,
    xOrigin, xOrigin + (overviews.tileSize.width * resolutionLv0),
    yOrigin - (overviews.tileSize.height * resolutionLv0), yOrigin,
  );

  // Instanciate PlanarView*
  const view = new itowns.PlanarView(viewerDiv, extent, {
    placement,
    maxSubdivisionLevel: 30,
    //  disableSkirt: false
    controls: {
      maxAltitude: 80000000,
      enableRotation: false,
      enableSmartTravel: false,
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
  saisie.coord = `${((xmax + xmin) * 0.5).toFixed(2)} ${((ymax + ymin) * 0.5).toFixed(2)}`;
  saisie.color = [0, 0, 0];
  saisie.controllers = {};
  saisie.controllers.select = menuGlobe.gui.add(saisie, 'select');
  saisie.controllers.cliche = menuGlobe.gui.add(saisie, 'cliche');
  saisie.controllers.cliche.listen().domElement.parentElement.style.pointerEvents = 'none';
  saisie.controllers.coord = menuGlobe.gui.add(saisie, 'coord');
  saisie.controllers.coord.listen().domElement.parentElement.style.pointerEvents = 'none';
  saisie.controllers.polygon = menuGlobe.gui.add(saisie, 'polygon');
  saisie.controllers.undo = menuGlobe.gui.add(saisie, 'undo');
  saisie.controllers.redo = menuGlobe.gui.add(saisie, 'redo');
  saisie.controllers.clear = menuGlobe.gui.add(saisie, 'clear');
  saisie.controllers.message = menuGlobe.gui.add(saisie, 'message');
  saisie.controllers.message.listen().domElement.parentElement.style.pointerEvents = 'none';

  viewerDiv.focus();
  view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, () => {
    // eslint-disable-next-line no-console
    console.info('View initialized');
    // updateScaleWidget();
  });
  viewerDiv.addEventListener('mousewheel', (ev) => {
    ev.preventDefault();
    // updateScaleWidget();
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
  viewerDiv.addEventListener('auxclick', (ev) => {
    console.log(ev.cancelable);
    ev.preventDefault();
    console.log('auxclick:', ev.button);
    if (ev.button === 1) {
      console.log('middle button clicked');
    }
    if (ev.button === 2) {
      console.log('right button clicked');
    }
    return false;
  }, false);

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
      { coord: placement.coord, heading: 0 },
    );
    return false;
  }, false);
  document.getElementById('zoomInBtn').addEventListener('click', () => {
    console.log('Zoom-In');

    const { range } = itowns.CameraUtils.getTransformCameraLookingAtTarget(
      view,
      view.camera.camera3D,
    );

    console.log(range);
    itowns.CameraUtils.transformCameraToLookAtTarget(
      view,
      view.camera.camera3D,
      { range: range * 0.5, heading: 0 },
    );
    return false;
  });
  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    console.log('Zoom-Out');

    const { range } = itowns.CameraUtils.getTransformCameraLookingAtTarget(
      view,
      view.camera.camera3D,
    );

    console.log(range);
    itowns.CameraUtils.transformCameraToLookAtTarget(
      view,
      view.camera.camera3D,
      { range: range * 2, heading: 0 },
    );
    return false;
  });

  const helpContent = document.getElementById('help-content');
  helpContent.style.visibility = 'hidden';
  document.getElementById('help').addEventListener('click', () => {
    helpContent.style.visibility = (helpContent.style.visibility === 'hidden') ? 'visible' : 'hidden';
  });

  // Patch du PlanarControls pour gérer correctement les changements de curseur
  // todo: faire une PR pour iTowns
  view.controls.updateMouseCursorType = function updateMouseCursorType() {
    // control state
    const STATE = {
      NONE: -1,
      DRAG: 0,
      PAN: 1,
      ROTATE: 2,
      TRAVEL: 3,
    };
    switch (this.state) {
      case STATE.NONE:
        this.view.domElement.style.cursor = this.defaultCursor;
        // this.view.domElement.style.cursor = 'auto';
        break;
      case STATE.DRAG:
        if (this.view.domElement.style.cursor !== 'wait') this.defaultCursor = this.view.domElement.style.cursor;
        this.view.domElement.style.cursor = 'move';
        break;
      case STATE.PAN:
        if (this.view.domElement.style.cursor !== 'wait') this.defaultCursor = this.view.domElement.style.cursor;
        this.view.domElement.style.cursor = 'cell';
        break;
      case STATE.TRAVEL:
        if (this.view.domElement.style.cursor !== 'wait') this.defaultCursor = this.view.domElement.style.cursor;
        this.view.domElement.style.cursor = 'wait';
        break;
      case STATE.ROTATE:
        if (this.view.domElement.style.cursor !== 'wait') this.defaultCursor = this.view.domElement.style.cursor;
        this.view.domElement.style.cursor = 'move';
        break;
      default:
        break;
    }
  };
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
