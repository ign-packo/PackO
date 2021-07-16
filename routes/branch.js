const fs = require('fs');
const path = require('path');
const debug = require('debug')('branch');
const router = require('express').Router();
const turf = require('@turf/turf');
const { matchedData, query, param } = require('express-validator');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const branchMiddelwares = require('../middlewares/branch');
const cog = require('../cog_path.js');

router.get('/branches', (req, res) => {
  debug('~~~get branches~~~');
  const branchWithoutPatches = [];
  req.app.branches.forEach((branch) => {
    branchWithoutPatches.push({ id: branch.id, name: branch.name });
  });
  res.status(200).send(JSON.stringify(branchWithoutPatches));
});

router.post('/branch', [
  query('name')
    .exists().withMessage(createErrMsg.missingParameter('name')),
], validateParams, (req, res) => {
  const params = matchedData(req);
  const { name } = params;
  debug('~~~post branch~~~');
  // on vérifie si le nom est deja pris
  let largestId = 0;
  let ok = true;
  req.app.branches.forEach((branch) => {
    largestId = Math.max(largestId, branch.id);
    if (branch.name === name) {
      ok = false;
    }
  });
  if (!ok) {
    res.status(406).send('A branch with this name already exists');
    return;
  }
  // on crée la nouvelle branche
  req.app.branches.push({
    id: largestId + 1,
    name,
    activePatches: {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: {
        type: 'name',
        properties: {
          name: 'urn:ogc:def:crs:EPSG::2154',
        },
      },
      features: [],
    },
    unactivePatches: {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: {
        type: 'name',
        properties: {
          name: 'urn:ogc:def:crs:EPSG::2154',
        },
      },
      features: [],
    },
  });
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  res.status(200).send(JSON.stringify({ name, id: largestId + 1 }));
});

router.delete('/branch/:idBranch', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('id'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('id')),
],
validateParams,
branchMiddelwares.validBranch,
(req, res) => {
  const { overviews } = req.app;
  const params = matchedData(req);
  const id = Number(params.idBranch);
  debug('~~~delete branch~~~');
  if (req.app.branches.length <= 1) {
    res.status(406).send('it is not possible to delete the last branch');
    return;
  }
  debug('Id de la branche a supprimer : ', id);

  // on purge le cache (actif et inactif)
  const { selectedBranch } = req;
  // on cherche les tuiles de façon unique (pour ne passer qu'une fois dans chaque tuile)
  let selectedSlabs = new Set();
  selectedBranch.activePatches.features.forEach((feature) => {
    debug('On purge : ', feature);
    feature.properties.slabs.forEach((slab) => {
      selectedSlabs.add(JSON.stringify(slab));
    });
  });
  selectedBranch.unactivePatches.features.forEach((feature) => {
    debug('On purge : ', feature);
    feature.properties.slabs.forEach((slab) => {
      selectedSlabs.add(JSON.stringify(slab));
    });
  });
  selectedSlabs = Array.from(selectedSlabs).map((slab) => JSON.parse(slab));
  debug('tuiles a pruger : ', selectedSlabs);
  selectedSlabs.forEach((slab) => {
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews.pathDepth);
    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);
    debug(orthoDir);
    const arrayLinkOrtho = fs.readdirSync(orthoDir).filter(
      (filename) => (filename.startsWith(`${id}_${cogPath.filename}`)),
    );
    arrayLinkOrtho.forEach((file) => fs.unlinkSync(
      path.join(orthoDir, file),
    ));
    debug(graphDir);
    const arrayLinkGraph = fs.readdirSync(graphDir).filter(
      (filename) => (filename.startsWith(`${id}_${cogPath.filename}`)),
    );
    arrayLinkGraph.forEach((file) => fs.unlinkSync(
      path.join(graphDir, file),
    ));
    debug(opiDir);
    const arrayLinkOpi = fs.readdirSync(opiDir).filter(
      (filename) => (filename.startsWith(`${id}_${cogPath.filename}`)),
    );
    arrayLinkOpi.forEach((file) => fs.unlinkSync(
      path.join(opiDir, file),
    ));
  });
  // on fait une copie de sauvegarde de la branche
  const timestamp = new Date().getTime();
  fs.writeFileSync(path.join(global.dir_cache, `deleted_branche_${timestamp}.json`), JSON.stringify(selectedBranch, null, 4));
  // on supprime la branche
  req.app.branches = req.app.branches.filter((item) => item.id !== id);
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));
  res.status(200).send(`branch ${id} deleted`);
});

router.post('/rebase', [
  query('name')
    .exists().withMessage(createErrMsg.missingParameter('name')),
  query('firstId')
    .exists().withMessage(createErrMsg.missingParameter('firstId'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('firstId')),
  query('secondId')
    .exists().withMessage(createErrMsg.missingParameter('secondId'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('secondId')),
],
validateParams,
(req, res) => {
  const { overviews } = req.app;
  const params = matchedData(req);
  const { name } = params;
  const firstId = Number(params.firstId);
  const secondId = Number(params.secondId);
  debug('~~~post rebase~~~');
  debug(firstId, ' + ', secondId, ' -> ', name);
  // on verifie que les deux branches sont valides
  const firstBranches = req.app.branches.filter((item) => item.id === Number(firstId));
  const secondBranches = req.app.branches.filter((item) => item.id === Number(secondId));
  if (firstBranches.length === 0) {
    res.status(400).json({
      errors: 'branch does not exist',
    });
    return;
  }
  const [firstBranch] = firstBranches;
  if (secondBranches.length === 0) {
    res.status(400).json({
      errors: 'branch does not exist',
    });
    return;
  }
  const [secondBranch] = secondBranches;
  // on vérifie si le nom est deja pris
  let largestId = 0;
  let ok = true;
  req.app.branches.forEach((branch) => {
    largestId = Math.max(largestId, branch.id);
    if (branch.name === name) {
      ok = false;
    }
  });
  if (!ok) {
    res.status(406).send('A branch with this name already exist');
    return;
  }
  // on crée la nouvelle branche
  const newBranch = {
    id: largestId + 1,
    name,
    activePatches: {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: {
        type: 'name',
        properties: {
          name: 'urn:ogc:def:crs:EPSG::2154',
        },
      },
      features: [],
    },
    unactivePatches: {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: {
        type: 'name',
        properties: {
          name: 'urn:ogc:def:crs:EPSG::2154',
        },
      },
      features: [],
    },
  };
  // on recupere l'historique de la premiere branche
  branchMiddelwares.createCopy(newBranch, firstBranch, overviews);

  const features = [...secondBranch.activePatches.features];

  // on detecte les conflits entre les deux branches
  newBranch.conflicts = [];
  secondBranch.activePatches.features.forEach((feature) => {
    const fc = turf.featureCollection([feature]);
    if (turf.booleanIntersects(fc, firstBranch.activePatches)) {
      newBranch.conflicts.push(feature);
    }
  });

  // on applique l'historique de la deuxième branche
  branchMiddelwares.applyAllPatches(newBranch, features, overviews).then(() => {
    debug('finalisation');
    // on insere la nouvelle branche
    req.app.branches.push(newBranch);
    fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));
    res.status(200).send(JSON.stringify({ name, id: largestId + 1 }));
  });
});

module.exports = router;
