const debug = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const jimp = require('jimp');
const { body, matchedData } = require('express-validator');
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
  debug('BBox:', 'Done');

  const tiles = [];

  const lvlMin = overviews.level.min;
  const lvlMax = overviews.level.max;
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const Rmax = overviews.resolution;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  // tileSet.forEach((level) => {
  // Array.from({ length: lvlMax - lvlMin + 1 }, (_, i) => i + lvlMin).forEach((level) => {
  for (let level = lvlMin; level <= lvlMax; level += 1) {
    const resolution = Rmax * 2 ** (lvlMax - level);
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
  const promises = [];

  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const Rmax = overviews.resolution;
  const lvlMax = overviews.level.max;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  let newPatchId = 0;
  for (let i = 0; i < req.app.activePatchs.features.length; i += 1) {
    const id = req.app.activePatchs.features[i].properties.patchId;
    if (newPatchId < id) newPatchId = id;
  }

  newPatchId += 1;

  const tiles = getTiles(geoJson.features, overviews);
  debug(tiles.length, 'tuiles intersectées');
  const tilesModified = [];

  try {
    // Patch these tiles
    const outOfBoundsTiles = [];
    tiles.forEach((tile) => {
      // Patch du graph
      debug(tile);
      // Il y a parfois un bug sur le dessin du premier pixel
      // on cree donc un masque une ligne de plus
      const mask = PImage.make(tileWidth, tileHeight + 1);

      const ctx = mask.getContext('2d');
      geoJson.features.forEach((feature) => {
        // debug(feature.properties.color);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        let first = true;
        /* eslint-disable no-restricted-syntax */
        const resolution = Rmax * 2 ** (lvlMax - tile.z);
        for (const point of feature.geometry.coordinates[0]) {
          const i = Math.round((point[0] - xOrigin - tile.x * tileWidth * resolution)
                / resolution);
          const j = Math.round((yOrigin - point[1] - tile.y * tileHeight * resolution)
                / resolution) + 1;
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

      // On verifie si le masque est vide
      let empty = true;
      for (let idx = 0; (idx < 256 * 256 * 4) && empty; idx += 4) {
        // le shift de 1024 = la ligne de marge en plus sur le masque
        if (mask.data[1024 + idx + 3]) {
          empty = false;
        }
      }
      debug(empty);
      if (empty) {
        debug('masque vide, on passe a la suite : ', tile);
        return;
      }

      const tileDir = path.join(global.dir_cache, tile.z, tile.y, tile.x);
      const urlGraph = path.join(tileDir, 'graph.png');
      const urlOrtho = path.join(tileDir, 'ortho.png');
      const urlOpi = path.join(tileDir, `${geoJson.features[0].properties.cliche}.png`);

      if (!fs.existsSync(urlGraph) || !fs.existsSync(urlOrtho) || !fs.existsSync(urlOpi)) {
        outOfBoundsTiles.push(`${global.dir_cache}/${tile.z}/${tile.y}/${tile.x}`);
        debug('Out of bounds');
        return;
      }

      const urlGraphOutput = path.join(tileDir, `graph_${newPatchId}.png`);
      const urlOrthoOutput = path.join(tileDir, `ortho_${newPatchId}.png`);

      // On patch le graph
      /* eslint-disable no-param-reassign */
      promises.push(jimp.read(urlGraph).then((graph) => {
        for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
          if (mask.data[1024 + idx + 3]) {
            [graph.bitmap.data[idx],
              graph.bitmap.data[idx + 1],
              graph.bitmap.data[idx + 2]] = geoJson.features[0].properties.color;
          }
        }
        return graph.writeAsync(urlGraphOutput);
      }).then(() => {
        debug('graph done');
      }));

      // On patch l ortho
      /* eslint-disable no-param-reassign */
      const promiseOrthoOpi = [jimp.read(urlOrtho), jimp.read(urlOpi)];
      promises.push(Promise.all(promiseOrthoOpi).then((images) => {
        const ortho = images[0];
        const opi = images[1];
        for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
          if (mask.data[1024 + idx + 3]) {
            ortho.bitmap.data[idx] = opi.bitmap.data[idx];
            ortho.bitmap.data[idx + 1] = opi.bitmap.data[idx + 1];
            ortho.bitmap.data[idx + 2] = opi.bitmap.data[idx + 2];
          }
        }
        return ortho.writeAsync(urlOrthoOutput);
      }).then(() => {
        debug('ortho done');
      }));
      tilesModified.push(tile);
    });
    if (outOfBoundsTiles.length) {
      const err = new Error();
      err.code = 404;
      err.msg = {
        status: 'File(s) missing',
        errors: [{
          localisation: outOfBoundsTiles,
          value: `${geoJson.features[0].properties.cliche}.png ou graph.png ou ortho.png`,
          msg: 'File(s) missing',
        }],
      };
      throw err;
    }
    Promise.all(promises).then(() => {
      debug('tout c est bien passé on peut mettre a jour les liens symboliques');
      tilesModified.forEach((tile) => {
        const tileDir = path.join(global.dir_cache, tile.z, tile.y, tile.x);
        const urlGraph = path.join(tileDir, 'graph.png');
        const urlOrtho = path.join(tileDir, 'ortho.png');
        const urlGraphOutput = path.join(tileDir, `graph_${newPatchId}.png`);
        const urlOrthoOutput = path.join(tileDir, `ortho_${newPatchId}.png`);
        // on verifie si c'est un lien symbolique ou le fichier d'origine
        // if (fs.lstatSync(urlGraph).isSymbolicLink()) {
        if (fs.lstatSync(urlGraph).nlink > 1) {
          // ou faire test sur la presence d'un fichier _orig ??
          fs.unlinkSync(urlGraph);
          fs.unlinkSync(urlOrtho);
        } else {
          const urlGraphOrig = path.join(tileDir, 'graph_orig.png');
          const urlOrthoOrig = path.join(tileDir, 'ortho_orig.png');
          fs.renameSync(urlGraph, urlGraphOrig);
          fs.renameSync(urlOrtho, urlOrthoOrig);
        }
        // fs.symlinkSync(urlGraphOutput, urlGraph);
        // fs.symlinkSync(urlOrthoOutput, urlOrtho);
        fs.linkSync(urlGraphOutput, urlGraph);
        fs.linkSync(urlOrthoOutput, urlOrtho);
      });
      // on note le patch Id
      geoJson.features.forEach((feature) => {
        feature.properties.patchId = newPatchId;
        feature.properties.tiles = tilesModified;
      });
      // on ajoute ce patch à l'historique
      debug('New patch, Id:', newPatchId);
      req.app.activePatchs.features = req.app.activePatchs.features.concat(geoJson.features);
      debug('features in activePatchs:', req.app.activePatchs.features.length);

      // on sauve l'historique (au cas ou l'API devrait etre relancee)
      fs.writeFileSync(path.join(global.dir_cache, 'activePatchs.json'), JSON.stringify(req.app.activePatchs, null, 4));

      // on purge les patchs inactifs puisqu'on ne pourra plus les appliquer
      req.app.unactivePatchs.features = [];
      debug('features in unactivePatchs:', req.app.unactivePatchs.features.length);
      fs.writeFileSync(path.join(global.dir_cache, 'unactivePatchs.json'), JSON.stringify(req.app.unactivePatchs, null, 4));
      if (outOfBoundsTiles.length) {
        res.status(204).send(JSON.stringify(tiles));
      } else {
        res.status(200).send(JSON.stringify(tiles));
      }
    }).catch((err) => {
      debug('erreur : ', err);
      // todo: il faut tout annuler
      res.status(500).send(err);
    });
  } catch (err) {
    debug('***ERROR***');
    debug(err);
    debug(err.msg);
    res.status(err.code).send(err.msg);
    if (err.code === 404) {
      Promise.all(promises).then(() => {
        debug('Erreur => clean up');
        tilesModified.forEach((tile) => {
          const tileDir = path.join(global.dir_cache, tile.z, tile.y, tile.x);
          debug(tileDir);
          fs.unlinkSync(path.join(tileDir, `graph_${newPatchId}.png`));
          fs.unlinkSync(path.join(tileDir, `ortho_${newPatchId}.png`));
        });
      });
    }
  }
});

router.put('/patch/undo', [], (req, res) => {
  debug('~~~PUT patch/undo');
  if (req.app.activePatchs.features.length === 0) {
    debug('nothing to undo');
    res.status(201).send('nothing to undo');
    return;
  }
  // trouver le patch a annuler: c'est-à-dire sortir les éléments
  // de req.app.activePatchs.features avec patchId == lastPatchId
  const lastPatchId = req.app.activePatchs.features[req.app.activePatchs.features.length - 1]
    .properties.patchId;
  debug('lastPatchId:', lastPatchId);
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
  debug(tiles.length, 'tuiles impactées');
  // pour chaque tuile, trouver le numéro de version le plus élevé inférieur au numéro de patch
  tiles.forEach((tile) => {
    const tileDir = path.join(global.dir_cache, tile.z, tile.y, tile.x);
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const arrayGraphs = fs.readdirSync(tileDir).filter((fn) => fn.startsWith('graph_'));
    debug('arrayGraphs : ', arrayGraphs);
    let idSelected = null;
    arrayGraphs.forEach((name) => {
      const id = parseInt(name.split(/[_.]/)[1], 10);
      if ((id < lastPatchId) && !Number.isNaN(id)) {
        if ((idSelected == null) || (idSelected < id)) idSelected = id;
      }
    });
    if (idSelected == null) idSelected = 'orig';
    debug('version selectionne pour la tuile :', idSelected);
    // modifier les liens symboliques pour pointer sur ce numéro de version
    const urlGraph = path.join(global.dir_cache, tile.z, tile.y, tile.x, 'graph.png');
    const urlOrtho = path.join(global.dir_cache, tile.z, tile.y, tile.x, 'ortho.png');
    const urlGraphSelected = path.join(global.dir_cache, tile.z, tile.y, tile.x, `graph_${idSelected}.png`);
    const urlOrthoSelected = path.join(global.dir_cache, tile.z, tile.y, tile.x, `ortho_${idSelected}.png`);
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

  debug('features in activePatchs:', req.app.activePatchs.features.length);
  debug('features in unactivePatchs:', req.app.unactivePatchs.features.length);
  debug('fin du undo');
  res.status(200).send(`undo: patch ${lastPatchId} canceled`);
});

router.put('/patch/redo', [], (req, res) => {
  debug('~~~PUT patch/redo');
  if (req.app.unactivePatchs.features.length === 0) {
    debug('nothing to redo');
    res.status(201).send('nothing to redo');
    return;
  }
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
  debug(tiles.length, 'tuiles impactées');
  // pour chaque tuile, modifier les liens symboliques
  tiles.forEach((tile) => {
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(global.dir_cache, tile.z, tile.y, tile.x, `graph_${patchIdRedo}.png`);
    const urlOrthoSelected = path.join(global.dir_cache, tile.z, tile.y, tile.x, `ortho_${patchIdRedo}.png`);
    // modifier les liens symboliques pour pointer sur ce numéro de version
    const urlGraph = path.join(global.dir_cache, tile.z, tile.y, tile.x, 'graph.png');
    const urlOrtho = path.join(global.dir_cache, tile.z, tile.y, tile.x, 'ortho.png');
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
  // pour chaque patch de req.app.activePatchs.features
  if (req.app.activePatchs.features.length === 0) {
    debug('nothing');
    res.status(201).send('nothing to clear');
    return;
  }
  const { features } = req.app.activePatchs;

  features.forEach((feature) => {
    // trouver la liste des tuiles concernées par ces patchs
    const { tiles } = feature.properties;
    debug(tiles.length, 'tuiles impactées');
    // pour chaque tuile, on retablit la version orig
    tiles.forEach((tile) => {
      const tileDir = path.join(global.dir_cache, tile.z, tile.y, tile.x);
      const urlGraphSelected = path.join(tileDir, 'graph_orig.png');
      const urlOrthoSelected = path.join(tileDir, 'ortho_orig.png');
      const arrayLink = fs.readdirSync(tileDir).filter((filename) => (filename.startsWith('graph_') || filename.startsWith('ortho_')) && !filename.endsWith('orig.png'));

      // suppression des images intermediaires
      arrayLink.forEach((file) => fs.unlinkSync(
        path.join(tileDir, file),
      ));

      // modifier les liens symboliques pour pointer sur ce numéro de version
      const urlGraph = path.join(tileDir, 'graph.png');
      const urlOrtho = path.join(tileDir, 'ortho.png');
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
  debug('features in activePatchs:', req.app.activePatchs.features.length);
  debug('features in unactivePatchs:', req.app.unactivePatchs.features.length);
  debug('fin du clear');
  res.status(200).send('clear: all patches deleted');
});

module.exports = router;
