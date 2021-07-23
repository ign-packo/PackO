const debug = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { body, matchedData, param } = require('express-validator');
const GJV = require('geojson-validation');
const branch = require('../middlewares/branch');
const validator = require('../paramValidation/validator');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const cog = require('../cog_path.js');
const gdalProcessing = require('../gdal_processing.js');
const pacthMiddlewares = require('../middlewares/patch');

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

router.get('/:idBranch/patches', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~GET patches');
  res.status(200).send(JSON.stringify(req.selectedBranch.activePatches));
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
  for (let i = 0; i < req.selectedBranch.activePatches.features.length; i += 1) {
    const id = req.selectedBranch.activePatches.features[i].properties.patchId;
    if (newPatchId < id) newPatchId = id;
  }

  newPatchId += 1;

  const cogs = pacthMiddlewares.getCOGs(geoJson.features, overviews);

  pacthMiddlewares.applyPatch(
    geoJson.features,
    overviews,
    cogs,
    req.selectedBranch,
    newPatchId,
  )
    .then((slabsModified) => {
      debug('fin du traitement');
      // on sauve l'historique (au cas ou l'API devrait etre relancee)
      fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));
      res.status(200).send(JSON.stringify(slabsModified));
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
  if (req.selectedBranch.activePatches.features.length === 0) {
    debug('rien à annuler');
    res.status(201).send('nothing to undo');
    return;
  }

  // trouver le patch a annuler: c'est-à-dire sortir les éléments
  // de req.app.activePatches.features avec patchId == lastPatchId
  const lastPatchId = req.selectedBranch.activePatches.features[
    req.selectedBranch.activePatches.features.length - 1]
    .properties.patchId;
  debug(`Patch '${lastPatchId}' à annuler.`);
  const features = [];
  let index = req.selectedBranch.activePatches.features.length - 1;
  const slabs = {};
  while (index >= 0) {
    const feature = req.selectedBranch.activePatches.features[index];
    if (feature.properties.patchId === lastPatchId) {
      features.push(feature);
      req.selectedBranch.activePatches.features.splice(index, 1);
      feature.properties.slabs.forEach((item) => {
        slabs[`${item.x}_${item.y}_${item.z}`] = item;
      });
    }
    index -= 1;
  }
  debug(Object.keys(slabs).length, 'dalles impactées');
  // pour chaque tuile, trouver le numéro de version le plus élevé inférieur au numéro de patch
  const errors = [];
  const histories = [];
  Object.values(slabs).forEach((slab, indexSlab) => {
    debug('slab :', slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

    // on récupère l'historique de cette tuile
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const history = fs.readFileSync(`${urlHistory}`).toString().split(';');
    // on vérifie que le lastPatchId est bien le dernier sur cette tuile
    if (`${history[history.length - 1]}` !== `${lastPatchId}`) {
      debug("erreur d'historique");
      errors.push(`erreur d'historique sur la tuile ${cogPath}`);
      debug('erreur : ', history, lastPatchId);
      // res.status(404).send(`erreur d'historique sur la tuile ${cogPath}`);
    } else {
      histories[indexSlab] = history;
    }
  });
  if (errors.length > 0) {
    res.status(404).send(errors);
    return;
  }
  Object.values(slabs).forEach((slab, indexSlab) => {
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    // on récupère la version à restaurer
    const history = histories[indexSlab];
    const patchIdPrev = history[history.length - 1];
    const idSelected = history[history.length - 2];
    // mise à jour de l'historique
    let newHistory = '';
    for (let i = 0; i < (history.length - 1); i += 1) {
      newHistory += history[i];
      if (i < (history.length - 2)) newHistory += ';';
    }
    debug('newHistory : ', newHistory);
    fs.writeFileSync(`${urlHistory}`, newHistory);
    debug(` dalle ${slab.z}/${slab.y}/${slab.x} : version ${idSelected} selectionnée`);
    // debug(' version selectionnée pour la tuile :', idSelected);
    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    // renommer les images pour pointer sur ce numéro de version
    const urlGraph = path.join(graphDir, `${idBranch}_${cogPath.filename}.tif`);
    const urlOrtho = path.join(orthoDir, `${idBranch}_${cogPath.filename}.tif`);
    const urlGraphSelected = path.join(graphDir, `${idBranch}_${cogPath.filename}_${idSelected}.tif`);
    const urlOrthoSelected = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${idSelected}.tif`);

    // on renomme les anciennes images
    const urlGraphPrev = path.join(graphDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    const urlOrthoPrev = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    pacthMiddlewares.rename(urlGraph, urlGraphPrev);
    pacthMiddlewares.rename(urlOrtho, urlOrthoPrev);

    // on renomme les nouvelles images sauf si c'est la version orig
    if (idSelected !== 'orig') {
      pacthMiddlewares.rename(urlGraphSelected, urlGraph);
      pacthMiddlewares.rename(urlOrthoSelected, urlOrtho);
    }
  });

  req.selectedBranch.unactivePatches.features = req.selectedBranch.unactivePatches.features.concat(
    features,
  );
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug('fin du undo');
  debug('features in activePatches:', req.selectedBranch.activePatches.features.length);
  debug('features in unactivePatches:', req.selectedBranch.unactivePatches.features.length);
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

  if (req.selectedBranch.unactivePatches.features.length === 0) {
    debug('nothing to redo');
    res.status(201).send('nothing to redo');
    return;
  }
  // trouver le patch a refaire: c'est-à-dire sortir les éléments
  // de req.app.unactivePatches.features avec patchId == patchIdRedo
  const patchIdRedo = req.selectedBranch.unactivePatches.features[
    req.selectedBranch.unactivePatches.features.length - 1]
    .properties.patchId;
  debug('patchIdRedo:', patchIdRedo);
  const features = [];
  const slabs = {};
  let index = req.selectedBranch.unactivePatches.features.length - 1;
  while (index >= 0) {
    const feature = req.selectedBranch.unactivePatches.features[index];
    if (feature.properties.patchId === patchIdRedo) {
      features.push(feature);
      feature.properties.slabs.forEach((item) => {
        slabs[`${item.x}_${item.y}_${item.z}`] = item;
      });
      req.selectedBranch.unactivePatches.features.splice(index, 1);
    }
    index -= 1;
  }
  debug(Object.keys(slabs).length, ' dalles impactées');
  // pour chaque tuile, renommer les images
  Object.values(slabs).forEach((slab) => {
    debug(slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    debug(cogPath);
    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

    // on met a jour l'historique
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const history = `${fs.readFileSync(`${urlHistory}`)};${patchIdRedo}`;
    const tabHistory = history.split(';');
    const patchIdPrev = tabHistory[tabHistory.length - 2];
    fs.writeFileSync(`${urlHistory}`, history);
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(graphDir, `${idBranch}_${cogPath.filename}_${patchIdRedo}.tif`);
    const urlOrthoSelected = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${patchIdRedo}.tif`);
    // renommer les images pour pointer sur ce numéro de version
    const urlGraph = path.join(graphDir, `${idBranch}_${cogPath.filename}.tif`);
    const urlOrtho = path.join(orthoDir, `${idBranch}_${cogPath.filename}.tif`);
    // on renomme les anciennes images
    const urlGraphPrev = path.join(graphDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    const urlOrthoPrev = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    if (patchIdPrev !== 'orig') {
      pacthMiddlewares.rename(urlGraph, urlGraphPrev);
      pacthMiddlewares.rename(urlOrtho, urlOrthoPrev);
    }

    // on renomme les nouvelles images
    pacthMiddlewares.rename(urlGraphSelected, urlGraph);
    pacthMiddlewares.rename(urlOrthoSelected, urlOrtho);
  });
  // on remet les features dans req.app.activePatches.features
  req.selectedBranch.activePatches.features = req.selectedBranch.activePatches.features.concat(
    features,
  );
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug('features in activePatches:', req.selectedBranch.activePatches.features.length);
  debug('features in unactivePatches:', req.selectedBranch.unactivePatches.features.length);
  debug('fin du redo');
  res.status(200).send(`redo: patch ${patchIdRedo} reapplied`);
});

router.put('/:idBranch/patches/clear', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~PUT patches/clear');
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    res.status(401).send('unauthorized');
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;
  gdalProcessing.clearCache();
  // pour chaque patch de req.app.activePatches.features
  if (req.selectedBranch.activePatches.features.length === 0) {
    debug(' nothing to clear');
    res.status(201).send('nothing to clear');
    return;
  }
  const { features } = req.selectedBranch.activePatches;

  const slabsDico = {};
  features.forEach((feature) => {
    feature.properties.slabs.forEach((item) => {
      slabsDico[`${item.x}_${item.y}_${item.z}`] = item;
    });
  });
  debug('', Object.keys(slabsDico).length, ' dalles impactées');
  Object.values(slabsDico).forEach((slab) => {
    debug('clear sur : ', slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);

    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

    const arrayLinkGraph = fs.readdirSync(graphDir).filter((filename) => (filename.startsWith(`${idBranch}_${cogPath.filename}`)));
    // suppression des images intermediaires
    arrayLinkGraph.forEach((file) => fs.unlinkSync(
      path.join(graphDir, file),
    ));
    const arrayLinkOrtho = fs.readdirSync(orthoDir).filter((filename) => (filename.startsWith(`${idBranch}_${cogPath.filename}`)));
    // suppression des images intermediaires
    arrayLinkOrtho.forEach((file) => fs.unlinkSync(
      path.join(orthoDir, file),
    ));

    // remise à zéro de l'historique de la tuile
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    fs.unlinkSync(urlHistory);
  });

  req.selectedBranch.activePatches.features = [];
  req.selectedBranch.unactivePatches.features = [];
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug(' features in activePatches:', req.selectedBranch.activePatches.features.length);
  debug(' features in unactivePatches:', req.selectedBranch.unactivePatches.features.length);
  debug('fin du clear');
  res.status(200).send('clear: all patches deleted');
});

module.exports = router;
