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

router.get('/patches', [], (req, res) => {
  debug('~~~GET patches');
  res.status(200).send(JSON.stringify(req.app.activePatches));
});

router.post('/patch', encapBody.bind({ keyName: 'geoJSON' }), [
  ...geoJsonAPatcher,
], validateParams, (req, res) => {
  debug('~~~POST patch');

  const { overviews } = req.app;
  const params = matchedData(req);
  const geoJson = params.geoJSON;

  let newPatchId = 0;
  for (let i = 0; i < req.app.activePatches.features.length; i += 1) {
    const id = req.app.activePatches.features[i].properties.patchId;
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
      patch.urlGraphOutput = path.join(global.dir_cache, 'graph', patch.rok4Path.dirPath, `${patch.rok4Path.filename}_${newPatchId}.png`);
      patch.urlOrthoOutput = path.join(global.dir_cache, 'ortho', patch.rok4Path.dirPath, `${patch.rok4Path.filename}_${newPatchId}.png`);
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
        const urlHistory = path.join(global.dir_cache, 'opi', patch.rok4Path.dirPath, `${patch.rok4Path.filename}_history.packo`);
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
          const urlGraphOrig = path.join(global.dir_cache, 'graph', patch.rok4Path.dirPath, `${patch.rok4Path.filename}_orig.png`);
          const urlOrthoOrig = path.join(global.dir_cache, 'ortho', patch.rok4Path.dirPath, `${patch.rok4Path.filename}_orig.png`);
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
      req.app.activePatches.features = req.app.activePatches.features.concat(geoJson.features);
      debug('features in activePatches:', req.app.activePatches.features.length);

      // on sauve l'historique (au cas ou l'API devrait etre relancee)
      fs.writeFileSync(path.join(global.dir_cache, 'patch', 'activePatches.json'), JSON.stringify(req.app.activePatches, null, 4));

      // on purge les patchs inactifs puisqu'on ne pourra plus les appliquer
      req.app.unactivePatches.features = [];
      debug('features in unactivePatches:', req.app.unactivePatches.features.length);
      fs.writeFileSync(path.join(global.dir_cache, 'patch', 'unactivePatches.json'), JSON.stringify(req.app.unactivePatches, null, 4));
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
  if (req.app.activePatches.features.length === 0) {
    debug('rien à annuler');
    res.status(201).send('nothing to undo');
    return;
  }
  const { overviews } = req.app;
  // trouver le patch a annuler: c'est-à-dire sortir les éléments
  // de req.app.activePatches.features avec patchId == lastPatchId
  const lastPatchId = req.app.activePatches.features[req.app.activePatches.features.length - 1]
    .properties.patchId;
  debug(`Patch '${lastPatchId}' à annuler.`);
  const features = [];
  let index = req.app.activePatches.features.length - 1;
  const tiles = new Set();
  while (index >= 0) {
    const feature = req.app.activePatches.features[index];
    if (feature.properties.patchId === lastPatchId) {
      features.push(feature);
      req.app.activePatches.features.splice(index, 1);
      feature.properties.tiles.forEach((item) => tiles.add(item));
    }
    index -= 1;
  }
  debug(tiles.size, 'tuiles impactées');
  // pour chaque tuile, trouver le numéro de version le plus élevé inférieur au numéro de patch
  tiles.forEach((tile) => {
    const rok4Path = rok4.getPath(tile.x, tile.y, tile.z, overviews.pathDepth);
    const graphDir = path.join(global.dir_cache, 'graph', rok4Path.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', rok4Path.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', rok4Path.dirPath);

    // on récupère l'historique de cette tuile
    const urlHistory = path.join(opiDir, `${rok4Path.filename}_history.packo`);
    const history = fs.readFileSync(`${urlHistory}`).toString().split(';');
    // on vérifie que le lastPatchId est bien le dernier sur cette tuile
    if (`${history[history.length - 1]}` !== `${lastPatchId}`) {
      debug("erreur d'historique");
      res.status(404).send(`erreur d'historique sur la tuile ${rok4Path}`);
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
    const urlGraph = path.join(graphDir, `${rok4Path.filename}.png`);
    const urlOrtho = path.join(orthoDir, `${rok4Path.filename}.png`);
    const urlGraphSelected = path.join(graphDir, `${rok4Path.filename}_${idSelected}.png`);
    const urlOrthoSelected = path.join(orthoDir, `${rok4Path.filename}_${idSelected}.png`);
    // on supprime l'ancien lien
    fs.unlinkSync(urlGraph);
    fs.unlinkSync(urlOrtho);
    // on crée le nouveau
    // fs.symlinkSync(urlGraphSelected, urlGraph);
    // fs.symlinkSync(urlOrthoSelected, urlOrtho);
    fs.linkSync(urlGraphSelected, urlGraph);
    fs.linkSync(urlOrthoSelected, urlOrtho);
  });

  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'activePatches.json'), JSON.stringify(req.app.activePatches, null, 4));

  req.app.unactivePatches.features = req.app.unactivePatches.features.concat(features);
  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'unactivePatches.json'), JSON.stringify(req.app.unactivePatches, null, 4));

  debug('fin du undo');
  debug('features in activePatches:', req.app.activePatches.features.length);
  debug('features in unactivePatches:', req.app.unactivePatches.features.length);
  res.status(200).send(`undo: patch ${lastPatchId} canceled`);
});

router.put('/patch/redo', [], (req, res) => {
  debug('~~~PUT patch/redo');
  if (req.app.unactivePatches.features.length === 0) {
    debug('nothing to redo');
    res.status(201).send('nothing to redo');
    return;
  }
  const { overviews } = req.app;
  // trouver le patch a refaire: c'est-à-dire sortir les éléments
  // de req.app.unactivePatches.features avec patchId == patchIdRedo
  const patchIdRedo = req.app.unactivePatches.features[req.app.unactivePatches.features.length - 1]
    .properties.patchId;
  debug('patchIdRedo:', patchIdRedo);
  const features = [];
  const tiles = new Set();
  let index = req.app.unactivePatches.features.length - 1;
  while (index >= 0) {
    const feature = req.app.unactivePatches.features[index];
    if (feature.properties.patchId === patchIdRedo) {
      features.push(feature);
      feature.properties.tiles.forEach((item) => tiles.add(item));
      req.app.unactivePatches.features.splice(index, 1);
    }
    index -= 1;
  }
  debug(tiles.size, 'tuiles impactées');
  // pour chaque tuile, modifier les liens symboliques
  tiles.forEach((tile) => {
    const rok4Path = rok4.getPath(tile.x, tile.y, tile.z, overviews.pathDepth);
    const graphDir = path.join(global.dir_cache, 'graph', rok4Path.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', rok4Path.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', rok4Path.dirPath);

    // on met a jour l'historique
    const urlHistory = path.join(opiDir, `${rok4Path.filename}_history.packo`);
    const history = `${fs.readFileSync(`${urlHistory}`)};${patchIdRedo}`;
    fs.writeFileSync(`${urlHistory}`, history);
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(graphDir, `${rok4Path.filename}_${patchIdRedo}.png`);
    const urlOrthoSelected = path.join(orthoDir, `${rok4Path.filename}_${patchIdRedo}.png`);
    // modifier les liens symboliques pour pointer sur ce numéro de version
    const urlGraph = path.join(graphDir, `${rok4Path.filename}.png`);
    const urlOrtho = path.join(orthoDir, `${rok4Path.filename}.png`);
    // on supprime l'ancien lien
    fs.unlinkSync(urlGraph);
    fs.unlinkSync(urlOrtho);
    // on crée le nouveau
    // fs.symlinkSync(urlGraphSelected, urlGraph);
    // fs.symlinkSync(urlOrthoSelected, urlOrtho);
    fs.linkSync(urlGraphSelected, urlGraph);
    fs.linkSync(urlOrthoSelected, urlOrtho);
  });
  // on remet les features dans req.app.activePatches.features
  req.app.activePatches.features = req.app.activePatches.features.concat(features);

  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'activePatches.json'), JSON.stringify(req.app.activePatches, null, 4));
  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'unactivePatches.json'), JSON.stringify(req.app.unactivePatches, null, 4));
  debug('features in activePatches:', req.app.activePatches.features.length);
  debug('features in unactivePatches:', req.app.unactivePatches.features.length);
  debug('fin du redo');
  res.status(200).send(`redo: patch ${patchIdRedo} reapplied`);
});

router.put('/patches/clear', [], (req, res) => {
  debug('~~~PUT patches/clear');
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    res.status(401).send('unauthorized');
    return;
  }
  // pour chaque patch de req.app.activePatches.features
  if (req.app.activePatches.features.length === 0) {
    debug(' nothing to clear');
    res.status(201).send('nothing to clear');
    return;
  }
  const { overviews } = req.app;
  const { features } = req.app.activePatches;

  features.forEach((feature) => {
    // trouver la liste des tuiles concernées par ces patchs
    const { tiles } = feature.properties;
    debug('', tiles.length, 'tuiles impactées');
    // pour chaque tuile, on retablit la version orig
    tiles.forEach((tile) => {
      const rok4Path = rok4.getPath(tile.x, tile.y, tile.z, overviews.pathDepth);
      const graphDir = path.join(global.dir_cache, 'graph', rok4Path.dirPath);
      const orthoDir = path.join(global.dir_cache, 'ortho', rok4Path.dirPath);
      const opiDir = path.join(global.dir_cache, 'opi', rok4Path.dirPath);

      const urlGraphSelected = path.join(graphDir, `${rok4Path.filename}_orig.png`);
      const urlOrthoSelected = path.join(orthoDir, `${rok4Path.filename}_orig.png`);

      // include('_') suffit car on veut tout supprimer (meme sur les autres tuiles)
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
      const urlHistory = path.join(opiDir, `${rok4Path.filename}_history.packo`);
      fs.writeFileSync(`${urlHistory}`, 'orig');

      // modifier les liens symboliques pour pointer sur ce numéro de version
      const urlGraph = path.join(graphDir, `${rok4Path.filename}.png`);
      const urlOrtho = path.join(orthoDir, `${rok4Path.filename}.png`);
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

  req.app.unactivePatches.features.forEach((feature) => {
    // trouver la liste des tuiles concernées par ces patchs
    const { tiles } = feature.properties;
    debug(tiles.size, 'tuiles impactées');
    // pour chaque tuile, on efface les images du redo
    tiles.forEach((tile) => {
      const rok4Path = rok4.getPath(tile.x, tile.y, tile.z, overviews.pathDepth);
      const graphDir = path.join(global.dir_cache, 'graph', rok4Path.dirPath);
      const orthoDir = path.join(global.dir_cache, 'ortho', rok4Path.dirPath);

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
    });
  });
  req.app.activePatches.features = [];
  req.app.unactivePatches.features = [];
  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'activePatches.json'), JSON.stringify(req.app.activePatches, null, 4));
  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'unactivePatches.json'), JSON.stringify(req.app.unactivePatches, null, 4));
  debug(' features in activePatches:', req.app.activePatches.features.length);
  debug(' features in unactivePatches:', req.app.unactivePatches.features.length);
  debug('fin du clear');
  res.status(200).send('clear: all patches deleted');
});

router.put('/patches/save', [], (req, res) => {
  debug('~~~PUT patches/save');
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    res.status(401).send('unauthorized');
    return;
  }
  // pour chaque patch de req.app.activePatches.features
  if (req.app.activePatches.features.length === 0) {
    debug('nothing to save');
    res.status(201).send('nothing to save');
    return;
  }
  const { overviews } = req.app;
  const { features } = req.app.activePatches;

  const lastPatchId = req.app.activePatches.features[req.app.activePatches.features.length - 1]
    .properties.patchId;
  debug('lastPatchId:', lastPatchId);

  features.forEach((feature) => {
    // trouver la liste des tuiles concernées par ces patchs
    const { tiles } = feature.properties;
    debug('', tiles.length, 'tuiles impactées');
    // pour chaque tuile, on écrase la version orig
    tiles.forEach((tile) => {
      const rok4Path = rok4.getPath(tile.x, tile.y, tile.z, overviews.pathDepth);
      const graphDir = path.join(global.dir_cache, 'graph', rok4Path.dirPath);
      const orthoDir = path.join(global.dir_cache, 'ortho', rok4Path.dirPath);
      const opiDir = path.join(global.dir_cache, 'opi', rok4Path.dirPath);
      // on récupère l'historique de cette tuile
      const urlHistory = path.join(opiDir, `${rok4Path.filename}_history.packo`);
      const history = fs.readFileSync(`${urlHistory}`).toString().split(';');

      debug('____');
      debug(tile);
      debug(history);

      // on récupère la version à restaurer
      const idSelected = history[history.length - 1];
      debug('  version sauvegardée pour la tuile :', idSelected);

      // on supprime chaque image sauf l'image active (pour graph et ortho)
      const arrayLinkGraph = fs.readdirSync(graphDir).filter((filename) => (filename.includes(`${rok4Path.filename}_`)));
      arrayLinkGraph.forEach((file) => {
        if (file.split('_')[1] !== `${idSelected}.png`) {
          debug('supp', file);
          fs.unlinkSync(path.join(graphDir, file));
        }
      });
      const arrayLinkOrtho = fs.readdirSync(orthoDir).filter((filename) => (filename.includes(`${rok4Path.filename}_`)));
      arrayLinkOrtho.forEach((file) => {
        if (file.split('_')[1] !== `${idSelected}.png`) {
          debug('supp', file);
          fs.unlinkSync(path.join(orthoDir, file));
        }
      });
      // on renomme l'image active en _orig
      fs.renameSync(
        path.join(graphDir, `${rok4Path.filename}_${idSelected}.png`),
        path.join(graphDir, `${rok4Path.filename}_orig.png`),
      );
      fs.renameSync(
        path.join(orthoDir, `${rok4Path.filename}_${idSelected}.png`),
        path.join(orthoDir, `${rok4Path.filename}_orig.png`),
      );
      // remise à zéro de l'historique de la tuile
      fs.writeFileSync(`${urlHistory}`, 'orig');
    });
  });

  req.app.unactivePatches.features.forEach((feature) => {
    // trouver la liste des tuiles concernées par ces patchs
    const { tiles } = feature.properties;
    debug(tiles.size, 'tuiles impactées');
    // pour chaque tuile, on efface les images du redo
    tiles.forEach((tile) => {
      const rok4Path = rok4.getPath(tile.x, tile.y, tile.z, overviews.pathDepth);
      const graphDir = path.join(global.dir_cache, 'graph', rok4Path.dirPath);
      const orthoDir = path.join(global.dir_cache, 'ortho', rok4Path.dirPath);

      const arrayLinkGraph = fs.readdirSync(graphDir).filter((filename) => (filename.includes(`${rok4Path.filename}_`) && !filename.endsWith('orig.png')));
      // suppression des images intermediaires
      arrayLinkGraph.forEach((file) => fs.unlinkSync(
        path.join(graphDir, file),
      ));
      const arrayLinkOrtho = fs.readdirSync(orthoDir).filter((filename) => (filename.includes(`${rok4Path.filename}_`) && !filename.endsWith('orig.png')));
      // suppression des images intermediaires
      arrayLinkOrtho.forEach((file) => fs.unlinkSync(
        path.join(orthoDir, file),
      ));
    });
  });
  const date = new Date(Date.now()).toISOString().replace(/-|T|:/g, '').substr(0, 14);
  fs.writeFileSync(path.join(global.dir_cache, `save_${date}Z.json`), JSON.stringify(req.app.activePatches, null, 4));
  req.app.activePatches.features = [];
  req.app.unactivePatches.features = [];
  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'activePatches.json'), JSON.stringify(req.app.activePatches, null, 4));
  fs.writeFileSync(path.join(global.dir_cache, 'patch', 'unactivePatches.json'), JSON.stringify(req.app.unactivePatches, null, 4));
  debug('features in activePatches:', req.app.activePatches.features.length);
  debug('features in unactivePatches:', req.app.unactivePatches.features.length);
  debug('fin du save');
  res.status(200).send('save: all active patches saved');
});

module.exports = router;
module.exports.workerpool = pool;
