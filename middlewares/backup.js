const debug = require('debug')('backup');
const { matchedData } = require('express-validator');
const db = require('../db/db');

async function getBackups(req, _res, next) {
  debug('~~getBackups');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  try {
    const backups = await db.getBackups(req.client, idBranch);
    req.result = { json: backups, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: error.toString(),
      function: 'getBackup',
      code: 406,
    };
  }
  debug('  next>>');
  next();
}

async function postBackup(req, _res, next) {
  debug('~~postBackup');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;

  try {
    // get patches
    const lastPatchId = (await db.getActivePatches(req.client, idBranch, 1))
      .features[0].properties.id;

    // insert backup in bdd
    const backup = await db.insertBackup(req.client, lastPatchId);

    req.result = { json: { ...backup, last_included_patch_id: lastPatchId }, code: 200 };
  } catch (error) {
    debug(error);
    let err;
    if (error.message.includes("property 'properties' of undefined")) {
      err = new Error(`No patches to save on the ${idBranch} branch.`);
      err.name = 'NoActivePatch';
    } else if (error.message.includes('last_included_patch_id_unique')) {
      err = new Error('No new patches since the last backup on this branch');
      err.name = 'NoNewPatch';
    } else {
      err = error;
    }
    req.error = {
      msg: err.toString(),
      function: 'postBackup',
      code: 406,
    };
  }

  debug('  next>>');
  next();
}

module.exports = {
  getBackups,
  postBackup,
};
