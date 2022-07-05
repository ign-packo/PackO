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

// function changeLayerStyle(config) {
//   const { style } = config;
//   style.fill.color = coloringAlerts;
//   style.point.color = coloringAlerts;
//   style.stroke.color = coloringAlerts;
// }

function changeLayerStyle(config, idSelected, oldStyle) {
  const { style } = config;
  style.fill.color = coloringAlerts;
  style.point.color = (properties) => {
    if (properties.status === false) {
      return alertCheckedColor;
    }
    if (properties.status === true) {
      return alertValidatedColor;
    }
    return alertUncheckedColor;
  };
  style.point.radius = (properties) => {
    if (properties.id === idSelected) {
      return 7;
    }
    return oldStyle.point.radius;
  };
  style.point.line = (properties) => {
    if (properties.id === idSelected) {
      return 'yellow';
    }
    return oldStyle.point.line;
  };
  style.point.width = (properties) => {
    if (properties.id === idSelected) {
      return 5;
    }
    return oldStyle.point.width;
  };

  style.stroke.color = (properties) => {
    if (properties.id === idSelected) {
      return 'yellow';
    }
    if (properties.status === false) {
      return alertCheckedColor;
    }
    if (properties.status === true) {
      return alertValidatedColor;
    }
    return alertUncheckedColor;
  };
  style.stroke.width = (properties) => {
    if (properties.id === idSelected) {
      return 5;
    }
    return oldStyle.stroke.width;
  };
}

class Viewer {
  constructor(viewerDiv) {
    this.viewerDiv = viewerDiv;

    this.crs = {};
    this.overview = {};
    this.view = null;

    this.xcenter = 0;
    this.ycenter = 0;
    this.resolution = 0;
    this.resolLvMax = 0;
    this.resolLvMin = 0;
    this.layerIndex = {
      Graph: 0,
      Ortho: 1,
      Opi: 2,
      Contour: 3,
      Patches: 4,
    };
    this.oldStyle = {};

    this.shortCuts = {
      visibleFolder: { Ortho: 'm', Opi: 'o', Contour: 'g' },
      styleFolder: { Ortho: 'i', Opi: 'i' },
    };
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

    const zoomFactor = 2;// customizable
    // Instanciate PlanarView
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

    // disable itowns shortcuts because of conflicts with endogenous shortcuts
    /* eslint-disable-next-line no-underscore-dangle */
    this.view.domElement.removeEventListener('keydown', this.view.controls._handlerOnKeyDown, false);

    const viewer = this;
    this.view.removeVectorLayer = function _(layerName) {
      if (layerName === undefined) return;
      const layerId = viewer.view.getLayerById(layerName).vectorId;
      viewer.view.removeLayer(layerName);
      delete viewer.layerIndex[layerName];
      viewer.view.dispatchEvent({
        type: 'vectorLayer-removed',
        layerId,
        layerName,
      });
    };

    this.view.changeWmtsStyle = function _(layers, value) {
      console.log('Change style of', layers, 'to', value);
      const layerList = layers instanceof Array ? layers : [layers];
      const regex = /STYLE=.*TILEMATRIXSET/;
      layerList.forEach((layerName) => {
        const layer = viewer.view.getLayerById(layerName);
        layer.source.url = layer.source.url.replace(regex, `STYLE=${value}&TILEMATRIXSET`);
      });
      viewer.refresh(layerList);
    };

    this.view.changeOpi = function _(name) {
      const regex = /LAYER=.*&FORMAT/;
      const layer = viewer.view.getLayerById('Opi');
      layer.source.url = layer.source.url.replace(regex, `LAYER=opi&Name=${name}&FORMAT`);
      layer.visible = true;
    };

    this.view.changeBranch = function _(branchId) {
      const regex = new RegExp('\\/[0-9]+\\/');
      ['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].forEach((element) => {
        const layer = viewer.view.getLayerById(element);
        layer.source.url = layer.source.url.replace(regex, `/${branchId}/`);
      });
    };

    this.view.refresh = function _(layers) {
      viewer.refresh(layers);
    };
  }

  centerCameraOn(coordX, coordY) {
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

  removeExtraLayers() {
    // Clean up of all the extra layers
    this.view.getLayers((l) => l.isColorLayer).map((l) => l.id).forEach((layerName) => {
      if (!['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].includes(layerName)) {
        this.view.removeLayer(layerName);
        delete this.layerIndex[layerName];
      }
    });
  }

  refresh(layers) {
    const layerList = layers instanceof Array ? layers : [layers];
    const layerNames = [];
    layerList.forEach((layer) => {
      layerNames.push(typeof layer === 'string' ? layer : layer.name);
    });

    layerNames.forEach((layerName) => {
      let config = {};

      let layer = {};

      if (this.view.getLayerById(layerName)) {
        // la couche existe avant le refresh
        layer = this.view.getLayerById(layerName);

        config = {
          source: layer.source,
          opacity: layer.opacity,
          style: layer.style,
          zoom: layer.zoom,
          transparent: layer.transparent,
        };

        if (layer.source.isVectorSource) {
          config.source = new itowns.FileSource({
            url: layer.source.url,
            fetcher: itowns.Fetcher.json,
            crs: layer.source.crs,
            parser: itowns.GeoJsonParser.parse,
          });

          if (this.oldStyle[layerName]) {
            config.style = JSON.parse(JSON.stringify(this.oldStyle[layerName]));
          }
          if (layer.isAlert === true) {
            if (this.oldStyle[layerName] === undefined) {
              this.oldStyle[layerName] = JSON.parse(JSON.stringify(config.style));
            }
            changeLayerStyle(config, layer.idSelected, this.oldStyle[layerName]);
          }
        }
        this.view.removeLayer(layerName);
      } else {
        // nouvelle couche
        [layer] = layerList.filter((l) => l.name === layerName);
        if (layer.type === 'raster') {
          config.source = new itowns.WMTSSource({
            url: layer.url,
            crs: layer.crs,
            format: 'image/png',
            name: layerName !== 'Contour' ? layerName.toLowerCase() : 'graph',
            tileMatrixSet: this.overviews.identifier,
            tileMatrixSetLimits: ['Graph', 'Contour'].includes(layerName)
              ? this.overviews.dataSet.limitsForGraph : this.overviews.dataSet.limits,
            style: ['Graph', 'Contour'].includes(layerName) ? 'default' : this.view.styles[0],
          });
        } else if (layer.type === 'vector') {
          config.source = new itowns.FileSource({
            url: layer.url,
            fetcher: itowns.Fetcher.json,
            crs: layer.crs ? layer.crs : this.crs,
            parser: itowns.GeoJsonParser.parse,
          });

          config.style = new itowns.Style(layer.style);
          config.zoom = {
            min: this.overviews.dataSet.level.min,
            max: this.overviews.dataSet.level.max,
          };
          // pas besoin de definir le zoom min pour patches car il y en a jamais sur la couche orig
        }
        config.opacity = layer.opacity;

        if (layer.layerIndex !== undefined) {
          this.layerIndex[layerName] = layer.layerIndex;
        }
      }

      // Dans les 2 cas
      const newColorLayer = new itowns.ColorLayer(
        layerName,
        config,
      );

      newColorLayer.visible = layer.visible;
      if (layerName === 'Contour') {
        newColorLayer.effect_type = itowns.colorLayerEffects.customEffect;
        newColorLayer.effect_parameter = 1.0;
        newColorLayer.magFilter = THREE.NearestFilter;
        newColorLayer.minFilter = THREE.NearestFilter;
      }

      this.view.addLayer(newColorLayer);

      if (newColorLayer.vectorId === undefined) {
        newColorLayer.vectorId = layer.vectorId;
      }
      if (layer.isAlert !== undefined) {
        newColorLayer.isAlert = layer.isAlert;
      }
      if (newColorLayer.isAlert === true) {
        newColorLayer.idSelected = layer.idSelected;
      }

      // Layer ordering
      if (this.view.getLayerById(layerName).sequence !== this.layerIndex[layerName]) {
        itowns.ColorLayersOrdering.moveLayerToIndex(
          this.view,
          layerName,
          this.layerIndex[layerName] === undefined
            ? Math.max(...Object.values(this.layerIndex)) + 1 : this.layerIndex[layerName],
        );
      }
    });
    this.view.dispatchEvent({
      type: 'refresh-done',
      layerNames,
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
    extensionsMap.json = {
      extension: 'json',
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

    const errors = {};
    let nbFileLoaded = 0;
    const ListFile = {};
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];

      const extension = file.name.split('.').pop().toLowerCase();
      const layerName = file.name.split('.').slice(0, -1).join('.');

      if (!ListFile[layerName]) ListFile[layerName] = { nbFileDropped: 0, nbFileLoaded: 0 };

      if (Object.keys(extensionsMap).includes(extension)) ListFile[layerName].nbFileDropped += 1;
    }

    // Read each file
    const data = {};
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      let fileMtd = extensionsMap[file.name.split('.').pop().toLowerCase()];
      let layerName = file.name.split('.').slice(0, -1).join('.');
      layerName = layerName.charAt(0).toUpperCase() + layerName.slice(1);

      if (!data[layerName]) data[layerName] = {};

      if (!fileMtd) {
        if (!errors[layerName]) {
          errors[layerName] = [`Type of file (.${file.name.split('.').pop().toLowerCase()}) not supported.`];
        } else {
          errors[layerName].push(`Type of file (.${file.name.split('.').pop().toLowerCase()}) not supported.`);
        }
        fileMtd = {};
      }

      const listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
      if (listColorLayer.includes(layerName)) {
        fileMtd = {};
        if (!errors[layerName]) {
          errors[layerName] = ['A layer with the same name has already been added.'];
        } else {
          errors[layerName].push('A layer with the same name has already been added.');
        }
      }

      const fileReader = new FileReader();
      const _view = this.view;
      // eslint-disable-next-line no-loop-func
      fileReader.onload = function onload(e) {
        const dataLoaded = e.target.result;
        let resData;
        nbFileLoaded += 1;
        if (fileMtd.format === _GEOJSON) {
          data[layerName] = JSON.parse(dataLoaded);
          if (!data[layerName].type || data[layerName].type !== 'FeatureCollection' || !data[layerName].features) {
            if (!errors[layerName]) {
              errors[layerName] = ['File is not a valid geoJson'];
            } else {
              errors[layerName].push('File is not a valid geoJson');
            }
          } else {
            resData = data[layerName];
          }
        } else if (fileMtd.format === _SHP) {
          data[layerName][fileMtd.extension] = dataLoaded;
          ListFile[layerName].nbFileLoaded += 1;
          if (ListFile[layerName].nbFileLoaded < 4) {
            if (ListFile[layerName].nbFileLoaded === ListFile[layerName].nbFileDropped) {
              const message = 'file(s) missing. (A shapefile must be added with the .shp, the .shx, the .prj and the .dbf)';
              if (!errors[layerName]) {
                errors[layerName] = [message];
              } else {
                errors[layerName].push(message);
              }
            }
          } else {
            resData = shp.combine([
              shp.parseShp(data[layerName].shp, data[layerName].prj),
              shp.parseDbf(data[layerName].dbf),
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

            console.log(`-> Layer '${layerName}' dropped`);

            _view.dispatchEvent({
              type: 'file-dropped',
              name: layerName,
              data: geoJson,
              style,
            });
          });
        }

        if (nbFileLoaded === files.length && Object.keys(errors).length > 0) {
          const error = [];
          Object.keys(errors).forEach((layer) => {
            error.push(new Error(` ${[`Adding ${layer}`, ...errors[layer]].join('\n    -> ')}\n`));
          });

          _view.dispatchEvent({
            type: 'error',
            error,
          });
        }
      };
      switch (fileMtd.type) {
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
          if (nbFileLoaded === files.length && Object.keys(errors).length > 0) {
            const error = [];
            Object.keys(errors).forEach((layer) => {
              error.push(new Error(` ${[`Adding ${layer}`, ...errors[layer]].join('\n    -> ')}\n`));
            });

            this.view.dispatchEvent({
              type: 'error',
              error,
            });
          }
      }
    }
  }
}
export default Viewer;
