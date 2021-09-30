const debug = require('debug')('branch');
const { matchedData } = require('express-validator');
const db = require('../db/db');

async function getBranches(req, _res, next) {
  debug('~~~get branches~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idCache } = params;
  // let branches;
  try {
    const branches = await db.getBranches(req.client, idCache);
    if (this.column) {
      req.result = { json: branches.map((branch) => branch[this.column]), code: 200 };
    } else {
      req.result = { json: branches, code: 200 };
    }
  } catch (error) {
    debug(error);
    req.error = error;
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
    if (error.constraint === 'branches_name_id_cache_key') {
      req.error = {
        json: {
          msg: 'A branch with this name already exists.',
          function: 'insertBranch',
        },
        code: 406,
      };
    } else {
      req.error = error;
    }
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
    if (branchName === null) {
      req.error = {
        json: {
          msg: `Branch '${idBranch}' can't be deleted.`,
          function: 'deleteBranch',
        },
        code: 406,
      };
    } else {
      req.result = { json: `branche '${branchName}' détruite`, code: 200 };
    }
  } catch (error) {
    debug(error);
    req.error = error;
  }
  next();
}

module.exports = {
  getBranches,
  insertBranch,
  deleteBranch,
};
