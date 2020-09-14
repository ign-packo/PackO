const debug = require('debug')('wmts');
const debugFeatureInfo = require('debug')('wmts:GetFeatureInfo');
const debugGetTile = require('debug')('wmts:GetTile');
const router = require('express').Router();
const { matchedData, query } = require('express-validator');
const Jimp = require('jimp');
const path = require('path');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/wmts', [
  query('SERVICE')
    .exists().withMessage(createErrMsg.missingParameter('SERVICE'))
    .isIn(['WMTS', 'WMS'])
    .withMessage((SERVICE) => (`SERVICE '${SERVICE}' non supporté`)),
  query('REQUEST')
    .exists().withMessage(createErrMsg.missingParameter('REQUEST'))
    .isIn(['GetCapabilities', 'GetTile', 'GetFeatureInfo'])
    .withMessage((REQUEST) => (`REQUEST '${REQUEST}' non supporté`)),
  query('VERSION')
    .optional()
    .matches(/^\d+(.\d+)*$/i).withMessage(createErrMsg.invalidParameter('VERSION')),
  query('LAYER').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('LAYER')),
  query('STYLE').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('STYLE')),
  query('FORMAT').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage(createErrMsg.missingParameter('FORMAT'))
    .isIn(['image/png', 'image/jpeg'])
    .withMessage((FORMAT) => (`FORMAT '${FORMAT}' non supporté`)),
  query('INFOFORMAT').if(query('REQUEST').isIn(['GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('INFOFORMAT')),
  query('TILEMATRIXSET').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('TILEMATRIXSET')),
  query('TILEMATRIX').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('TILEMATRIX')),
  query('TILEROW').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('TILEROW')),
  query('TILECOL').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('TILECOL')),
  query('I').if(query('REQUEST').isIn(['GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('I')),
  query('J').if(query('REQUEST').isIn(['GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('J')),
], validateParams,
(req, res) => {
  const params = matchedData(req);
  // const { SERVICE } = params;
  const { REQUEST } = params;
  // const { VERSION } = params;
  const { LAYER } = params;
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
    res.type('application/xml');
    // debug(__dirname)
    res.sendFile('Capabilities_formatted.xml', { root: path.join(global.dir_cache) });

    // GetTile
  } else if (REQUEST === 'GetTile') {
    debug('~~~GetTile');
    debugGetTile(LAYER, TILEMATRIX, TILEROW, TILECOL);
    let mime = null;
    if ((!FORMAT) || (FORMAT === 'image/png')) {
      mime = Jimp.MIME_PNG; // "image/png"
    } else if (FORMAT === 'image/jpeg') {
      mime = Jimp.MIME_JPEG; // "image/jpeg"
    }
    const url = path.join(global.dir_cache, TILEMATRIX, TILEROW, TILECOL, `${LAYER}.png`);
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
    const url = path.join(global.dir_cache, TILEMATRIX, TILEROW, TILECOL, 'graph.png');

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
        res.status(500).send(erreur);
        // res.status(200).send('{"color":[0,0,0], "cliche":"unknown"}');
      } else {
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
        }
        // res.sendFile('FeatureInfo.xml', { root: path.join('cache') });
        // res.status(200).send(JSON.stringify(out));

        const testResponse = `<?xml version="1.0" encoding="UTF-8"?>
                              <ReguralGriddedElevations xmlns="http://www.maps.bob/etopo2"
                                                        xmlns:gml="http://www.opengis.net/gml"
                                                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                                                         xsi:schemaLocation="http://www.maps.bob/etopo2  GetFeatureInfoExampleSchema.xsd">
                                <featureMember>
                                  <${LAYER}>
                                    <ortho>${out.cliche}</ortho>
                                    <graph>${out.color}</graph>
                                    <TileRow>${TILEROW}</TileRow>
                                    <TileCol>${TILECOL}</TileCol>
                                    <J>${J}</J>
                                    <I>${I}</I>
                                  </${LAYER}>
                                </featureMember>
                              </ReguralGriddedElevations>`;
        res.status(200).send(testResponse);
      }
    });
  }
});

module.exports = router;
