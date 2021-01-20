const debug = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { body, matchedData } = require('express-validator');
const GJV = require('geojson-validation');
const workerpool = require('workerpool');
const validator = require('../paramValidation/validator');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const rok4 = require('../rok4.js');

// create a worker pool using an external worker script
const pool = workerpool.pool(`${__dirname}/worker.js`);

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
  debug('~BBox:', 'Done');

  const tiles = [];

  const lvlMin = overviews.dataSet.level.min;
  const lvlMax = overviews.dataSet.level.max;
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  // const Rmax = overviews.resolution;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  // tileSet.forEach((level) => {
  // Array.from({ length: lvlMax - lvlMin + 1 }, (_, i) => i + lvlMin).forEach((level) => {
  for (let level = lvlMin; level <= lvlMax; level += 1) {
    const resolution = overviews.resolution * 2 ** (overviews.level.max - level);
    const x0 = Math.floor((BBox.xmin - xOrigin) / (resolution * tileWidth));
    const x1 = Math.ceil((BBox.xmax - xOrigin) / (resolution * tileWidth));
    const y0 = Math.floor((yOrigin - BBox.ymax) / (resolution * tileHeight));
    const y1 = Math.ceil((yOrigin - BBox.ymin) / (resolution * tileHeight));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        tiles.push({ x: `${x}`, y: `${y}`, z: `${level}` });
      }
    }
  }
  return tiles;
}

router.get('/patchs', [], (req, res) => {
  debug('~~~GET patchs');
  res.status(200).send(JSON.stringify(req.app.activePatchs));
});

router.post('/patch', encapBody.bind({ keyName: 'geoJSON' }), [
  ...geoJsonAPatcher,
], validateParams, (req, res) => {
  debug('~~~POST patch');

  const { overviews } = req.app;
  const params = matchedData(req);
  const geoJson = params.geoJSON;

  let newPatchId = 0;
  for (let i = 0; i < req.app.activePatchs.features.length; i += 1) {
    const id = req.app.activePatchs.features[i].properties.patchId;
    if (newPatchId < id) newPatchId = id;
  }

  newPatchId += 1;

  const tiles = getTiles(geoJson.features, overviews);
  const promisesCreatePatch = [];
  debug('~create patch avec workers');
  tiles.forEach((tile) => {
    promisesCreatePatch.push(pool.exec(
      'createPatch', [tile, geoJson, overviews, global.dir_cache, __dirname],
    ));
  });
  Promise.all(promisesCreatePatch).then((patches) => {
    const promises = [];
    const tilesModified = [];

    debug('~process patch avec workers');

    patches.forEach((patch) => {
      if (patch === null) {
        return;
      }
      /* eslint-disable no-param-reassign */
      patch.urlGraphOutput = path.join(global.dir_cache, 'graph', patch.tileRoot.dirPath, `${patch.tileRoot.fileName}_${newPatchId}.png`);
      patch.urlOrthoOutput = path.join(global.dir_cache, 'ortho', patch.tileRoot.dirPath, `${patch.tileRoot.fileName}_${newPatchId}.png`);
      /* eslint-enable no-param-reassign */
      tilesModified.push(patch.tile);
      promises.push(pool.exec(
        'processPatch', [patch],
      ).catch((err) => {
        debug(err);
        throw err;
      }));
    });
    debug('', promises.length, 'patchs à appliquer.');
    Promise.all(promises).then(() => {
      // Tout c'est bien passé
      debug("=> tout c'est bien passé on peut mettre à jour les liens symboliques");
      patches.forEach((patch) => {
        if (patch === null) {
          return;
        }
        const urlHistory = path.join(global.dir_cache, 'opi', patch.tileRoot.dirPath, `${patch.tileRoot.fileName}_history.packo`);
        if (fs.lstatSync(patch.urlGraph).nlink > 1) {
          const history = `${fs.readFileSync(`${urlHistory}`)};${newPatchId}`;
          debug(patch.urlGraph);
          debug(' historique :', history);
          fs.writeFileSync(`${urlHistory}`, history);
          fs.unlinkSync(patch.urlGraph);
          fs.unlinkSync(patch.urlOrtho);
        } else {
          const history = `orig;${newPatchId}`;
          fs.writeFileSync(`${urlHistory}`, history);
          const urlGraphOrig = path.join(global.dir_cache, 'graph', patch.tileRoot.dirPath, `${patch.tileRoot.fileName}_orig.png`);
          const urlOrthoOrig = path.join(global.dir_cache, 'ortho', patch.tileRoot.dirPath, `${patch.tileRoot.fileName}_orig.png`);
          fs.renameSync(patch.urlGraph, urlGraphOrig);
          fs.renameSync(patch.urlOrtho, urlOrthoOrig);
        }
        fs.linkSync(patch.urlGraphOutput, patch.urlGraph);
        fs.linkSync(patch.urlOrthoOutput, patch.urlOrtho);
      });
      // on note le patch Id
      geoJson.features.forEach((feature) => {
        /* eslint-disable no-param-reassign */
        feature.properties.patchId = newPatchId;
        feature.properties.tiles = tilesModified;
        /* eslint-enable no-param-reassign */
      });
      // on ajoute ce patch à l'historique
      debug('=> Patch', newPatchId, 'ajouté');
      req.app.activePatchs.features = req.app.activePatchs.features.concat(geoJson.features);
      debug('features in activePatchs:', req.app.activePatchs.features.length);

      // on sauve l'historique (au cas ou l'API devrait etre relancee)
      fs.writeFileSync(path.join(global.dir_cache, 'activePatchs.json'), JSON.stringify(req.app.activePatchs, null, 4));

      // on purge les patchs inactifs puisqu'on ne pourra plus les appliquer
      req.app.unactivePatchs.features = [];
      debug('features in unactivePatchs:', req.app.unactivePatchs.features.length);
      fs.writeFileSync(path.join(global.dir_cache, 'unactivePatchs.json'), JSON.stringify(req.app.unactivePatchs, null, 4));
      res.status(200).send(JSON.stringify(tilesModified));
    }).catch((err) => {
      debug(err);
      res.status(400).send(err);
    });
  }).catch((error) => {
    debug('on a reçu une erreur : ', error);
    pool.terminate(true);
    res.status(404).send(JSON.stringify({
      status: 'File(s) missing',
      errors: [error],
    }));
  });
});

router.put('/patch/undo', [], (req, res) => {
  debug('~~~PUT patch/undo');
  if (req.app.activePatchs.features.length === 0) {
    debug('rien à annuler');
    res.status(201).send('nothing to undo');
    return;
  }
  const { overviews } = req.app;
  // trouver le patch a annuler: c'est-à-dire sortir les éléments
  // de req.app.activePatchs.features avec patchId == lastPatchId
  const lastPatchId = req.app.activePatchs.features[req.app.activePatchs.features.length - 1]
    .properties.patchId;
  debug(`Patch '${lastPatchId}' à annuler.`);
  const features = [];
  let index = req.app.activePatchs.features.length - 1;
  const tiles = new Set();
  while (index >= 0) {
    const feature = req.app.activePatchs.features[index];
    if (feature.properties.patchId === lastPatchId) {
      features.push(feature);
      req.app.activePatchs.features.splice(index, 1);
      feature.properties.tiles.forEach((item) => tiles.add(item));
    }
    index -= 1;
  }
  debug(tiles.size, 'tuiles impactées');
  // pour chaque tuile, trouver le numéro de version le plus élevé inférieur au numéro de patch
  tiles.forEach((tile) => {
    const tileRoot = rok4.getTileRoot(tile.x, tile.y, tile.z, overviews.pathDepth);
    // on récupère l'historique de cette tuile
    const urlHistory = path.join(global.dir_cache, 'opi', tileRoot.dirPath, `${tileRoot.fileName}_history.packo`);
    const history = fs.readFileSync(`${urlHistory}`).toString().split(';');
    // on vérifie que le lastPatchId est bien le dernier sur cette tuile
    if (`${history[history.length - 1]}` !== `${lastPatchId}`) {
      debug("erreur d'historique");
      res.status(404).send(`erreur d'historique sur la tuile ${tileRoot}`);
      return;
    }
    // on récupère la version à restaurer
    const idSelected = history[history.length - 2];
    // mise à jour de l'historique
    let newHistory = '';
    for (let i = 0; i < (history.length - 1); i += 1) {
      newHistory += history[i];
      if (i < (history.length - 2)) newHistory += ';';
    }
    fs.writeFileSync(`${urlHistory}`, newHistory);
    debug(` tuile ${tile.z}/${tile.y}/${tile.x} : version ${idSelected} selectionnée`);
    // debug(' version selectionnée pour la tuile :', idSelected);
    // modifier les liens symboliques pour pointer sur ce numéro de version
    const urlGraph = path.join(global.dir_cache, 'graph', tileRoot.dirPath, `${tileRoot.fileName}.png`);
    const urlOrtho = path.join(global.dir_cache, 'ortho', tileRoot.dirPath, `${tileRoot.fileName}.png`);
    const urlGraphSelected = path.join(global.dir_cache, 'graph', tileRoot.dirPath, `${tileRoot.fileName}_${idSelected}.png`);
    const urlOrthoSelected = path.join(global.dir_cache, 'ortho', tileRoot.dirPath, `${tileRoot.fileName}_${idSelected}.png`);
    // on supprime l'ancien lien
    fs.unlinkSync(urlGraph);
    fs.unlinkSync(urlOrtho);
    // on crée le nouveau
    // fs.symlinkSync(urlGraphSelected, urlGraph);
    // fs.symlinkSync(urlOrthoSelected, urlOrtho);
    fs.linkSync(urlGraphSelected, urlGraph);
    fs.linkSync(urlOrthoSelected, urlOrtho);
  });

  fs.writeFileSync(path.join(global.dir_cache, 'activePatchs.json'), JSON.stringify(req.app.activePatchs, null, 4));

  req.app.unactivePatchs.features = req.app.unactivePatchs.features.concat(features);
  fs.writeFileSync(path.join(global.dir_cache, 'unactivePatchs.json'), JSON.stringify(req.app.unactivePatchs, null, 4));

  debug('fin du undo');
  debug('features in activePatchs:', req.app.activePatchs.features.length);
  debug('features in unactivePatchs:', req.app.unactivePatchs.features.length);
  res.status(200).send(`undo: patch ${lastPatchId} canceled`);
});

router.put('/patch/redo', [], (req, res) => {
  debug('~~~PUT patch/redo');
  if (req.app.unactivePatchs.features.length === 0) {
    debug('nothing to redo');
    res.status(201).send('nothing to redo');
    return;
  }
  const { overviews } = req.app;
  // trouver le patch a refaire: c'est-à-dire sortir les éléments
  // de req.app.unactivePatchs.features avec patchId == patchIdRedo
  const patchIdRedo = req.app.unactivePatchs.features[req.app.unactivePatchs.features.length - 1]
    .properties.patchId;
  debug('patchIdRedo:', patchIdRedo);
  const features = [];
  const tiles = new Set();
  let index = req.app.unactivePatchs.features.length - 1;
  while (index >= 0) {
    const feature = req.app.unactivePatchs.features[index];
    if (feature.properties.patchId === patchIdRedo) {
      features.push(feature);
      feature.properties.tiles.forEach((item) => tiles.add(item));
      req.app.unactivePatchs.features.splice(index, 1);
    }
    index -= 1;
  }
  debug(tiles.size, 'tuiles impactées');
  // pour chaque tuile, modifier les liens symboliques
  tiles.forEach((tile) => {
    const tileRoot = rok4.getTileRoot(tile.x, tile.y, tile.z, overviews.pathDepth);
    // on met a jour l'historique
    const urlHistory = path.join(global.dir_cache, 'opi', tileRoot.dirPath, `${tileRoot.fileName}_history.packo`);
    const history = `${fs.readFileSync(`${urlHistory}`)};${patchIdRedo}`;
    fs.writeFileSync(`${urlHistory}`, history);
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(global.dir_cache, 'graph', tileRoot.dirPath, `${tileRoot.fileName}_${patchIdRedo}.png`);
    const urlOrthoSelected = path.join(global.dir_cache, 'ortho', tileRoot.dirPath, `${tileRoot.fileName}_${patchIdRedo}.png`);
    // modifier les liens symboliques pour pointer sur ce numéro de version
    const urlGraph = path.join(global.dir_cache, 'graph', tileRoot.dirPath, `${tileRoot.fileName}.png`);
    const urlOrtho = path.join(global.dir_cache, 'ortho', tileRoot.dirPath, `${tileRoot.fileName}.png`);
    // on supprime l'ancien lien
    fs.unlinkSync(urlGraph);
    fs.unlinkSync(urlOrtho);
    // on crée le nouveau
    // fs.symlinkSync(urlGraphSelected, urlGraph);
    // fs.symlinkSync(urlOrthoSelected, urlOrtho);
    fs.linkSync(urlGraphSelected, urlGraph);
    fs.linkSync(urlOrthoSelected, urlOrtho);
  });
  // on remet les features dans req.app.activePatchs.features
  req.app.activePatchs.features = req.app.activePatchs.features.concat(features);

  fs.writeFileSync(path.join(global.dir_cache, 'activePatchs.json'), JSON.stringify(req.app.activePatchs, null, 4));
  fs.writeFileSync(path.join(global.dir_cache, 'unactivePatchs.json'), JSON.stringify(req.app.unactivePatchs, null, 4));
  debug('features in activePatchs:', req.app.activePatchs.features.length);
  debug('features in unactivePatchs:', req.app.unactivePatchs.features.length);
  debug('fin du redo');
  res.status(200).send(`redo: patch ${patchIdRedo} reapplied`);
});

router.put('/patchs/clear', [], (req, res) => {
  debug('~~~PUT patchs/clear');
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    res.status(401).send('unauthorized');
    return;
  }
  // pour chaque patch de req.app.activePatchs.features
  if (req.app.activePatchs.features.length === 0) {
    debug(' nothing to clear');
    res.status(201).send('nothing to clear');
    return;
  }
  const { overviews } = req.app;
  const { features } = req.app.activePatchs;

  features.forEach((feature) => {
    // trouver la liste des tuiles concernées par ces patchs
    const { tiles } = feature.properties;
    debug('', tiles.length, 'tuiles impactées');
    // pour chaque tuile, on retablit la version orig
    tiles.forEach((tile) => {
      const tileRoot = rok4.getTileRoot(tile.x, tile.y, tile.z, overviews.pathDepth);

      const graphDir = path.join(global.dir_cache, 'graph', tileRoot.dirPath);
      const orthoDir = path.join(global.dir_cache, 'ortho', tileRoot.dirPath);

      const urlGraphSelected = path.join(graphDir, `${tileRoot.fileName}_orig.png`);
      const urlOrthoSelected = path.join(orthoDir, `${tileRoot.fileName}_orig.png`);

      const arrayLinkGraph = fs.readdirSync(graphDir).filter((filename) => (filename.includes('_') && !filename.endsWith('orig.png')));
      // suppression des images intermediaires
      arrayLinkGraph.forEach((file) => fs.unlinkSync(
        path.join(graphDir, file),
      ));
      const arrayLinkOrtho = fs.readdirSync(orthoDir).filter((filename) => (filename.includes('_') && !filename.endsWith('orig.png')));
      // suppression des images intermediaires
      arrayLinkOrtho.forEach((file) => fs.unlinkSync(
        path.join(orthoDir, file),
      ));

      // remise à zéro de l'historique de la tuile
      const urlHistory = path.join(global.dir_cache, 'opi', tileRoot.dirPath, `${tileRoot.fileName}_history.packo`);
      fs.writeFileSync(`${urlHistory}`, 'orig');

      // modifier les liens symboliques pour pointer sur ce numéro de version
      const urlGraph = path.join(graphDir, `${tileRoot.fileName}.png`);
      const urlOrtho = path.join(orthoDir, `${tileRoot.fileName}.png`);
      // on supprime l'ancien lien
      fs.unlinkSync(urlGraph);
      fs.unlinkSync(urlOrtho);
      // on crée le nouveau
      // fs.symlinkSync(urlGraphSelected, urlGraph);
      // fs.symlinkSync(urlOrthoSelected, urlOrtho);
      fs.linkSync(urlGraphSelected, urlGraph);
      fs.linkSync(urlOrthoSelected, urlOrtho);
    });
  });

  req.app.activePatchs.features = [];
  req.app.unactivePatchs.features = [];
  fs.writeFileSync(path.join(global.dir_cache, 'activePatchs.json'), JSON.stringify(req.app.activePatchs, null, 4));
  fs.writeFileSync(path.join(global.dir_cache, 'unactivePatchs.json'), JSON.stringify(req.app.unactivePatchs, null, 4));
  debug(' features in activePatchs:', req.app.activePatchs.features.length);
  debug(' features in unactivePatchs:', req.app.unactivePatchs.features.length);
  debug('fin du clear');
  res.status(200).send('clear: all patches deleted');
});

module.exports = router;
module.exports.workerpool = pool;
