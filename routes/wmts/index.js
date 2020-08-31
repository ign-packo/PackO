const debug = require('debug')('wmts');
const debugFeatureInfo = require('debug')('wmts:GetFeatureInfo');
const debugGetTile = require('debug')('wmts:GetTile');
const fs = require('fs');
const router = require('express').Router();
const { matchedData, query } = require('express-validator');
const Jimp = require('jimp');
const path = require('path');
const GeoTIFF = require('geotiff');

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
      // On trouve le paquet à utiliser
      const NBTILES = 16;
      let PQROW = Math.trunc(TILEROW / NBTILES);
      let PQCOL = Math.trunc(TILECOL / NBTILES);
      const url = path.join(global.dir_cache, TILEMATRIX, `${PQROW}`, `${PQCOL}`, `${LAYER}.tif`);

      // Version utilisant les tuiles
      let x = TILECOL % NBTILES;
      let y = TILEROW % NBTILES;
      const pool = new GeoTIFF.Pool();
      
      // Version sans les tuiles
      // On definie la zone de l'image a charger
      // let left = (TILECOL % NBTILES) * 256;
      // let top = (TILEROW % NBTILES) * 256;
      // let right = left + 256;
      // let bottom = top + 256;

      // Creation d'un buffer Jimp
      new Jimp(256, 256, 0x000000ff, (err, jimp_image) => {
        // ouverture de l'image GeoTiff tuilée
        GeoTIFF.fromFile(url).then(tiff => {
          tiff.getImage().then(image => {

            // Version utilisant les tuiles
            let sample;
            image.getTileOrStrip(x, y, sample, pool).then((tile) => {
              let uint8View = new Uint8Array(tile.data);
              uint8View.forEach((item, index) => {
                jimp_image.bitmap.data[Math.round(index/3)*4 + index%3] = item;
              });
              // On exporte dans le format demande
              jimp_image.getBuffer(mime, (err2, buffer) => { 
                res.send(buffer); 
              });
            });

            // Version sans les tuiles
            // image.readRasters({ window: [left, top, right, bottom]}).then( data => {
            //   // Mise a jour du buffer avec les valeurs chargees
            //   // debugFeatureInfo(left, top, right, bottom);
            //   // debugFeatureInfo(url);
            //   // debugGetTile(data);
            //   // for (let index = 0; index < 256*256; index++) {
            //   //   jimp_image.bitmap.data[4*index] = data[0][index];
            //   //   jimp_image.bitmap.data[4*index+1] = data[1][index];
            //   //   jimp_image.bitmap.data[4*index+2] = data[2][index];
            //   // }
            //   data[0].forEach((item, index) => {
            //     jimp_image.bitmap.data[4*index] = item;
            //   });
            //   data[1].forEach((item, index) => {
            //     jimp_image.bitmap.data[4*index+1] = item;
            //   });
            //   data[2].forEach((item, index) => {
            //     jimp_image.bitmap.data[4*index+2] = item;
            //   });
            //   // debugGetTile(jimp_image.bitmap);
            //   // On exporte dans le format demande
            //   jimp_image.getBuffer(mime, (err2, buffer) => { 
            //     res.send(buffer); 
            //   });
            // });
          });
        }).catch( err2 => {
          debugGetTile('erreur dans le chargement de :', url, err2);
          // On exporte dans le format demande
          jimp_image.getBuffer(mime, (err2, buffer) => { 
            res.send(buffer); 
          });
        });
      });
    // GetFeatureInfo
    } else if (REQUEST === 'GetFeatureInfo') {
      debug('~~~GetFeatureInfo');
      debugFeatureInfo(LAYER, TILEMATRIX, TILEROW, TILECOL, I, J);
      // On trouve le paquet à utiliser
      const NBTILES = 16;
      let PQROW = Math.trunc(TILEROW / NBTILES);
      let PQCOL = Math.trunc(TILECOL / NBTILES);
      const url = path.join(global.dir_cache, TILEMATRIX, `${PQROW}`, `${PQCOL}`, `${LAYER}.tif`);
      // Version utilisant les tuiles
      let x = TILECOL % NBTILES;
      let y = TILEROW % NBTILES;
      const pool = new GeoTIFF.Pool();
      // ouverture de l'image GeoTiff tuilée
      GeoTIFF.fromFile(url).then(tiff => {
        tiff.getImage().then(image => {
          let sample;
          image.getTileOrStrip(x, y, sample, pool).then((tile) => {
            let uint8View = new Uint8Array(tile.data);
            let index = parseInt(I, 10) + parseInt(J, 10) * 256
            const out = {
              color: [uint8View[3*index],
                uint8View[3*index + 1],
                uint8View[3*index + 2]],
            };
            debugFeatureInfo(out);
            if ((out.color[0] in req.app.cache_mtd)
            && (out.color[1] in req.app.cache_mtd[out.color[0]])
            && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
              out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
            } else {
              out.cliche = 'unknown';
            }
            res.status(200).send(JSON.stringify(out));
          });
        });
      });
    }
  });

module.exports = router;
