const debug = require('debug')('patchs');
const router = require('express').Router();
const fs = require('fs');
const jimp = require('jimp');
const { matchedData, query, body } = require('express-validator');
const GJV = require('geojson-validation');
const PImage = require('pureimage');
const validator = require('../paramValidation/validator');
const validateParams = require('../paramValidation/validateParams');
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

function getTiles(features, overviews) {
  const BBox = {};
  features.forEach((feature) => {
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
  debug('BBox: ', BBox);

  const tiles = [];

  const lvlMin = overviews.resolution.min;
  const lvlMax = overviews.resolution.max;
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const Rmax = overviews.resolution;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  // tileSet.forEach((level) => {
  Array.from({ length: lvlMax - lvlMin }, (_, i) => i + lvlMin).forEach((level) => {
    const resolution = Rmax * 2 ** (lvlMax - level);
    const x0 = Math.floor((BBox.xmin - xOrigin) / (resolution * tileWidth));
    const x1 = Math.ceil((BBox.xmax - xOrigin) / (resolution * tileWidth));
    const y0 = Math.floor((yOrigin - BBox.ymax) / (resolution * tileHeight));
    const y1 = Math.ceil((yOrigin - BBox.ymin) / (resolution * tileHeight));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        // const aTile = { ...level };
        const aTile = {
          x,
          y,
          z: level,
        };
        // aTile.x = x;
        // aTile.y = y;
        tiles.push(aTile);
      }
    }
  });
  return tiles;
}

router.post('/patch', encapBody.bind({ keyName: 'geoJSON' }), [
  ...geoJsonAPatcher,
], validateParams, (req, res) => {
  debug('patch');

  const { overviews } = req.app;
  const params = matchedData(req);
  const geoJson = params.geoJSON;
  const promises = [];

  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const Rmax = overviews.resolution;
  const lvlMax = overviews.level.max;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  debug('GeoJson: ', geoJson);
  debug('Features: ', geoJson.features);
  const tiles = getTiles(geoJson.features, overviews);
  debug(tiles);
  // Patch these tiles
  const errors = [];
  tiles.forEach((tile) => {
    // Patch du graph
    debug(tile);

    const resolution = Rmax * 2 ** (lvlMax - tile.z);
    const urlGraph = `${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}/graph.png`;
    const urlOrtho = `${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}/ortho.png`;

    const urlGraphOutput = `${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}/graph_${req.app.currentPatchId}.png`;
    const urlOrthoOutput = `${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}/ortho_${req.app.currentPatchId}.png`;

    const urlOpi = `${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}/${geoJson.features[0].properties.cliche}.png`;
    if (!fs.existsSync(urlGraph) || !fs.existsSync(urlOrtho) || !fs.existsSync(urlOpi)) {
      errors.push('file not exists');
      debug('ERROR');
      return;
    }
    const mask = PImage.make(tileWidth, tileHeight);
    const ctx = mask.getContext('2d');
    geoJson.features.forEach((feature) => {
      debug(feature.properties.color);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      let first = true;
      /* eslint-disable no-restricted-syntax */
      for (const point of feature.geometry.coordinates[0]) {
        const i = Math.round((point[0] - xOrigin - tile.x * tileWidth * resolution)
            / resolution);
        const j = Math.round((yOrigin - point[1] - tile.y * tileHeight * resolution)
            / resolution);
        debug(i, j);
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

    // On patch le graph
    /* eslint-disable no-param-reassign */
    promises.push(jimp.read(urlGraph).then((graph) => {
      for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
        if (mask.data[idx + 3]) {
          [graph.bitmap.data[idx],
            graph.bitmap.data[idx + 1],
            graph.bitmap.data[idx + 2]] = geoJson.features[0].properties.color;
        }
      }
      return graph.writeAsync(urlGraphOutput);
    }).then(() => {
      debug('done');
    }));

    // On patch l ortho
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
      return ortho.writeAsync(urlOrthoOutput);
    }).then(() => {
      debug('done');
    }));
  });
  if (errors.length) {
    res.status(500).send(errors);
  }
  Promise.all(promises).then(() => {
    debug('tout c est bien passé on peut mettre a jour les liens symboliques');
    tiles.forEach((tile) => {
      const urlGraph = `${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}/graph.png`;
      const urlOrtho = `${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}/ortho.png`;
      const urlGraphOutput = `graph_${req.app.currentPatchId}.png`;
      const urlOrthoOutput = `ortho_${req.app.currentPatchId}.png`;
      // on supprimer l'ancien lien
      fs.unlinkSync(urlGraph);
      fs.unlinkSync(urlOrtho);
      fs.symlinkSync(urlGraphOutput, urlGraph);
      fs.symlinkSync(urlOrthoOutput, urlOrtho);
    });
    // on note le patch Id
    geoJson.features.forEach((feature) => {
      feature.properties.patchId = req.app.currentPatchId;
    });
    // on ajoute ce patch à l'historique
    debug('ici');
    debug(req.app.activePatchs.features.length);
    req.app.activePatchs.features = req.app.activePatchs.features.concat(geoJson.features);
    debug(req.app.activePatchs.features.length);
    req.app.currentPatchId += 1;
    // on purge les patchs inactifs puisqu'on ne pourra plus les appliquer
    req.app.unactivePatchs.features = [];
    // on sauve l'historique (au cas ou l'API devrait etre relancee)
    fs.writeFileSync(`${global.dir_cache}/activePatchs.geojson`, JSON.stringify(req.app.activePatchs));
    res.status(200).send(JSON.stringify(tiles));
  }).catch((err) => {
    debug('erreur : ', err);
    // todo: il faut tout annuler
    res.status(500).send(err);
  });
});

router.get('/patchs', [], (req, res) => {
  res.status(200).send(JSON.stringify(req.app.activePatchs));
});

router.put('/patchs/undo', [], (_req, res) => {
  // todo
  // trouver le patch a annuler: c'est-à-dire sortir le premier élément
  // de req.app.activePatchs.features
  // trouver la liste des tuiles concernées par ce patch
  // pour chaque tuile, trouver le numéro de version le plus élevé inférieur au numéro de patch
  // modifier les liens symbolique pour pointer sur ce numéro de version
  // insérer le patch annulé au début de req.app.unactivePatchs.features
  res.status(400).send('nothing to undo');
});

router.put('/patchs/redo', [], (_req, res) => {
  // todo
  // trouver le patch a rétablir: c'est-à-dire sortir le premier élément
  // de req.app.unactivePatchs.features
  // trouver la liste des tuiles concernées par ce patch
  // pour chaque tuile, modifier les liens symboliques
  // insérer le patch à la fin de req.app.activePatchs.features
  res.status(400).send('nothing to redo');
});

router.put('/patchs/clear', [], (_req, res) => {
  // todo
  // pour chaque patch de req.app.activePatchs.features
  // trouver la liste des tuiles concernées par ce patch
  // si cette tuile n'a pas encore été remise à zéro:
  //    retablir le lien symbolique d'origine
  //    supprimer les fichiers intermédiaires
  // vider req.app.activePatchs.features et req.app.unactivePatchs.features
  res.status(200).send('OK');
});

module.exports = router;