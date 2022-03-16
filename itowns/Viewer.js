// /* global setupLoadingScreen */
import * as itowns from 'itowns';
// import * as THREE from 'three';
import shp from 'shpjs';

// import Menu from './Menu';
// import View from './View';

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

// let alertUncheckedColor = '';
// let alertCheckedColor = '';
// let alertValidatedColor = '';

// function initAlertColor() {
//   Array.from(document.styleSheets).forEach((sheet) => {
//     Array.from(sheet.cssRules).forEach((rule) => {
//       if (rule.selectorText === '.alertUnchecked') {
//         alertUncheckedColor = rule.style.color;
//       } else if (rule.selectorText === '.alertChecked') {
//         alertCheckedColor = rule.style.color;
//       } else if (rule.selectorText === '.alertValidated') {
//         alertValidatedColor = rule.style.color;
//       }
//     });
//   });
// }

// initAlertColor();

// function coloringAlerts(properties) {
//   if (properties.status === false) {
//     return alertCheckedColor;
//   }
//   if (properties.status === true) {
//     return alertValidatedColor;
//   }
//   return alertUncheckedColor;
// }

class Viewer {
  constructor(viewerDiv, view, menuGlobe, api) {
    this.viewerDiv = viewerDiv;
    this.view = view;
    this.api = api;
    this.menuGlobe = menuGlobe;

    // this.crs = {};
    // this.overviews = {};
    // this.view = null;

    // this.x = 0;
    // this.y = 0;

    // this.resolLvMax = 0;
    // this.resolLvMin = 0;
    // this.layerIndex = {
    //   Ortho: 1,
    //   Opi: 2,
    //   Graph: 0,
    //   Contour: 3,
    //   Patches: 4,
    // };
    // this.oldStyle = {};
  }

  // createView(overviews) {
  //   this.overviews = overviews;

  //   this.view = new View(this.viewerDiv, overviews);

  //   // menuGlobe
  //   this.menuGlobe = new Menu(this.viewerDiv.id, this);
  // }

  centerCameraOn(coord = { x: this.view.x0, y: this.view.y0 }) {
    // bug itowns...
    // itowns.CameraUtils.animateCameraToLookAtTarget( ... )
    itowns.CameraUtils.transformCameraToLookAtTarget(
      this.view,
      this.view.camera.camera3D,
      {
        coord: new itowns.Coordinates(this.view.crs, coord.x, coord.y),
        heading: 0,
      },
    );
  }

  zoomOut() {
    if ((this.view.getPixelsToMeters() * 2) < this.view.resolLvMin) {
      this.view.camera.camera3D.zoom *= 0.5;
      this.view.camera.camera3D.updateProjectionMatrix();
      this.view.notifyChange(this.view.camera.camera3D);
      this.updateScaleWidget();
    }
  }

  zoomIn() {
    if ((this.view.getPixelsToMeters() / 2) > this.view.resolLvMax) {
      this.view.camera.camera3D.zoom *= 2;
      this.view.camera.camera3D.updateProjectionMatrix();
      this.view.notifyChange(this.view.camera.camera3D);
      this.updateScaleWidget();
    }
  }

  // fonction permettant d'afficher la valeur de l'echelle et du niveau de dezoom
  updateScaleWidget() {
    const { maxGraphDezoom } = this.view;

    let distance = this.view.getPixelsToMeters(200);
    let unit = 'm';
    this.dezoom = Math.fround(distance / (200 * this.view.resolution));
    if (distance >= 1000) {
      distance /= 1000;
      unit = 'km';
    }
    if (distance <= 1) {
      distance *= 100;
      unit = 'cm';
    }
    document.getElementById('spanZoomWidget').innerHTML = this.dezoom <= 1 ? `zoom: ${1 / this.dezoom}` : `zoom: 1/${this.dezoom}`;
    document.getElementById('spanScaleWidget').innerHTML = `${distance.toFixed(2)} ${unit}`;
    document.getElementById('spanGraphVisibWidget').classList.toggle('not_displayed', this.dezoom > maxGraphDezoom);
  }

  // cleanUpExtraLayers(menuGlobe) {
  //   // Clean up of all the extra layers
  //   const listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
  //   listColorLayer.forEach((layerName) => {
  //     if (!['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].includes(layerName)) {
  //       this.view.removeLayer(layerName);
  //       menuGlobe.removeLayersGUI(layerName);
  //       delete this.view.layerIndex[layerName];
  //     }
  //   });
  // }

  // refresh(layerList) {
  //   const layerNames = [];
  //   layerList.forEach((layer) => {
  //     layerNames.push(typeof layer === 'string' ? layer : layer.name);
  //   });

  //   layerNames.forEach((layerName) => {
  //     let newLayer;
  //     let config = {};

  //     const layer = {};
  //     layer.config = {};

  //     if (this.view.getLayerById(layerName)) {
  //       // la couche existe avant le refresh

  //       newLayer = this.view.getLayerById(layerName);
  //       config = {
  //         source: newLayer.source,
  //         transparent: newLayer.transparent,
  //         // opacity: newLayer.opacity,
  //         style: newLayer.style,
  //         zoom: newLayer.zoom,
  //       };

  //       if (newLayer.source.isVectorSource) {
  //         // Attendre itowns pour evolution ?
  //         config.source = new itowns.FileSource({
  //           url: newLayer.source.url,
  //           fetcher: itowns.Fetcher.json,
  //           crs: newLayer.source.crs,
  //           parser: itowns.GeoJsonParser.parse,
  //         });

  //         if (this.oldStyle[layerName]) {
  //           config.style = this.oldStyle[layerName];
  //         }
  //         if (newLayer.isAlert === true) {
  //           this.oldStyle[layerName] = newLayer.style.clone();
  //           /* eslint-disable no-param-reassign */
  //           config.style.fill.color = coloringAlerts;
  //           config.style.point.color = coloringAlerts;
  //           config.style.stroke.color = coloringAlerts;
  //           /* eslint-enable no-param-reassign */
  //         }
  //       }
  //       this.view.removeLayer(layerName);
  //     } else {
  //       // nouvelle couche
  //       [newLayer] = layerList.filter((l) => l.name === layerName);
  //       if (newLayer.type === 'raster') {
  //         config.source = new itowns.WMTSSource({
  //           url: newLayer.url,
  //           crs: newLayer.crs ? newLayer.crs : this.view.crs,
  //           format: 'image/png',
  //           name: layerName !== 'Contour' ? layerName.toLowerCase() : 'graph',
  //           tileMatrixSet: this.overviews.identifier,
  //           tileMatrixSetLimits:
  //             (layerName === 'Contour') || (layerName === 'Graph')
  //               ? this.overviews.dataSet.limitsForGraph : this.overviews.dataSet.limits,
  //         });
  //       } else if (newLayer.type === 'vector') {
  //         config.source = new itowns.FileSource({
  //           url: newLayer.url,
  //           fetcher: itowns.Fetcher.json,
  //           crs: newLayer.crs ? newLayer.crs : this.view.crs,
  //           parser: itowns.GeoJsonParser.parse,
  //         });

  //         config.style = new itowns.Style(newLayer.style);
  //         config.zoom = {
  //           // min: this.overviews.dataSet.level.min,
  //           min: layerName === 'Patches' ? this.zoomMinPatch : this.overviews.dataSet.level.min,
  //           max: this.overviews.dataSet.level.max,
  //         };
  //       }

  //       if (this.layerIndex[layerName] === undefined) {
  //         this.layerIndex[layerName] = Math.max(...Object.values(this.layerIndex)) + 1;
  //       }
  //     }

  //     // Dans les 2 cas
  //     config.opacity = newLayer.opacity;
  //     const colorLayer = new itowns.ColorLayer(
  //       layerName,
  //       config,
  //     );

  //     colorLayer.visible = newLayer.visible;

  //     if (layerName === 'Contour') {
  //       colorLayer.effect_type = itowns.colorLayerEffects.customEffect;
  //       colorLayer.effect_parameter = 1.0;
  //       colorLayer.magFilter = THREE.NearestFilter;
  //       colorLayer.minFilter = THREE.NearestFilter;
  //     }

  //     this.view.addLayer(colorLayer);

  //     if (colorLayer.vectorId === undefined) {
  //       colorLayer.vectorId = newLayer.vectorId;
  //     }
  //     if (colorLayer.isAlert === undefined) {
  //       colorLayer.isAlert = newLayer.isAlert;
  //     }

  //     itowns.ColorLayersOrdering.moveLayerToIndex(
  //       this.view,
  //       layerName,
  //       this.layerIndex[layerName] === undefined
  //         ? Math.max(...Object.values(this.layerIndex)) + 1 : this.layerIndex[layerName],
  //     );
  //   });
  // }

  /* eslint-disable no-underscore-dangle */
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

    let data = {};
    // Read each file
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      let fileMtd = extensionsMap[file.name.split('.').pop().toLowerCase()];
      let layerName = file.name.split('.').slice(0, -1).join('.');
      layerName = layerName.charAt(0).toUpperCase() + layerName.slice(1);

      if (!fileMtd) {
        errors.push(new Error(`Type of file (.${file.name.split('.').pop().toLowerCase()}) not supported.\n`));
        fileMtd = {};
        // throw new Error('Type of file not supported, please add it using DragNDrop.register');
      }

      const listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
      if (listColorLayer.includes(layerName)) {
        fileMtd = {};
        errors.push(new Error('A layer with the same name has already been added.\n'));
        // throw new Error('A layer with the same name has already been added');
      }

      const fileReader = new FileReader();
      const _view = this.view;

      /* eslint-disable-next-line no-loop-func */
      fileReader.onload = function onload(e) {
        const dataLoaded = e.target.result;
        let resData;
        nbFileLoaded += 1;
        if (fileMtd.format === _GEOJSON) {
          data = JSON.parse(dataLoaded);
          if (!data.type || data.type !== 'FeatureCollection' || !data.features) {
            errors.push(new Error('File is not a valid geoJson'));
          } else {
            resData = data;
          }
        } else if (fileMtd.format === _SHP) {
          data[fileMtd.extension] = dataLoaded;
          ListFile[layerName].nbFileLoaded += 1;
          if (ListFile[layerName].nbFileLoaded < 4) {
            if (ListFile[layerName].nbFileLoaded === ListFile[layerName].nbFileDropped) {
              errors.push(new Error('Missing file. (A shapefile must be added with the .shp, the .shx, the .prj and the .dbf)\n'));
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

            _view.dispatchEvent({
              type: 'file-dropped',
              name: layerName,
              data: geoJson,
              style,
            });
          });
        }

        if (nbFileLoaded === files.length && errors.length > 0) {
          _view.dispatchEvent({
            type: 'error',
            msg: errors,
          });
          // throw errors;
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
          if (nbFileLoaded === files.length && errors.length > 0) {
            this.view.dispatchEvent({
              type: 'error',
              msg: errors,
            });
            return;
            // throw errors;
          }
          // throw new Error('Type of file not supported, please add it using DragNDrop.register');
      }
    }
  }
  /* eslint-enable no-underscore-dangle */

  // removeVectorLayer(layerName) {
  //   if (layerName === undefined) return;
  //   const layerId = this.view.getLayerById(layerName).vectorId;
  //   this.view.removeLayer(layerName);
  //   delete this.layerIndex[layerName];
  //   this.view.dispatchEvent({
  //     type: 'vectorLayer-removed',
  //     layerId,
  //     layerName,
  //   });
  // }

  // highlightSelectedFeature(alert) {
  //   const alertFC = alert.featureCollection;
  //   const featureGeometry = alertFC.features[0].geometries[alert.featureIndex];
  //   const { type } = alertFC.features[0];
  //   const layerFeatureSelected = this.view.getLayerById('selectedFeature');
  //   if (layerFeatureSelected) {
  //     this.view.removeLayer('selectedFeature');
  //   }
  //   const layerTest = this.view.getLayerById(alert.layerName);
  //   const newFeatureCollec = new itowns.FeatureCollection(layerTest);

  //   const feature = alertFC.requestFeatureByType(type);
  //   const newFeature = newFeatureCollec.requestFeatureByType(type);
  //   const newFeatureGeometry = newFeature.bindNewGeometry();

  //   const coord = new itowns.Coordinates(newFeatureCollec.crs, 0, 0, 0);

  //   const vector = new THREE.Vector2();
  //   const vector3 = new THREE.Vector3();
  //   const { count, offset } = featureGeometry.indices[0];

  //   newFeatureGeometry.startSubGeometry(count, newFeature);
  //   const { vertices } = feature;
  //   for (let v = offset * 2; v < (offset + count) * 2; v += 2) {
  //     vector.fromArray(vertices, v);
  //     vector3.copy(vector).setZ(0).applyMatrix4(alertFC.matrixWorld);
  //     coord.x = vector3.x;
  //     coord.y = vector3.y;
  //     newFeatureGeometry.pushCoordinates(coord, newFeature);
  //   }

  //   newFeatureGeometry.updateExtent();

  //   const newColorLayer = new itowns.ColorLayer('selectedFeature', {
  //     // Use a FileSource to load a single file once
  //     source: new itowns.FileSource({
  //       features: newFeatureCollec,
  //     }),
  //     transparent: true,
  //     opacity: 0.7,
  //     zoom: {
  //       min: this.overviews.dataSet.level.min,
  //       max: this.overviews.dataSet.level.max,
  //     },
  //     style: new itowns.Style({
  //       stroke: {
  //         color: 'yellow',
  //         width: 5,
  //       },
  //       point: {
  //         color: '#66666600',
  //         radius: 7,
  //         line: 'yellow',
  //         width: 5,
  //       },
  //     }),
  //   });

  //   this.view.addLayer(newColorLayer);
  // }
}
export default Viewer;
