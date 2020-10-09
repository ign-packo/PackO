const debug = require('debug')('graph');
const debugPatch = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { matchedData, query, body } = require('express-validator');
const jimp = require('jimp');
const PImage = require('pureimage');

const GJV = require('geojson-validation');
const validateParams = require('../paramValidation/validateParams');
const validator = require('../paramValidation/validator');
const createErrMsg = require('../paramValidation/createErrMsg');

const geoJsonAPatcher = [
  body('geoJSON')
    .exists().withMessage(createErrMsg.missingBody)
    .custom(GJV.isGeoJSONObject)
    .withMessage(createErrMsg.invalidBody('objet GeoJSON'))
    .custom(GJV.isFeatureCollection)
    .withMessage(createErrMsg.invalidBody('featureCollection')),
  body('geoJSON.type')
    .exists().withMessage(createErrMsg.missingParameter('type'))
    .isIn(['FeatureCollection'])
    .withMessage(createErrMsg.invalidParameter('type')),
  body('geoJSON.crs')
    .exists().withMessage(createErrMsg.missingParameter('crs'))
    .custom(validator.isCrs)
    .withMessage(createErrMsg.invalidParameter('crs')),
  body('geoJSON.features.*.geometry')
    .custom(GJV.isPolygon).withMessage(createErrMsg.InvalidEntite('geometry', 'polygon')),
  body('geoJSON.features.*.properties.color')
    .exists().withMessage(createErrMsg.missingParameter('properties.color'))
    .custom(validator.isColor)
    .withMessage(createErrMsg.invalidParameter('properties.color')),
  body('geoJSON.features.*.properties.cliche')
    .exists().withMessage(createErrMsg.missingParameter('properties.cliche'))
    .matches(/^[a-zA-Z0-9-_]+$/i)
    .withMessage(createErrMsg.invalidParameter('properties.cliche')),
];

// Encapsulation des informations du requestBody dans une nouvelle clé 'keyName' ("body" par defaut)
function encapBody(req, res, next) {
  let keyName = 'body';
  if (this.keyName) { keyName = this.keyName; }
  if (JSON.stringify(req.body) !== '{}') {
    const requestBodyKeys = Object.keys(req.body);
    req.body[keyName] = JSON.parse(JSON.stringify(req.body));
    for (let i = 0; i < requestBodyKeys.length; i += 1) {
      delete req.body[requestBodyKeys[i]];
    }
  }
  next();
}

router.post('/graph/patch', encapBody.bind({ keyName: 'geoJSON' }), [
  ...geoJsonAPatcher,
], validateParams, (req, res) => {
  const { overviews } = req.app;
  const params = matchedData(req);
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const R = overviews.resolution;
  const geoJson = params.geoJSON;
  const promises = [];

  debug('GeoJson:');
  debug(geoJson);
  debug('Features:');
  debug(geoJson.features);
  debug(geoJson.features[0].geometry.coordinates);
  debug(geoJson.features[0].properties.color);

  // BBox du polygone a patcher
  const BBox = {};
  try {
    geoJson.features.forEach((feature) => {
      feature.geometry.coordinates[0].forEach((point) => {
        if ('xmin' in BBox) {
          BBox.xmin = Math.min(BBox.xmin, point[0]);
          BBox.xmax = Math.max(BBox.xmax, point[0]);
          BBox.ymin = Math.min(BBox.ymin, point[1]);
          BBox.ymax = Math.max(BBox.ymax, point[1]);
        } else {
          [BBox.xmin, BBox.ymin] = point;
          [BBox.xmax, BBox.ymax] = point;
        }
      });
    });
    debug('BBox:');
    debug(BBox);

    // List of all tiles
    const tiles = [];
    let resolution = R;
    const errors = [];

    for (let z = 21; z >= 10; z -= 1) {
      const x0 = Math.floor((BBox.xmin - xOrigin) / (resolution * 256));
      const x1 = Math.ceil((BBox.xmax - xOrigin) / (resolution * 256));
      const y0 = Math.floor((yOrigin - BBox.ymax) / (resolution * 256));
      const y1 = Math.ceil((yOrigin - BBox.ymin) / (resolution * 256));
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          tiles.push({
            x, y, z, resolution,
          });

          const pathGraph = path.join(global.dir_cache, `${z}`, `${y}`, `${x}`, 'graph.png');
          const pathOrtho = path.join(global.dir_cache, `${z}`, `${y}`, `${x}`, 'ortho.png');
          const pathOpi = path.join(global.dir_cache, `${z}`, `${y}`, `${x}`, `${geoJson.features[0].properties.cliche}.png`);
          if (!fs.existsSync(pathGraph) || !fs.existsSync(pathOrtho) || !fs.existsSync(pathOpi)) {
            errors.push(`${path.join(global.dir_cache, `${z}`, `${y}`, `${x}`)}`);
          }
        }
      }
      resolution *= 2;
    }

    if (errors.length) {
      debugPatch('ERROR');
      debugPatch(errors);
      const err = new Error();
      err.code = 404;
      err.msg = {
        status: 'Fichier(s) absent(s)',
        errors: [{
          param: 'graph.png, ortho.png et/ou {nomCliche}.png',
          localisation: errors,
        }],
      };
      throw err;
    }

    debugPatch(tiles);
    // Patch these tiles
    tiles.forEach((tile) => {
    // Patch du graph
      debugPatch(tile);
      const urlGraph = path.join(global.dir_cache, `${tile.z}`, `${tile.y}`, `${tile.x}`, 'graph.png');
      const urlOrtho = path.join(global.dir_cache, `${tile.z}`, `${tile.y}`, `${tile.x}`, 'ortho.png');
      const urlOpi = path.join(global.dir_cache, `${tile.z}`, `${tile.y}`, `${tile.x}`, `${geoJson.features[0].properties.cliche}.png`);

      const mask = PImage.make(256, 256);
      const ctx = mask.getContext('2d');
      geoJson.features.forEach((feature) => {
        debugPatch(feature.properties.color);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        let first = true;
        /* eslint-disable no-restricted-syntax */
        for (const point of feature.geometry.coordinates[0]) {
          const i = Math.round((point[0] - xOrigin - tile.x * 256 * tile.resolution) / tile.resolution);
          const j = Math.round((yOrigin - point[1] - tile.y * 256 * tile.resolution) / tile.resolution);
          // debugPatch(i, j);
          if (first) {
            first = false;
            ctx.moveTo(i, j);
          } else {
            ctx.lineTo(i, j);
          }
        }
        ctx.closePath();
        ctx.fill();
      });

      // // On patch le graph
      /* eslint-disable no-param-reassign */
      promises.push(jimp.read(urlGraph).then((graph) => {
        for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
          if (mask.data[idx + 3]) {
            [graph.bitmap.data[idx],
              graph.bitmap.data[idx + 1],
              graph.bitmap.data[idx + 2]] = geoJson.features[0].properties.color;
          }
        }
        return graph.writeAsync(urlGraph);
      }).then(() => {
        debugPatch(`${urlGraph}: done`);
      }));
      // // On patch l ortho
      /* eslint-disable no-param-reassign */
      const promiseOrthoOpi = [jimp.read(urlOrtho), jimp.read(urlOpi)];
      promises.push(Promise.all(promiseOrthoOpi).then((images) => {
        const ortho = images[0];
        const opi = images[1];
        // debug(ortho, opi);
        for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
          if (mask.data[idx + 3]) {
            ortho.bitmap.data[idx] = opi.bitmap.data[idx];
            ortho.bitmap.data[idx + 1] = opi.bitmap.data[idx + 1];
            ortho.bitmap.data[idx + 2] = opi.bitmap.data[idx + 2];
          }
        }
        return ortho.writeAsync(urlOrtho);
      }).then(() => {
        debugPatch('done');
      }));
    });

    debug('execution des promises');
    Promise.all(promises)
      .then(() => {
        debug("tout c'est bien passé");
        res.status(200).send(JSON.stringify(tiles));
      })
      .catch((erreur) => {
        debug('erreur : ', erreur);
        // todo: il faut tout annuler
        const err = new Error();
        err.code = 500;
        err.msg = err;
        throw err;
      });
  } catch (err) {
    res.status(err.code).send(err.msg);
  }
});

router.get('/graph', [
  query('x')
    .exists().withMessage(createErrMsg.missingParameter('x'))
    .matches(/^\d+(.\d+)?$/i)
    .withMessage(createErrMsg.invalidParameter('x')),
  query('y')
    .exists().withMessage(createErrMsg.missingParameter('y'))
    .matches(/^\d+(.\d+)?$/i)
    .withMessage(createErrMsg.invalidParameter('y')),
], validateParams,
(req, res) => {
  const { overviews } = req.app;
  const params = matchedData(req);
  const { x } = params;
  const { y } = params;

  debug(x, y);
  const X = overviews.crs.boundingBox.xmin;
  const Y = overviews.crs.boundingBox.ymax;
  const R = overviews.resolution;

  // il faut trouver la tuile
  const Px = (x - X) / R;
  const Py = (Y - y) / R;
  const Tx = Math.floor(Px / overviews.tileSize.width);
  const Ty = Math.floor(Py / overviews.tileSize.height);
  const I = Math.floor(Px - Tx * overviews.tileSize.width);
  const J = Math.floor(Py - Ty * overviews.tileSize.height);

  const url = path.join(global.dir_cache, '21', `${Ty}`, `${Tx}`, 'graph.png');
  if (!fs.existsSync(url)) {
    res.status(201).send('{"color":[0,0,0], "cliche":"out of bounds"}');
  } else {
    jimp.read(url, (err, image) => {
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
      } else {
        const index = image.getPixelIndex(I, J);
        debug('index: ', index);
        debug(image.bitmap.data[index], image.bitmap.data[index + 1], image.bitmap.data[index + 2]);
        const out = {
          color: [
            image.bitmap.data[index],
            image.bitmap.data[index + 1],
            image.bitmap.data[index + 2]],
        };
        debug(req.app.cache_mtd);
        if ((out.color[0] in req.app.cache_mtd)
            && (out.color[1] in req.app.cache_mtd[out.color[0]])
            && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
          out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
        } else {
          out.cliche = 'missing';
        }
        debug(JSON.stringify(out));
        res.status(200).send(JSON.stringify(out));
      }
    });
  }
});

module.exports = router;
