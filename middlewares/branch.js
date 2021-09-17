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

  let found = false;
  try {
    found = await db.isBranchValid(req.client, idBranch);
  } catch (error) {
    debug(error);
  }
  if (!found) {
    req.error = {
      msg: 'branch does not exist',
      code: 400,
      function: 'validBranch',
    };
  }
  next();
}

async function getBranches(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  debug('~~~get branches~~~');
  let branches;
  try {
    branches = await db.getBranches(req.client, global.id_cache);
  } catch (error) {
    debug(error);
  }
  req.result = { json: branches, code: 200 };
  next();
}

async function insertBranch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { name } = params;
  debug('~~~post branch~~~');

  try {
    const idBranch = await db.insertBranch(req.client, name, global.id_cache);
    debug(idBranch);
    req.result = { json: { name, id: idBranch }, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: 'A branch with this name already exists',
      code: 406,
      function: 'validBranch',
    };
  }
  next();
}

async function deleteBranch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { branchId } = params;
  debug('~~~delete branch~~~', branchId);

  try {
    const branchName = await db.deleteBranch(req.client, branchId, global.id_cache);
    debug(branchName);
    req.result = { json: `branche '${branchName}' détruite`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: `Impossible de détruire la branche : '${branchId}'`,
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
};
