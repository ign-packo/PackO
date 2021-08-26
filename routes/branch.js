const fs = require('fs');
const path = require('path');
const debug = require('debug')('branch');
const router = require('express').Router();
const { matchedData, query } = require('express-validator');

const serveur = require('../serveur');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/branches', (req, res) => {
  debug('~~~get branches~~~');
  res.status(200).send(JSON.stringify(serveur.branches));
});

router.post('/branch', [
  query('name')
    .exists().withMessage(createErrMsg.missingParameter('name')),
], validateParams, (req, res) => {
  const params = matchedData(req);
  const { name } = params;
  debug('~~~post branch~~~');

  if (Object.values(serveur.branches).includes(name)) {
    res.status(406).send('A branch with this name already exists');
    return;
  }

  const newBranchId = Math.max(...Object.keys(serveur.branches)) + 1;
  // on crée la nouvelle branche
  req.app.branches.push({
    id: newBranchId,
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
  serveur.branches[newBranchId] = name;
  fs.writeFileSync(path.join(global.dir_cache, '_branches.json'), JSON.stringify(serveur.branches, null, 4));

  res.status(200).send(JSON.stringify({ name, id: newBranchId }));
});

module.exports = router;
