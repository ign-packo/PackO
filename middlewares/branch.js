const debug = require('debug')('branch');
const fs = require('fs');
const path = require('path');
const { matchedData } = require('express-validator');

function validBranch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const selectedBranches = req.app.branches.filter((item) => item.id === Number(idBranch));
  if (selectedBranches.length === 0) {
    req.error = {
      msg: 'branch does not exist',
      code: 400,
      function: 'validBranch',
    };
  } else {
    [req.selectedBranch] = selectedBranches;
  }
  next();
}

function getBranches(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  debug('~~~get branches~~~');
  const branchWithoutPatches = [];
  req.app.branches.forEach((branch) => {
    branchWithoutPatches.push({ id: branch.id, name: branch.name });
  });
  req.result = { json: branchWithoutPatches, code: 200 };
  next();
}

function insertBranch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
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
    req.error = {
      msg: 'A branch with this name already exists',
      code: 406,
      function: 'validBranch',
    };
  } else {
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
    req.result = { json: { name, id: largestId + 1 }, code: 200 };
  }
  next();
}

module.exports = {
  validBranch,
  getBranches,
  insertBranch,
};
