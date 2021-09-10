/* eslint-disable no-console */
/* global setupLoadingScreen, GuiTools */
import * as itowns from 'itowns';
import Saisie from './Saisie';

// Global itowns pour GuiTools -> peut être améliorer
global.itowns = itowns;

itowns.ShaderChunk.customHeaderColorLayer(`
float edge(sampler2D textu, float stepx, float stepy, vec2 center){
    // get samples around pixel
    float t0 = length(texture2D(textu,center + vec2(-stepx,stepy)) - texture2D(textu,center));
    float t1 = length(texture2D(textu,center + vec2(0,stepy)) - texture2D(textu,center));
    float t2 = length(texture2D(textu,center + vec2(+stepx,stepy)) - texture2D(textu,center));
    float t3 = length(texture2D(textu,center + vec2(-stepx,0)) - texture2D(textu,center));
    float t4 = length(texture2D(textu,center + vec2(+stepx,0)) - texture2D(textu,center));
    float t5 = length(texture2D(textu,center + vec2(-stepx,-stepy)) - texture2D(textu,center));
    float t6 = length(texture2D(textu,center + vec2(0,-stepy)) - texture2D(textu,center));
    float t7 = length(texture2D(textu,center + vec2(+stepx,-stepy)) - texture2D(textu,center));

    return max(t0, max(t1, max(t2, max(t3, max(t4, max(t5, max(t6, t7)))))));
}
`);

itowns.ShaderChunk.customBodyColorLayer(`
ivec2 textureSize2d = textureSize(tex,0);
vec2 resolution = vec2(float(textureSize2d.x), float(textureSize2d.y));
float step = layer.effect_parameter;
vec2 cuv = pitUV(uv.xy, offsetScale);
float value = edge(tex, step/resolution.x, step/resolution.y, cuv);
if (value > 0.0){
  color = vec4(vec3(1.0, 0.0, 0.0), 1.0);
}
else {
  color = vec4(vec3(0.0, 0.0, 0.0), 0.0);
}
`);

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
  const getBranches = itowns.Fetcher.json(`${apiUrl}/branches`);
  const getPatches = itowns.Fetcher.json(`${apiUrl}/0/patches`);

  try {
    const overviews = await getOverviews;

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
    const { resolution } = overviews;
    const resolutionLv0 = resolution * 2 ** overviews.level.max;
    const extent = new itowns.Extent(
      crs,
      xOrigin, xOrigin + (overviews.tileSize.width * resolutionLv0),
      yOrigin - (overviews.tileSize.height * resolutionLv0), yOrigin,
    );

    const dezoomInitial = 4;// to define
    const resolInit = resolution * 2 ** dezoomInitial;
    const xcenter = (xmin + xmax) * 0.5;
    const ycenter = (ymin + ymax) * 0.5;

    // `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
    const viewerDiv = document.getElementById('viewerDiv');
    viewerDiv.height = viewerDiv.clientHeight;
    viewerDiv.width = viewerDiv.clientWidth;
    const placement = new itowns.Extent(
      crs,
      xcenter - viewerDiv.width * resolInit * 0.5, xcenter + viewerDiv.width * resolInit * 0.5,
      ycenter - viewerDiv.height * resolInit * 0.5, ycenter + viewerDiv.height * resolInit * 0.5,
    );

    const levelMax = overviews.dataSet.level.max;
    const levelMin = overviews.dataSet.level.min;

    // par défaut, on autorise un sur-ech x2 et on affiche un niveau
    // de plus que la plus faible résolution du cache
    // ce n'est pas très performant mais c'est demandé par les utilisateurs
    // on ajoute 1cm de marge pour éviter les erreurs d'arrondi sur le calcul de la résolution
    // avec le view.getPixelsToMeters() d'iTowns
    const resolLvMax = resolution * 2 ** (overviews.level.max - levelMax - 1) - 0.01;
    const resolLvMin = resolution * 2 ** (overviews.level.max - levelMin) + 0.01;
    console.log('resol min/max : ', resolLvMin, resolLvMax);
    // Instanciate PlanarView*
    const zoomFactor = 2;// customizable
    const view = new itowns.PlanarView(viewerDiv, extent, {
      camera: {
        type: itowns.CAMERA_TYPE.ORTHOGRAPHIC,
      },
      placement,
      maxSubdivisionLevel: levelMax,
      minSubdivisionLevel: levelMin,
      controls: {
        enableSmartTravel: false,
        zoomFactor,
        maxResolution: resolLvMax,
        minResolution: resolLvMin,
      },
    });

    setupLoadingScreen(viewerDiv, view);

    view.isDebugMode = true;
    const menuGlobe = new GuiTools('menuDiv', view);
    menuGlobe.gui.width = 300;

    const opacity = {
      ortho: 1,
      graph: 0.001,
      contour: 0.5,
      opi: 0.5,
    };

    const source = {
      ortho: 'ortho',
      graph: 'graph',
      contour: 'graph',
      opi: 'opi',
    };

    const branches = await getBranches;

    const currentBranch = branches[0];
    const branchNames = [];
    branches.forEach((element) => {
      branchNames.push(element.name);
    });

    const layer = {};
    ['ortho', 'graph', 'contour', 'opi'].forEach((id) => {
      layer[id] = {
        name: id.charAt(0).toUpperCase() + id.slice(1),
        config: {
          source: {
            url: `${apiUrl}/${currentBranch.id}/wmts`,
            crs,
            format: 'image/png',
            name: source[id],
            tileMatrixSet: overviews.identifier,
            tileMatrixSetLimits: overviews.dataSet.limits,
          },
          opacity: opacity[id],
        },
      };
      layer[id].config.source = new itowns.WMTSSource(layer[id].config.source);
      // layer[id].config.source.extentInsideLimit = function extentInsideLimit() {
      //   return true;
      // };

      layer[id].colorLayer = new itowns.ColorLayer(layer[id].name, layer[id].config);
      if (id === 'opi') layer[id].colorLayer.visible = false;
      if (id === 'contour') {
        layer[id].colorLayer.effect_type = itowns.colorLayerEffects.customEffect;
        layer[id].colorLayer.effect_parameter = 1.0;
        layer[id].colorLayer.magFilter = 1003;// itowns.THREE.NearestFilter;
        layer[id].colorLayer.minFilter = 1003;// itowns.THREE.NearestFilter;
      }
      view.addLayer(layer[id].colorLayer);// .then(menuGlobe.addLayerGUI.bind(menuGlobe));
    });
    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Contour', 3);
    // Et ouvrir l'onglet "Color Layers" par defaut ?

    // Couche Patches
    layer.patches = {
      name: 'Patches',
      config: {
        transparent: true,
        opacity: opacity.patches,
      },
    };

    const currentPatches = await getPatches;

    layer.patches.config.source = new itowns.FileSource({
      fetchedData: currentPatches,
      crs,
      parser: itowns.GeoJsonParser.parse,
    });

    layer.patches.config.style = new itowns.Style({
      stroke: {
        color: 'Yellow',
        width: 2,
      },
    });

    layer.patches.colorLayer = new itowns.ColorLayer(
      layer.patches.name,
      layer.patches.config,
    );
    view.addLayer(layer.patches.colorLayer);
    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Patches', 4);

    // Request redraw
    view.notifyChange();

    const saisie = new Saisie(view, layer, apiUrl, currentBranch.id);
    saisie.cliche = 'unknown';
    saisie.message = '';
    saisie.branch = currentBranch.name;
    saisie.branchId = currentBranch.id;
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
    saisie.controllers.branch = menuGlobe.gui.add(saisie, 'branch', branchNames);
    saisie.controllers.branch.onChange((value) => {
      console.log('new active branch : ', value);
      branches.forEach((branch) => {
        if (branch.name === value) {
          saisie.branch = value;
          saisie.branchId = branch.id;
          saisie.changeBranchId(saisie.branchId);
        }
      });
    });

    saisie.controllers.createBranch = menuGlobe.gui.add(saisie, 'createBranch');

    viewerDiv.focus();

    view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, () => {
      // eslint-disable-next-line no-console
      console.info('View initialized');
      updateScaleWidget(view, resolution);
    });
    view.addEventListener(itowns.PLANAR_CONTROL_EVENT.MOVED, () => {
      // eslint-disable-next-line no-console
      console.info('View moved');
      if (view.controls.state === -1) {
        updateScaleWidget(view, resolution);
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
    // });

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
      if ((view.getPixelsToMeters() / 2) > resolLvMax) {
        view.camera.camera3D.zoom *= 2;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        updateScaleWidget(view, resolution);
      }
      return false;
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      console.log('Zoom-Out');
      if ((view.getPixelsToMeters() * 2) < resolLvMin) {
        view.camera.camera3D.zoom *= 0.5;
        view.camera.camera3D.updateProjectionMatrix();
        view.notifyChange(view.camera.camera3D);
        updateScaleWidget(view, resolution);
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
