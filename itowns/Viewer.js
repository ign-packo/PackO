/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
import * as itowns from 'itowns';
import * as THREE from 'three';
import shp from 'shpjs';

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

let alertUncheckedColor = '';
let alertCheckedColor = '';
let alertValidatedColor = '';

function initAlertColor() {
  Array.from(document.styleSheets).forEach((sheet) => {
    Array.from(sheet.cssRules).forEach((rule) => {
      if (rule.selectorText === '.alertUnchecked') {
        alertUncheckedColor = rule.style.color;
      } else if (rule.selectorText === '.alertChecked') {
        alertCheckedColor = rule.style.color;
      } else if (rule.selectorText === '.alertValidated') {
        alertValidatedColor = rule.style.color;
      }
    });
  });
}

initAlertColor();

function coloringAlerts(properties) {
  if (properties.status === false) {
    return alertCheckedColor;
  }
  if (properties.status === true) {
    return alertValidatedColor;
  }
  return alertUncheckedColor;
}

class Viewer {
  constructor(viewerDiv) {
    this.viewerDiv = viewerDiv;

    this.crs = {};
    this.overview = {};
    this.view = null;
    this.menuGlobe = null;

    this.xcenter = 0;
    this.ycenter = 0;
    this.resolution = 0;
    this.resolLvMax = 0;
    this.resolLvMin = 0;
    this.layerIndex = {
      Ortho: 1,
      Opi: 2,
      Graph: 0,
      Contour: 3,
      Patches: 4,
    };
    this.oldStyle = {};
  }

  createView(overviews, idCache) {
    this.overviews = overviews;
    this.idCache = idCache;

    // Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
    this.crs = `${overviews.crs.type}:${overviews.crs.code}`;
    if (this.crs !== 'EPSG:4326' && overviews.crs.proj4Definition) {
      itowns.CRS.defs(this.crs, overviews.crs.proj4Definition);
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
    this.resolution = overviews.resolution;
    const { resolution } = this;
    const resolutionLv0 = resolution * 2 ** overviews.level.max;
    const extent = new itowns.Extent(
      this.crs,
      xOrigin, xOrigin + (overviews.tileSize.width * resolutionLv0),
      yOrigin - (overviews.tileSize.height * resolutionLv0), yOrigin,
    );

    const dezoomInitial = 4;// to define
    const resolInit = resolution * 2 ** dezoomInitial;
    this.xcenter = (xmin + xmax) * 0.5;
    this.ycenter = (ymin + ymax) * 0.5;

    // `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
    // const viewerDiv = document.getElementById('viewerDiv');
    this.viewerDiv.height = this.viewerDiv.clientHeight;
    this.viewerDiv.width = this.viewerDiv.clientWidth;
    const placement = new itowns.Extent(
      this.crs,
      this.xcenter - this.viewerDiv.width * resolInit * 0.5,
      this.xcenter + this.viewerDiv.width * resolInit * 0.5,
      this.ycenter - this.viewerDiv.height * resolInit * 0.5,
      this.ycenter + this.viewerDiv.height * resolInit * 0.5,
    );

    const levelMax = overviews.dataSet.level.max;
    const levelMin = overviews.dataSet.level.min;

    // par défaut, on autorise un sur-ech x2 et on affiche un niveau
    // de plus que la plus faible résolution du cache
    // ce n'est pas très performant mais c'est demandé par les utilisateurs
    // on ajoute 1cm de marge pour éviter les erreurs d'arrondi sur le calcul de la résolution
    // avec le view.getPixelsToMeters() d'iTowns
    this.resolLvMax = resolution * 2 ** (overviews.level.max - levelMax - 1) - 0.01;
    this.resolLvMin = resolution * 2 ** (overviews.level.max - levelMin) + 0.01;
    // console.log('resol min/max : ', this.resolLvMin, this.resolLvMax);
    // Instanciate PlanarView*
    const zoomFactor = 2;// customizable

    this.view = new itowns.PlanarView(this.viewerDiv, extent, {
      camera: {
        type: itowns.CAMERA_TYPE.ORTHOGRAPHIC,
      },
      placement,
      maxSubdivisionLevel: levelMax,
      minSubdivisionLevel: levelMin,
      controls: {
        enableSmartTravel: false,
        zoomFactor,
        maxResolution: this.resolLvMax,
        minResolution: this.resolLvMin,
      },
    });
  }

  centerCamera(coordX, coordY) {
    // bug itowns...
    // itowns.CameraUtils.animateCameraToLookAtTarget( ... )
    itowns.CameraUtils.transformCameraToLookAtTarget(
      this.view,
      this.view.camera.camera3D,
      {
        coord: new itowns.Coordinates(this.crs, coordX, coordY),
        heading: 0,
      },
    );
  }

  refresh(layerList, changeBranch = false) {
    const layerNames = Array.isArray(layerList) ? layerList : Object.keys(layerList);
    let listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);

    if (changeBranch) {
      // Clean up of all the extra layers
      listColorLayer.forEach((layerName) => {
        if (!['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].includes(layerName)) {
          this.view.removeLayer(layerName);
          this.menuGlobe.removeLayersGUI(layerName);
          delete this.layerIndex[layerName];
        }
      });
    }

    layerNames.forEach((layerName) => {
      const layer = {};
      layer.config = {};

      if (this.view.getLayerById(layerName)) {
        // la couche existe avant le refresh
        const {
          opacity, transparent, visible,
        } = this.view.getLayerById(layerName);
        let { style } = this.view.getLayerById(layerName);
        let { source } = this.view.getLayerById(layerName);
        if (source.isVectorSource) {
          source = new itowns.FileSource({
            url: source.url,
            fetcher: itowns.Fetcher.json,
            crs: source.crs,
            parser: itowns.GeoJsonParser.parse,
          });
          if (this.oldStyle[layerName]) {
            style = this.oldStyle[layerName];
          }
          if (layerName === this.alertLayerName) {
            this.oldStyle[layerName] = style.clone();
            /* eslint-disable no-param-reassign */
            style.fill.color = coloringAlerts;
            style.point.color = coloringAlerts;
            style.stroke.color = coloringAlerts;
            /* eslint-enable no-param-reassign */
          }
        }
        this.view.removeLayer(layerName);
        layer.colorLayer = new itowns.ColorLayer(layerName,
          {
            source,
            transparent,
            opacity,
            style,
            zoom: {
              min: layerName === 'Patches' ? this.zoomMinPatch : this.overviews.dataSet.level.min,
              // min: this.overviews.dataSet.level.min,
              max: this.overviews.dataSet.level.max,
            },
          });

        if (layerName === 'Contour') {
          layer.colorLayer.effect_type = itowns.colorLayerEffects.customEffect;
          layer.colorLayer.effect_parameter = 1.0;
          layer.colorLayer.magFilter = THREE.NearestFilter;
          layer.colorLayer.minFilter = THREE.NearestFilter;
        }
        layer.colorLayer.visible = visible;
        this.view.addLayer(layer.colorLayer);
      } else {
        // nouvelle couche
        if (layerList[layerName].type === 'raster') {
          layer.config.source = new itowns.WMTSSource({
            url: layerList[layerName].url,
            crs: layerList[layerName].crs,
            format: 'image/png',
            name: layerName !== 'Contour' ? layerName.toLowerCase() : 'graph',
            tileMatrixSet: this.overviews.identifier,
            tileMatrixSetLimits:
              (layerName === 'Contour') || (layerName === 'Graph')
                ? this.overviews.dataSet.limitsForGraph : this.overviews.dataSet.limits,
          });
        } else if (layerList[layerName].type === 'vector') {
          layer.config.source = new itowns.FileSource({
            url: layerList[layerName].url,
            fetcher: itowns.Fetcher.json,
            crs: layerList[layerName].crs,
            parser: itowns.GeoJsonParser.parse,
          });

          // if (layerName === this.alertLayerName) {
          //   // eslint-disable-next-line no-param-reassign
          //   layerList[layerName].style.fill.color = coloringAlerts;
          //   // eslint-disable-next-line no-param-reassign
          //   layerList[layerName].style.point.color = coloringAlerts;
          // }
          layer.config.style = new itowns.Style(layerList[layerName].style);
          layer.config.zoom = {
            min: this.overviews.dataSet.level.min,
            max: this.overviews.dataSet.level.max,
          };
          // pas besoin de definir le zoom min pour patches car il y en a jamais sur la couche orig
        }
        layer.config.opacity = layerList[layerName].opacity;
        layer.colorLayer = new itowns.ColorLayer(
          layerName,
          layer.config,
        );

        if (layerName === 'Patch') {
          layer.buildExtent = false;
        }

        layer.colorLayer.visible = layerList[layerName].visible;
        if (layerName === 'Contour') {
          layer.colorLayer.effect_type = itowns.colorLayerEffects.customEffect;
          layer.colorLayer.effect_parameter = 1.0;
          layer.colorLayer.magFilter = THREE.NearestFilter;
          layer.colorLayer.minFilter = THREE.NearestFilter;
        }

        // if (layerList[layerName].type === 'vector') {
        //   this.view.addLayer(layer.colorLayer)
        //     .then(
        //       (layerT) => global.FeatureToolTip.addLayer(layerT, { filterAllProperties: false }),
        //     );
        // } else {
        //   this.view.addLayer(layer.colorLayer);
        // }
        this.view.addLayer(layer.colorLayer);

        if (this.layerIndex[layerName] === undefined) {
          this.layerIndex[layerName] = Math.max(...Object.values(this.layerIndex)) + 1;
        }
      }
      if (layerList[layerName].id) {
        layer.colorLayer.vectorId = layerList[layerName].id;
      }
    });

    // Layer ordering
    listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
    listColorLayer.forEach((layerId) => {
      if (this.layerIndex[layerId] === undefined) {
        const extrIndex = Math.max(...Object.values(this.layerIndex)) + 1;
        itowns.ColorLayersOrdering.moveLayerToIndex(this.view, layerId, extrIndex);
      } else {
        itowns.ColorLayersOrdering.moveLayerToIndex(this.view, layerId, this.layerIndex[layerId]);
      }
    });
  }

  addDnDFiles(eventDnD, files) {
    eventDnD.preventDefault();

    // TYPE
    const _TEXT = 1;
    const _JSON = 2;
    const _BINARY = 3;
    const _IMAGE = 4;

    // FORMAT
    const _GEOJSON = 'geojson';
    const _SHP = 'shapefile';

    const extensionsMap = [];
    extensionsMap.geojson = {
      extension: 'geojson',
      format: _GEOJSON,
      type: _JSON,
    };
    extensionsMap.shp = {
      extension: 'shp',
      format: _SHP,
      type: _BINARY,
    };
    extensionsMap.dbf = {
      extension: 'dbf',
      format: _SHP,
      type: _BINARY,
    };
    extensionsMap.shx = {
      extension: 'shx',
      format: _SHP,
      type: _BINARY,
    };
    extensionsMap.prj = {
      extension: 'prj',
      format: _SHP,
      type: _TEXT,
    };

    const errors = [];
    let nbFileLoaded = 0;
    const ListFile = {};
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];

      const extension = file.name.split('.').pop().toLowerCase();
      const layerName = file.name.split('.').slice(0, -1).join('.');

      if (!ListFile[layerName]) ListFile[layerName] = { nbFileDropped: 0, nbFileLoaded: 0 };

      if (Object.keys(extensionsMap).includes(extension)) ListFile[layerName].nbFileDropped += 1;
    }
    console.log(ListFile);

    let data = {};
    // Read each file
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      let extension = extensionsMap[file.name.split('.').pop().toLowerCase()];
      let layerName = file.name.split('.').slice(0, -1).join('.');
      layerName = layerName.charAt(0).toUpperCase() + layerName.slice(1);

      if (!extension) {
        extension = {};
        errors.push(new Error('Type of file not supported, please add it using DragNDrop.register'));
        // throw new Error('Type of file not supported, please add it using DragNDrop.register');
      }

      const listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
      if (listColorLayer.includes(layerName)) {
        extension = {};
        errors.push(new Error('A layer with the same name has already been added'));
        // throw new Error('A layer with the same name has already been added');
      }

      const fileReader = new FileReader();
      const _view = this.view;
      // const _index = this.layerIndex;
      // eslint-disable-next-line no-loop-func
      fileReader.onload = function onload(e) {
        const dataLoaded = e.target.result;
        let resData;
        nbFileLoaded += 1;

        if (extension.format === _GEOJSON) {
          data = JSON.parse(dataLoaded);
          resData = data;
        } else if (extension.format === _SHP) {
          data[extension.extension] = dataLoaded;
          ListFile[layerName].nbFileLoaded += 1;
          if (ListFile[layerName].nbFileLoaded < 4) {
            if (ListFile[layerName].nbFileLoaded === ListFile[layerName].nbFileDropped) {
              errors.push(new Error('missing file'));
            }
          } else {
            resData = shp.combine([
              shp.parseShp(data.shp, data.prj),
              shp.parseDbf(data.dbf),
            ]);
            resData.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } };
          }
        }
        if (resData) {
          const geoJson = JSON.parse(JSON.stringify(resData));
          const { crs } = _view.tileLayer.extent;
          const options = {
            out: {
              crs,
              buildExtent: true,
              mergeFeatures: true,
              structure: '2d',
              forcedExtentCrs: crs !== 'EPSG:4978' ? crs : 'EPSG:4326',
            },
          };

          // itowns.GeoJsonParser.parse(resData, options).then((features) => {
          itowns.GeoJsonParser.parse(resData, options).then(() => {
            // const source = new itowns.FileSource({
            //   features,
            // });

            const randomColor = Math.round(Math.random() * 0xffffff);

            const style = {
              fill: {
                color: `#${randomColor.toString(16)}`,
                opacity: 0.7,
              },
              stroke: {
                color: `#${randomColor.toString(16)}`,
              },
              point: {
                color: `#${randomColor.toString(16)}`,
                radius: 5,
              },
            };
            // const layer = new itowns.ColorLayer(layerName, {
            //   transparent: true,
            //   style: new itowns.Style(style),
            //   source,
            // });

            // _view.addLayer(layer);

            // console.log(`-> Layer '${layer.id}' added`);

            // _index[layer.id] = Object.keys(_index).length;
            // itowns.ColorLayersOrdering.moveLayerToIndex(_view,
            //   layer.id, _index[layer.id]);

            console.log(`-> Layer '${layerName}' dropped`);

            _view.dispatchEvent({
              type: 'file-dropped',
              name: layerName,
              data: geoJson,
              style,
            });
          });
        }

        if (nbFileLoaded === files.length && errors.length > 0) {
          throw errors;
        }
      };
      switch (extension.type) {
        case _TEXT:
        case _JSON:
          fileReader.readAsText(file);
          break;
        case _BINARY:
          fileReader.readAsArrayBuffer(file);
          break;
        case _IMAGE:
          fileReader.readAsBinaryString(file);
          break;
        default:
          nbFileLoaded += 1;
          if (nbFileLoaded === files.length && errors.length > 0) {
            throw errors;
          }
          // throw new Error('Type of file not supported, please add it using DragNDrop.register');
      }
    }
  }
}
export default Viewer;
