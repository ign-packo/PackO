import * as itowns from 'itowns';
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

class Viewer {
  constructor(view, menuGlobe, api) {
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
  }

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
      }

      const listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
      if (listColorLayer.includes(layerName)) {
        fileMtd = {};
        errors.push(new Error('A layer with the same name has already been added.\n'));
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
}
export default Viewer;
