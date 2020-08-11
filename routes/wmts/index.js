const debug = require('debug')('wmts');
const debugFeatureInfo = require('debug')('wmts:GetFeatureInfo');
const debugGetTile = require('debug')('wmts:GetTile');
const router = require('express').Router();
const { matchedData, query } = require('express-validator');
const Jimp = require('jimp');
const path = require('path');

const validateParams = require('../../paramValidation/validateParams');

router.get('/wmts',
  (req, res, next) => {
    debug(req.query);
    // debug('body:', req.body);
    next();
  }, [
    query('SERVICE')
      .exists().withMessage('le parametre SERVICE est requis')
      .isIn(['WMTS', 'WMS'])
      .withMessage((SERVICE) => (`SERVICE '${SERVICE}' not supported`)),
    query('REQUEST')
      .exists().withMessage('le parametre REQUEST est requis')
      .isIn(['GetCapabilities', 'GetTile', 'GetFeatureInfo'])
      .withMessage((REQUEST) => (`REQUEST '${REQUEST}' not supported`)),
    query('VERSION')
      .optional()
      .matches(/^\d+(.\d+)*$/i).withMessage('VERSION'),
    query('LAYER').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage('le parametre LAYER est requis'),
    query('TILEMATRIX').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage('le parametre TILEMATRIX est requis'),
    query('TILEROW').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage('le parametre TILEROW est requis'),
    query('TILECOL').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage('le parametre TILECOL est requis'),
    query('FORMAT').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage('le parametre FORMAT est requis')
      .isIn(['image/png', 'image/jpeg'])
      .withMessage((FORMAT) => (`format ${FORMAT} not supported`)),
    query('I').if(query('REQUEST').isIn(['GetFeatureInfo'])).exists().withMessage('le parametre I est requis'),
    query('J').if(query('REQUEST').isIn(['GetFeatureInfo'])).exists().withMessage('le parametre J est requis'),
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
      res.sendFile('Capabilities.xml', { root: path.join(global.dir_cache) });

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
      const url = path.join(global.dir_cache, TILEMATRIX, TILEROW, TILECOL, `${LAYER}.png`);
      Jimp.read(url, (err, image) => {
        if (err) {
          res.status(200).send('{"color":[0,0,0], "cliche":"unknown"}');
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
            out.cliche = 'unknown';
          }
          // res.sendFile('FeatureInfo.xml', { root: path.join('cache') });
          res.status(200).send(JSON.stringify(out));
        }
      });
    }
  });

module.exports = router;
