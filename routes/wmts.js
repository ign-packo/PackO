const debug = require('debug')('wmts');
const debugFeatureInfo = require('debug')('wmts:GetFeatureInfo');
const debugGetTile = require('debug')('wmts:GetTile');
const router = require('express').Router();
const { matchedData, query } = require('express-validator');
const Jimp = require('jimp');
const path = require('path');

const fs = require('fs');
const xml2js = require('xml2js');
const proj4 = require('proj4');
const rok4 = require('../rok4.js');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/wmts', [
  query('SERVICE')
    .exists().withMessage(createErrMsg.missingParameter('SERVICE'))
    .isIn(['WMTS', 'WMS'])
    .withMessage((SERVICE) => (`'${SERVICE}': unsupported SERVICE value`)),
  query('REQUEST')
    .exists().withMessage(createErrMsg.missingParameter('REQUEST'))
    .isIn(['GetCapabilities', 'GetTile', 'GetFeatureInfo'])
    .withMessage((REQUEST) => (`'${REQUEST}': unsupported REQUEST value`)),
  query('VERSION')
    .if(query('SERVICE').isIn(['WMTS']))
    .if(query('REQUEST').isIn(['GetCapabilities']))
    .exists()
    .withMessage(createErrMsg.missingParameter('VERSION'))
    .matches(/^\d+(.\d+)*$/i)
    .withMessage(createErrMsg.invalidParameter('VERSION'))
    .if(query('SERVICE').isIn(['WMS', 'WMTS']))
    .if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
    .exists()
    .withMessage(createErrMsg.missingParameter('VERSION'))
    .matches(/^\d+(.\d+)*$/i)
    .withMessage(createErrMsg.invalidParameter('VERSION')),
  query('LAYER').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
    .exists().withMessage(createErrMsg.missingParameter('LAYER'))
    .isIn(['ortho', 'graph', 'opi'])
    .withMessage((LAYER) => (`'${LAYER}': unsupported LAYER value`)),
  query('Name').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).if(query('LAYER').isIn(['opi']))
    .exists()
    .withMessage(createErrMsg.missingParameter('Name'))
    .optional(),
  query('STYLE').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
    .exists().withMessage(createErrMsg.missingParameter('STYLE'))
    .isIn(['normal'])
    .withMessage((STYLE) => (`'${STYLE}': unsupported STYLE value`)),
  query('FORMAT').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage(createErrMsg.missingParameter('FORMAT'))
    .isIn(['image/png', 'image/jpeg'])
    .withMessage((FORMAT) => (`'${FORMAT}': unsupported FORMAT value`)),
  query('INFOFORMAT').if(query('REQUEST').isIn(['GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('INFOFORMAT')),
  query('TILEMATRIXSET').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
    .exists().withMessage(createErrMsg.missingParameter('TILEMATRIXSET'))
    .custom((TILEMATRIXSET, { req }) => TILEMATRIXSET === req.app.overviews.identifier)
    .withMessage((TILEMATRIXSET) => (`'${TILEMATRIXSET}': unsupported TILEMATRIXSET value`)),
  query('TILEMATRIX').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('TILEMATRIX')),
  query('TILEROW').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
    .exists().withMessage(createErrMsg.missingParameter('TILEROW'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('TILEROW')),
  query('TILECOL').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
    .exists().withMessage(createErrMsg.missingParameter('TILECOL'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('TILECOL')),
  query('I').if(query('REQUEST').isIn(['GetFeatureInfo']))
    .exists().withMessage(createErrMsg.missingParameter('I'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('I')),
  query('J').if(query('REQUEST').isIn(['GetFeatureInfo']))
    .exists().withMessage(createErrMsg.missingParameter('J'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('J')),
], validateParams,
(req, res) => {
  const { overviews } = req.app;
  const params = matchedData(req);
  // const { SERVICE } = params;
  const { REQUEST } = params;
  //  const { VERSION } = params;
  const { LAYER, Name } = params;
  // const STYLE = params.STYLE;
  const { FORMAT } = params;
  // const TILEMATRIXSET = params.TILEMATRIXSET;
  const { TILEMATRIX } = params;
  const { TILEROW } = params;
  const { TILECOL } = params;
  const { I } = params;
  const { J } = params;

  // GetCapabilities
  if (REQUEST === 'GetCapabilities') {
    debug('~~~GetCapabilities');

    const tileMatrix = [];
    const tileMatrixLimit = [];

    // const resLevelMax = overviews.resolution;
    const levelMin = overviews.dataSet.level.min;
    const levelMax = overviews.dataSet.level.max;

    for (let level = levelMin; level < levelMax + 1; level += 1) {
      const resolution = overviews.resolution * 2 ** (overviews.level.max - level);
      const scaleDenominator = resolution / 0.00028;

      tileMatrixLimit.push({
        TileMatrix: level,
        MinTileRow: overviews.dataSet.limits[level].MinTileRow,
        MaxTileRow: overviews.dataSet.limits[level].MaxTileRow,
        MinTileCol: overviews.dataSet.limits[level].MinTileCol,
        MaxTileCol: overviews.dataSet.limits[level].MaxTileCol,
      });

      const MatrixWidth = Math.ceil(
        (overviews.crs.boundingBox.xmax - overviews.crs.boundingBox.xmin)
           / (overviews.tileSize.width * resolution),
      );
      const MatrixHeight = Math.ceil(
        (overviews.crs.boundingBox.ymax - overviews.crs.boundingBox.ymin)
           / (overviews.tileSize.height * resolution),
      );

      tileMatrix.push({
        'ows:Identifier': level,
        ScaleDenominator: scaleDenominator,
        TopLeftCorner: `${overviews.crs.boundingBox.xmin} ${overviews.crs.boundingBox.ymax}`,
        TileWidth: overviews.tileSize.width,
        TileHeight: overviews.tileSize.height,
        MatrixWidth,
        MatrixHeight,
      });
    }

    const listOpi = Object.keys(overviews.list_OPI);

    const extra = {
      ortho: {
        key: 'InfoFormat',
        value: 'application/gml+xml; version=3.1',
      },
      graph: {
        key: 'InfoFormat',
        value: 'application/gml+xml; version=3.1',
      },
      opi: {
        key: 'Dimension',
        value: {
          'ows:Identifier': 'Name',
          'ows:title': 'opi name',
          'ows:abstract': "nom de l'opi",
          Default: listOpi[0],
          Value: listOpi,
        },
      },
    };
    const crs = `${overviews.crs.type}:${overviews.crs.code}`;
    proj4.defs(crs, overviews.crs.proj4Definition);
    const layers = [];
    ['ortho', 'graph', 'opi'].forEach((layerName) => layers.push({
      'ows:Title': layerName,
      'ows:Abstract': layerName,
      'ows:WGS84BoundingBox': {
        'ows:LowerCorner': proj4(crs, 'EPSG:4326', overviews.dataSet.boundingBox.LowerCorner).join(' '),
        'ows:UpperCorner': proj4(crs, 'EPSG:4326', overviews.dataSet.boundingBox.UpperCorner).join(' '),
      },
      'ows:Identifier': layerName,
      Style: {
        'ows:Title': 'Legende generique',
        'ows:Abstract': 'Fichier de legende generique',
        'ows:Keywords': { 'ows:Keyword': 'Defaut' },
        'ows:Identifier': 'normal',
        LegendeURL: {
          $: {
            format: 'image/jpeg',
            height: '200',
            maxScaleDenominator: '100000000',
            minScaleDenominator: '200',
            width: '200',
            'xlink:href': 'https://wxs.ign.fr/static/legends/LEGEND.jpg',
          },
        },
        $: {
          isDefault: 'true',
        },
      },
      Format: 'image/png',
      [extra[layerName].key]: extra[layerName].value,
      TileMatrixSetLink: {
        TileMatrixSet: overviews.identifier,
        TileMatrixSetLimits: { TileMatrixLimits: tileMatrixLimit },
      },
    }));

    const capabilitiesJson = {};
    capabilitiesJson.Capabilities = {
      $: {
        xmlns: 'http://www.opengis.net/wmts/1.0',
        'xmlns:gml': 'http://www.opengis.net/gml',
        'xmlns:ows': 'http://www.opengis.net/ows/1.1',
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        version: '1.0.0',
        'xsi:schemaLocation': 'http://www.opengis.net/wmts/1.0 http://schemas.opengis.net/wmts/1.0/wmtsGetCapabilities_response.xsd',
      },
      'ows:ServiceIdentification': {
        'ows:Title': 'Service WMTS',
        'ows:Abstract': 'Proto pour API Mosaiquage',
        'ows:Keywords': {
          'ows:Keyword': ['WMTS', 'Mosaiquage'],
        },
        'ows:ServiceType': 'OGC WMTS',
        'ows:ServiceTypeVersion': '1.0.0',
      },
      'ows:ServiceProvider': {
        'ows:ProviderName': 'IGN',
      },
      'ows:OperationsMetadata': {
        'ows:Operation': [],
      },
      Contents: {
        Layer: layers,
        TileMatrixSet: {
          'ows:Identifier': overviews.identifier,
          'ows:SupportedCRS': `${overviews.crs.type}:${overviews.crs.code}`,
          TileMatrix: tileMatrix,
        },
      },
    };

    const operations = [];
    ['GetCapabilities', 'GetTile', 'GetFeatureInfo'].forEach((operation) => operations.push(
      {
        $: {
          name: operation,
        },
        'ows:DCP': {
          'ows:HTTP': {
            'ows:Get': {
              $: {
                'xlink:href': `${req.app.urlApi}/wmts`,
              },
              'ows:Constraint': {
                $: {
                  name: 'GetEncoding',
                },
                'ows:AllowedValues': {
                  'ows:Value': 'KVP',
                },
              },
            },
          },
        },
      },
    ));
    capabilitiesJson.Capabilities['ows:OperationsMetadata']['ows:Operation'] = operations;

    const builder = new xml2js.Builder();
    const xml = builder.buildObject(capabilitiesJson);

    res.type('application/xml');
    res.send(xml);

    // GetTile
  } else if (REQUEST === 'GetTile') {
    debug('~~~GetTile');
    debugGetTile(LAYER, TILEMATRIX, TILEROW, TILECOL);
    let mime = null;
    const layerName = LAYER;
    if ((!FORMAT) || (FORMAT === 'image/png')) {
      mime = Jimp.MIME_PNG; // "image/png"
    } else if (FORMAT === 'image/jpeg') {
      mime = Jimp.MIME_JPEG; // "image/jpeg"
    }
    const tileRoot = rok4.getTileRoot(TILECOL, TILEROW, TILEMATRIX, overviews.pathDepth);
    let url = path.join(global.dir_cache, layerName, tileRoot.dirPath, tileRoot.fileName);
    if (LAYER === 'opi') {
      if (!Name) {
        url += `_${overviews.list_OPI[0]}`;
      } else {
        url += `_${Name}`;
      }
    }
    url += '.png';
    debug(url);
    Jimp.read(url, (err, image) => {
      new Promise((success, failure) => {
        if (err) {
          /* eslint-disable no-new */
          new Jimp(256, 256, 0x000000ff, (errJimp, img) => {
            if (errJimp) {
              failure(err);
            }
            success(img);
          });
        } else {
          success(image);
        }
      }).then((img) => {
        img.getBuffer(mime, (err2, buffer) => { res.send(buffer); });
      });
    });

    // GetFeatureInfo
  } else if (REQUEST === 'GetFeatureInfo') {
    debug('~~~GetFeatureInfo');
    debugFeatureInfo(LAYER, TILEMATRIX, TILEROW, TILECOL, I, J);
    const tileRoot = rok4.getTileRoot(TILECOL, TILEROW, TILEMATRIX, overviews.pathDepth);
    const url = path.join(global.dir_cache, 'graph', tileRoot.dirPath, `${tileRoot.fileName}.png`);

    if (!fs.existsSync(url)) {
      const erreur = new Error();
      erreur.msg = {
        status: 'out of bounds',
        errors: [{
          localisation: 'GetFeatureInfo',
          msg: 'out of bounds',
        }],
      };
      res.status(400).send(erreur.msg);
    } else {
      Jimp.read(url, (err, image) => {
        if (err) {
          const erreur = new Error();
          erreur.msg = {
            status: err,
            errors: [{
              localisation: 'Jimp.read()',
              msg: err,
            }],
          };
          res.status(500).send(erreur.msg);
        // res.status(200).send('{"color":[0,0,0], "cliche":"unknown"}');
        } else {
          let resCode = 200;
          const index = image.getPixelIndex(parseInt(I, 10), parseInt(J, 10));
          debugFeatureInfo('index: ', index);
          const out = {
            color: [image.bitmap.data[index],
              image.bitmap.data[index + 1],
              image.bitmap.data[index + 2]],
          };
          debugFeatureInfo(out);
          if ((out.color[0] in req.app.cache_mtd)
          && (out.color[1] in req.app.cache_mtd[out.color[0]])
          && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
            out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
          } else {
            out.cliche = 'missing';
            resCode = 201;
          }

          const testResponse = '<?xml version="1.0" encoding="UTF-8"?>'
                           + '<ReguralGriddedElevations xmlns="http://www.maps.bob/etopo2"'
                                                    + ' xmlns:gml="http://www.opengis.net/gml"'
                                                    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
                                                    + ' xsi:schemaLocation="http://www.maps.bob/etopo2  GetFeatureInfoExampleSchema.xsd">'
                             + '<featureMember>'
                               + `<${LAYER}>`
                                 + `<ortho>${out.cliche}</ortho>`
                                 + `<graph>${out.color}</graph>`
                                 + `<TileRow>${TILEROW}</TileRow>`
                                 + `<TileCol>${TILECOL}</TileCol>`
                                 + `<J>${J}</J>`
                                 + `<I>${I}</I>`
                               + `</${LAYER}>`
                             + '</featureMember>'
                           + '</ReguralGriddedElevations>';
          res.status(resCode).send(testResponse);
        }
      });
    }
  }
});

module.exports = router;
