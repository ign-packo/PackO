/* eslint-disable no-underscore-dangle */
/* global itowns */
import proj4 from 'proj4';
/**
 * This module can be added to a web page or in a web application. It provides a
 * simple behavior where files can be drag and dropped onto a viewer. No
 * relationship between a type of file and the way it is read, parsed and
 * displayed are stored in the plugin. Use the method `register` to declare the
 * way a file is read, parsed and displayed.
 *
 *
 * @module DragNDrop
 *
 * @example
 * &lt;script src="js/DragNDrop.js">&lt;/script>
 * &lt;script type="text/javascript">
 *      var view = new itowns.GlobeView(document.getElementById('viewerDiv'));
 *
 *      DragNDrop.setView(view);
 *      DragNDrop.register('geojson', DragNDrop.JSON, itowns.GeoJsonParser.parse, DragNDrop.COLOR);
 *      DragNDrop.register('gpx', DragNDrop.XML, itowns.GpxParser.parse, DragNDrop.GEOMETRY);
 *      DragNDrop.register('shapefile', {
          shp: DragNDrop.BINARY,
          dbf: DragNDrop.BINARY,
          shx: DragNDrop.BINARY,
          prj: DragNDrop.TEXT,
        }, itowns.ShapefileParser.parse, DragNDrop.COLOR);
 * &lt;/script>
 *
 * @example
 * require('./js/itowns.js');
 * require('./plugins/DragNDrop.js');
 *
 * const view = new itowns.GlobeView(document.getElementById('viewerDiv'));
 *
 * DragNDrop.setView(view);
 * DragNDrop.register('geojson', DragNDrop.JSON, itowns.GeoJsonParser.parse, DragNDrop.COLOR);
 * DragNDrop.register('gpx', DragNDrop.XML, itowns.GpxParser.parse, DragNDrop.GEOMETRY);
 * DragNDrop.register('shapefile', {
      shp: DragNDrop.BINARY,
      dbf: DragNDrop.BINARY,
      shx: DragNDrop.BINARY,
      prj: DragNDrop.TEXT,
    }, itowns.ShapefileParser.parse, DragNDrop.COLOR);
 */

const DragNDrop = (function _DnD() {
  // TYPE
  const _TEXT = 1;
  const _JSON = 2;
  const _XML = 3;
  const _BINARY = 4;
  const _IMAGE = 5;

  // MODE
  const _COLOR = 10;
  const _GEOMETRY = 11;

  const extensionsMap = {};
  const filetypes = {};

  let _view;

  function addFiles(event, files) {
    event.preventDefault();
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
    let resData;
    // Read each file
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      let extension = extensionsMap[file.name.split('.').pop().toLowerCase()];
      const layerName = file.name.split('.').slice(0, -1).join('.');

      if (!extension) {
        extension = {};
        errors.push(new Error('Type of file not supported, please add it using DragNDrop.register'));
        // throw new Error('Type of file not supported, please add it using DragNDrop.register');
      }

      const listColorLayer = _view.getLayers((l) => l.isColorLayer).map((l) => l.id);
      if (listColorLayer.includes(layerName)) {
        extension = {};
        errors.push(new Error('A layer with the same name has already been added'));
        // throw new Error('A layer with the same name has already been added');
      }

      const fileReader = new FileReader();
      // eslint-disable-next-line no-loop-func
      fileReader.onload = async function onload(e) {
        const dataLoaded = e.target.result;
        nbFileLoaded += 1;
        let parse = true;

        const crs = extension.mode === _GEOMETRY
          ? _view.referenceCrs : _view.tileLayer.extent.crs;
        const options = {
          out: {
            crs,
            buildExtent: true,
            mergeFeatures: true,
            structure: (extension.mode === _GEOMETRY ? '3d' : '2d'),
            forcedExtentCrs: crs !== 'EPSG:4978' ? crs : 'EPSG:4326',
          },
        };

        if (extension.type === _JSON) {
          data = JSON.parse(dataLoaded);
          resData = data;
        } else if (extension.type === _XML) {
          data = new window.DOMParser().parseFromString(data, 'text/xml');
          resData = data;
        } else if (extension.filetype
          && filetypes[extension.filetype].includes(extension.extension)) {
          data[extension.extension] = dataLoaded;
          ListFile[layerName].nbFileLoaded += 1;
          if (ListFile[layerName].nbFileLoaded < filetypes[extension.filetype].length) {
            if (ListFile[layerName].nbFileLoaded === ListFile[layerName].nbFileDropped) {
              errors.push(new Error('missing file'));
              // throw new Error('missing file');
            }
            parse = false;
          } else {
            resData = await extension.parser(data, {
              geojson: true,
            });
            resData.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } };
            // options.in = {
            //   crs: 'EPSG:4326',
            // };
            // options.out.crs = 'EPSG:2154';
          }
        }

        // console.log(data);

        if (data && parse) {
          console.log(' ready for PARSE');

          console.log(resData);
          console.log(options);

          // const crs = extension.mode === _GEOMETRY
          //   ? _view.referenceCrs : _view.tileLayer.extent.crs;
          // itowns.GeoJsonParser.parse(resData, {
          // // in: {
          // //   crs: 'EPSG:2154',
          // // },
          //   out: {
          //     crs,
          //     buildExtent: true,
          //     mergeFeatures: true,
          //     structure: (extension.mode === _GEOMETRY ? '3d' : '2d'),
          //     forcedExtentCrs: crs !== 'EPSG:4978' ? crs : 'EPSG:4326',
          //   },
          itowns.GeoJsonParser.parse(resData, options).then((features) => {
            console.log('PARSER2/default');
            console.log(features);
            const source = new itowns.FileSource({
              features,
              // crs: 'EPSG:4326',
            });

            const randomColor = Math.round(Math.random() * 0xffffff);

            let layer;
            let style;
            if (extension.mode === _COLOR) {
              style = {
                fill: {
                  color: `#${randomColor.toString(16)}`,
                  opacity: 0.7,
                },
                stroke: {
                  color: `#${randomColor.toString(16)}`,
                },
              };
              layer = new itowns.ColorLayer(layerName, {
                transparent: true,
                style,
                source,
              });
            } else if (extension.mode === _GEOMETRY) {
              layer = new itowns.FeatureGeometryLayer(
                layerName,
                {
                  style: new itowns.Style({
                    fill: {
                      color: 'red',
                      extrusion_height: 200,
                    },
                  }),
                  source,
                  opacity: 0.7,
                },
              );
            } else {
              throw new Error('Mode of file not supported, please add it using DragNDrop.register');
            }
            console.log("CRS:")

            console.log(resData.crs)
            _view.addLayer(layer).then(_view.dispatchEvent(
              {
                type: 'layer-dropped',
                layer: {
                  name: layer.id,
                  style,
                  crs: resData.crs,
                },
                // layerId: layer.id,
                data: resData,
              },
            ));

            // const extent = features.extent.clone();
            // // Transform local extent to data.crs projection.
            // if (extent.crs === features.crs) {
            //   extent.applyMatrix4(features.matrixWorld);
            // }

            // // Move the camera
            // itowns.CameraUtils.transformCameraToLookAtTarget(
            //   _view,
            //   _view.camera.camera3D,
            //   extent,
            // );
          });
        }

        if (nbFileLoaded === files.length && errors.length > 0) {
          throw errors;
        }
      };
      switch (extension.type) {
        case _TEXT:
        case _JSON:
        case _XML:
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

  // Listen to drag and drop actions
  document.addEventListener('dragenter', (e) => { e.preventDefault(); }, false);
  document.addEventListener('dragover', (e) => { e.preventDefault(); }, false);
  document.addEventListener('dragleave', (e) => { e.preventDefault(); }, false);
  document.addEventListener('drop', (e) => { addFiles(e, e.dataTransfer.files); }, false);
  document.addEventListener('paste', (e) => { addFiles(e, e.clipboardData.files); }, false);

  return {
    TEXT: _TEXT,
    JSON: _JSON,
    XML: _XML,
    BINARY: _BINARY,
    IMAGE: _IMAGE,

    COLOR: _COLOR,
    GEOMETRY: _GEOMETRY,

    /**
         * Register a type of file to read after a drag and drop on the viewer.
         * The file(s) will be processed following its extension and instructions
         * given here.
         *
         * @param {string} filetype - The type of file to register. Each file
         * dropped ending with the extensions register in type will follow the instructions given
         * by the others parameters of this function.
         * @param {number} type - The extensions to register linked with a type file. Can be
         * `DragNDrop.TEXT` (equivalent to `Fetcher.text`), `DragNDrop.JSON`
         * (equivalent to `Fetcher.json`), `DragNDrop.BINARY` (equivalent to
         * `Fetcher.arrayBuffer`), `DragNDrop.IMAGE` (equivalent to
         * `Fetcher.texture`) or  `DragNDrop.XML` (equivalent to `Fetcher.xml`).
         * @param {Function} parser - The method to parse the content of the
         * added file.
         * @param {number} mode - Choose the mode the file is displayed: either
         * `DragNDrop.COLOR` (equivalent to a `ColorLayer`) or
         * `DragNDrop.GEOMETRY` (equivalent to a `GeometryLayer`).
         *
         * @memberof module:DragNDrop
         */
    register: function _(filetype, type, parser, mode) {
      if ((typeof type) === 'object') {
        Object.keys(type).forEach((extension) => {
          extensionsMap[extension.toLowerCase()] = {
            extension: extension.toLowerCase(),
            filetype: filetype.toLowerCase(),
            type: type[extension.toLowerCase()],
            parser,
            mode,
          };
        });
        filetypes[filetype] = Object.keys(type);
      } else {
        extensionsMap[filetype.toLowerCase()] = {
          extension: filetype.toLowerCase(),
          filetype: filetype.toLowerCase(),
          type,
          parser,
          mode,
        };
      }
    },

    /**
         * The DragNDrop plugin needs to be binded to a view. Specified it using
         * this method.
         *
         * @param {View} view - The view to bind to the DragNDrop interface.
         *
         * @memberof module:DragNDrop
         */
    setView: function _(view) {
      _view = view;
    },
  };
}());

export default DragNDrop;
