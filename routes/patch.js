const debug = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { body, matchedData, param } = require('express-validator');
const GJV = require('geojson-validation');
// const workerpool = require('workerpool');
const branch = require('../middlewares/branch');
const validator = require('../paramValidation/validator');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const rok4 = require('../rok4.js');
const pacthMiddlewares = require('../middlewares/patch');

// create a worker pool using an external worker script
// const pool = workerpool.pool(`${__dirname}/worker.js`);

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

router.get('/:idBranch/patchs', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~GET patchs');
  res.status(200).send(JSON.stringify(req.selectedBranch.activePatchs));
});

router.post('/:idBranch/patch', encapBody.bind({ keyName: 'geoJSON' }), [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
  ...geoJsonAPatcher,
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~POST patch');

  const { overviews } = req.app;
  const params = matchedData(req);
  const geoJson = params.geoJSON;
  // const { idBranch } = params;

  let newPatchId = 0;
  for (let i = 0; i < req.selectedBranch.activePatchs.features.length; i += 1) {
    const id = req.selectedBranch.activePatchs.features[i].properties.patchId;
    if (newPatchId < id) newPatchId = id;
  }

  newPatchId += 1;

  const tiles = pacthMiddlewares.getTiles(geoJson.features, overviews);
  pacthMiddlewares.applyPatch(
    geoJson.features,
    overviews,
    tiles,
    req.selectedBranch,
    newPatchId,
  )
    .then((tilesModified) => {
      debug('fin du traitement');
      // on sauve l'historique (au cas ou l'API devrait etre relancee)
      fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));
      res.status(200).send(JSON.stringify(tilesModified));
    }).catch((error) => {
      debug('on a reçu une erreur : ', error);
      res.status(404).send(JSON.stringify({
        status: 'File(s) missing',
        errors: [error],
      }));
    });
});

router.put('/:idBranch/patch/undo', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~PUT patch/undo');
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;

  if (req.selectedBranch.activePatchs.features.length === 0) {
    debug('rien à annuler');
    res.status(201).send('nothing to undo');
    return;
  }
  // trouver le patch a annuler: c'est-à-dire sortir les éléments
  // de selectedBranch.activePatchs.features avec patchId == lastPatchId
  const lastPatchId = req.selectedBranch.activePatchs.features[
    req.selectedBranch.activePatchs.features.length - 1]
    .properties.patchId;
  debug(`Patch '${lastPatchId}' à annuler.`);
  const features = [];
  let index = req.selectedBranch.activePatchs.features.length - 1;
  const tiles = new Set();
  while (index >= 0) {
    const feature = req.selectedBranch.activePatchs.features[index];
    if (feature.properties.patchId === lastPatchId) {
      features.push(feature);
      req.selectedBranch.activePatchs.features.splice(index, 1);
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
    const urlHistory = path.join(opiDir, `${idBranch}_${rok4Path.filename}_history.packo`);
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
    const urlGraph = path.join(graphDir, `${idBranch}_${rok4Path.filename}.png`);
    const urlOrtho = path.join(orthoDir, `${idBranch}_${rok4Path.filename}.png`);
    const urlGraphSelected = (idSelected === 'orig')
      ? path.join(graphDir, `${rok4Path.filename}.png`)
      : path.join(graphDir, `${idBranch}_${rok4Path.filename}_${idSelected}.png`);
    const urlOrthoSelected = (idSelected === 'orig')
      ? path.join(orthoDir, `${rok4Path.filename}.png`)
      : path.join(orthoDir, `${idBranch}_${rok4Path.filename}_${idSelected}.png`);
    // on supprime l'ancien lien
    fs.unlinkSync(urlGraph);
    fs.unlinkSync(urlOrtho);
    // on crée le nouveau
    fs.linkSync(urlGraphSelected, urlGraph);
    fs.linkSync(urlOrthoSelected, urlOrtho);
  });

  req.selectedBranch.unactivePatchs.features = req.selectedBranch.unactivePatchs.features.concat(
    features,
  );
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug('fin du undo');
  debug('features in activePatchs:', req.selectedBranch.activePatchs.features.length);
  debug('features in unactivePatchs:', req.selectedBranch.unactivePatchs.features.length);
  res.status(200).send(`undo: patch ${lastPatchId} canceled`);
});

router.put('/:idBranch/patch/redo', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~PUT patch/redo');
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;

  if (req.selectedBranch.unactivePatchs.features.length === 0) {
    debug('nothing to redo');
    res.status(201).send('nothing to redo');
    return;
  }

  // trouver le patch a refaire: c'est-à-dire sortir les éléments
  // de req.app.unactivePatchs.features avec patchId == patchIdRedo
  const patchIdRedo = req.selectedBranch.unactivePatchs.features[
    req.selectedBranch.unactivePatchs.features.length - 1]
    .properties.patchId;
  debug('patchIdRedo:', patchIdRedo);
  const features = [];
  const tiles = new Set();
  let index = req.selectedBranch.unactivePatchs.features.length - 1;
  while (index >= 0) {
    const feature = req.selectedBranch.unactivePatchs.features[index];
    if (feature.properties.patchId === patchIdRedo) {
      features.push(feature);
      feature.properties.tiles.forEach((item) => tiles.add(item));
      req.selectedBranch.unactivePatchs.features.splice(index, 1);
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
    const urlHistory = path.join(opiDir, `${idBranch}_${rok4Path.filename}_history.packo`);
    const history = `${fs.readFileSync(`${urlHistory}`)};${patchIdRedo}`;
    fs.writeFileSync(`${urlHistory}`, history);
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(graphDir, `${idBranch}_${rok4Path.filename}_${patchIdRedo}.png`);
    const urlOrthoSelected = path.join(orthoDir, `${idBranch}_${rok4Path.filename}_${patchIdRedo}.png`);
    // modifier les liens symboliques pour pointer sur ce numéro de version
    const urlGraph = path.join(graphDir, `${idBranch}_${rok4Path.filename}.png`);
    const urlOrtho = path.join(orthoDir, `${idBranch}_${rok4Path.filename}.png`);
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
  req.selectedBranch.activePatchs.features = req.selectedBranch.activePatchs.features.concat(
    features,
  );

  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug('features in activePatchs:', req.selectedBranch.activePatchs.features.length);
  debug('features in unactivePatchs:', req.selectedBranch.unactivePatchs.features.length);
  debug('fin du redo');
  res.status(200).send(`redo: patch ${patchIdRedo} reapplied`);
});

router.put('/:idBranch/patchs/clear', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~PUT patchs/clear');
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    res.status(401).send('unauthorized');
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;

  // pour chaque patch de req.app.activePatchs.features
  if (req.selectedBranch.activePatchs.features.length === 0) {
    debug(' nothing to clear');
    res.status(201).send('nothing to clear');
    return;
  }

  const { features } = req.selectedBranch.activePatchs;

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

      const arrayLinkGraph = fs.readdirSync(graphDir).filter(
        (filename) => (filename.startsWith(`${idBranch}_${rok4Path.filename}`)),
      );
      // suppression des images intermediaires
      arrayLinkGraph.forEach((file) => fs.unlinkSync(
        path.join(graphDir, file),
      ));
      const arrayLinkOrtho = fs.readdirSync(orthoDir).filter(
        (filename) => (filename.startsWith(`${idBranch}_${rok4Path.filename}`)),
      );
      // suppression des images intermediaires
      arrayLinkOrtho.forEach((file) => fs.unlinkSync(
        path.join(orthoDir, file),
      ));
      // supression de l'historique
      const urlHistory = path.join(opiDir, `${idBranch}_${rok4Path.filename}_history.packo`);
      fs.unlinkSync(urlHistory);
    });
  });

  req.selectedBranch.activePatchs.features = [];
  req.selectedBranch.unactivePatchs.features = [];
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug(' features in activePatchs:', req.selectedBranch.activePatchs.features.length);
  debug(' features in unactivePatchs:', req.selectedBranch.unactivePatchs.features.length);
  debug('fin du clear');
  res.status(200).send('clear: all patches deleted');
});

module.exports = router;
// module.exports.workerpool = pool;
