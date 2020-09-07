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

const geoJsonAPatcher = [
  body('geoJSON')
    .exists().withMessage('Un body non vide est requis.')
    .custom(GJV.isGeoJSONObject)
    .withMessage("le body n'est pas un objet GeoJSON.")
    .custom(GJV.isFeatureCollection)
    .withMessage("le body n'est pas une featureCollection."),
  body('geoJSON.type')
    .exists().withMessage("Le parametre 'type' est requis")
    .isIn(['FeatureCollection'])
    .withMessage("Le parametre 'type' est invalide"),
  body('geoJSON.crs')
    .exists().withMessage("Le parametre 'crs' est requis")
    .custom(validator.isCrs)
    .withMessage("Le parametre 'crs' est invalide"),
  body('geoJSON.features.*.geometry')
    .custom(GJV.isPolygon).withMessage("Le parametre 'geometry' n'est pas un polygon valide."),
  body('geoJSON.features.*.properties.color')
    .exists().withMessage("une Properties 'color' est requis")
    .custom(validator.isColor)
    .withMessage("Le parametre 'properties.color' est invalide"),
  body('geoJSON.features.*.properties.cliche')
    .exists().withMessage("une Properties 'cliche' est requis")
    .matches(/^[a-zA-Z0-9_]+$/i)// Faut il etre plus spécifique ?
    .withMessage("Le parametre 'properties.cliche' est invalide"),
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
  const params = matchedData(req);
  const X0 = 0;
  const Y0 = 12000000;
  const R = 0.05;
  // const geoJson = req.body;
  const geoJson = params.geoJSON;
  const promises = [];

  debug('GeoJson:');
  debug(geoJson);
  debug('Features:');
  debug(geoJson.features);
  debug(geoJson.features[0].geometry.coordinates);
  debug(geoJson.features[0].properties.color);
  // Version JS
  // BBox du patch
  const BBox = {};
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
  for (let z = 21; z >= 10; z -= 1) {
    const x0 = Math.floor((BBox.xmin - X0) / (resolution * 256));
    const x1 = Math.ceil((BBox.xmax - X0) / (resolution * 256));
    const y0 = Math.floor((Y0 - BBox.ymax) / (resolution * 256));
    const y1 = Math.ceil((Y0 - BBox.ymin) / (resolution * 256));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        tiles.push({
          x, y, z, resolution,
        });
      }
    }
    resolution *= 2;
  }
  debugPatch(tiles);
  // Patch these tiles
  const errors = [];
  tiles.forEach((tile) => {
    // Patch du graph
    debugPatch(tile);
    const urlGraph = path.join(global.dir_cache, `${tile.z}`, `${tile.y}`, `${tile.x}`, 'graph.png');
    const urlOrtho = path.join(global.dir_cache, `${tile.z}`, `${tile.y}`, `${tile.x}`, 'ortho.png');
    const urlOpi = path.join(global.dir_cache, `${tile.z}`, `${tile.y}`, `${tile.x}`, `${geoJson.features[0].properties.cliche}.png`);

    if (!fs.existsSync(urlGraph) || !fs.existsSync(urlOrtho) || !fs.existsSync(urlOpi)) {
      errors.push('file not exists');
      debug('ERROR');
      return;
    }
    const mask = PImage.make(256, 256);
    const ctx = mask.getContext('2d');
    geoJson.features.forEach((feature) => {
      debugPatch(feature.properties.color);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      let first = true;
      /* eslint-disable no-restricted-syntax */
      for (const point of feature.geometry.coordinates[0]) {
        const i = Math.round((point[0] - X0 - tile.x * 256 * tile.resolution) / tile.resolution);
        const j = Math.round((Y0 - point[1] - tile.y * 256 * tile.resolution) / tile.resolution);
        debugPatch(i, j);
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

    // const out_mask = `mask_${tile.x}_${tile.y}_${tile.z}.png`;
    // PImage.encodePNGToStream(mask, fs.createWriteStream(out_mask)).then(() => {
    //   console.log("wrote out the png file to "+out_mask);
    // }).catch((e)=>{
    //   console.log("there was an error writing");
    // });

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
      debugPatch('done');
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
  if (errors.length) {
    res.status(500).send(errors);
  }
  Promise.all(promises).then(() => {
    debug("tout c'est bien passé");
    res.status(200).send(JSON.stringify(tiles));
  }).catch((err) => {
    debug('erreur : ', err);
    // todo: il faut tout annuler
    res.status(500).send(err);
  });
});

router.get('/graph', [
  query('x')
    .exists().withMessage('le parametre x est requis')
    .matches(/^\d+(.\d+)?$/i)
    .withMessage("Le parametre 'x' est invalide"),
  query('y')
    .exists().withMessage('le parametre y est requis')
    .matches(/^\d+(.\d+)?$/i)
    .withMessage("Le parametre 'y' est invalide"),
], validateParams,
(req, res) => {
  const params = matchedData(req);
  const { x } = params;
  const { y } = params;

  debug(x, y);
  const X = 0;
  const Y = 12000000;
  const R = 178.571428571429 * 0.00028;

  // il faut trouver la tuile
  const Px = (x - X) / R;
  const Py = (Y - y) / R;
  const Tx = Math.floor(Px / 256);
  const Ty = Math.floor(Py / 256);
  const I = Math.floor(Px - Tx * 256);
  const J = Math.floor(Py - Ty * 256);

  const url = path.join(global.dir_cache, '21', `${Ty}`, `${Tx}`, 'graph.png');// `${global.dir_cache}/21/${Ty}/${Tx}/graph.png`;

  jimp.read(url, (err, image) => {
    if (err) {
      res.status(200).send('{"color":[0,0,0], "cliche":"unknown"}');
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
        out.cliche = 'not found';
      }
      debug(JSON.stringify(out));
      res.status(200).send(JSON.stringify(out));
    }
  });
});

module.exports = router;
