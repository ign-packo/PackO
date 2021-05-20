const fs = require('fs');
const path = require('path');
const debug = require('debug')('branch');
const router = require('express').Router();
const { matchedData, query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/branches', (req, res) => {
  debug('~~~get branches~~~');
  const branchWithoutPatchs = [];
  req.app.branches.forEach((branch) => {
    branchWithoutPatchs.push({ id: branch.id, name: branch.name });
  });
  res.status(200).send(JSON.stringify(branchWithoutPatchs));
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
    res.status(406).send('A branch with this name already exist');
    return;
  }
  // on crée la nouvelle branche
  req.app.branches.push({
    id: largestId + 1,
    name,
    activePatchs: {
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
    unactivePatchs: {
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

module.exports = router;
