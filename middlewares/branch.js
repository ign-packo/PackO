const debug = require('debug')('branch');
const fs = require('fs');
const path = require('path');
const { matchedData } = require('express-validator');
const db = require('../db/db');

async function validBranch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;

  try {
    req.dir_cache = await db.getCachePath(req.client, idBranch);
  } catch (error) {
    debug(error);
    req.error = {
      msg: 'branch does not exist',
      code: 400,
      function: 'validBranch',
    };
    debug('ERROR', req.error);
  }
  next();
}

async function getOverviews(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const overviewsFileName = path.join(req.dir_cache, 'overviews.json');
  fs.readFile(overviewsFileName, (error, data) => {
    if (error) {
      debug(error);
      req.error = {
        msg: 'overviews does not exist',
        code: 400,
        function: 'getOverviews',
      };
    } else {
      req.overviews = JSON.parse(data);
    }
    next();
  });
}

async function getBranches(req, _res, next) {
  debug('~~~get branches~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idCache } = params;
  let branches;
  try {
    branches = await db.getBranches(req.client, idCache);
  } catch (error) {
    debug(error);
  }
  if (this.column) {
    req.result = { json: branches.map((branch) => branch[this.column]), code: 200 };
  } else {
    req.result = { json: branches, code: 200 };
  }
  next();
}

async function insertBranch(req, _res, next) {
  debug('~~~insert Branch~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { name, idCache } = params;

  try {
    const idBranch = await db.insertBranch(req.client, name, idCache);
    debug(idBranch);
    req.result = { json: { name, id: idBranch }, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: 'A branch with this name already exists',
      code: 406,
      function: 'insertBranch',
    };
  }
  next();
}

async function deleteBranch(req, _res, next) {
  debug('~~~delete branch~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;

  try {
    const branchName = await db.deleteBranch(req.client, idBranch, global.id_cache);
    debug(branchName);
    req.result = { json: `branche '${branchName}' détruite`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: `Impossible de détruire la branche : '${idBranch}'`,
      code: 406,
      function: 'deleteBranch',
    };
  }
  next();
}

module.exports = {
  validBranch,
  getBranches,
  insertBranch,
  deleteBranch,
  getOverviews,
};
