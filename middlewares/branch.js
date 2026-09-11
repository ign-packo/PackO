const debug = require('debug')('branch');
const fs = require('fs');
const path = require('path');
const { matchedData } = require('express-validator');
const db = require('../db/db');
const pgClient = require('./pgClient');
const patch = require('./patch');
const cog = require('../cog_path');

async function getBranches(req, _res, next) {
  debug('>>GET branches');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idCache } = params;
  try {
    const branches = await db.getBranches(req.client, idCache);
    if (this.column) {
      // req.result = { getBranches: branches.map((branch) => branch[this.column]), code: 200 };
      if (!req.result) req.result = {};
      req.result.getBranches = branches.map((branch) => branch[this.column]);
    } else {
      req.result = { json: branches, code: 200 };
    }
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function postBranch(req, _res, next) {
  debug('>>POST Branch');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { name, idCache } = params;

  try {
    const idBranch = await db.insertBranch(req.client, name, idCache);
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
  debug('  next>>');
  next();
}

async function deleteBranch(req, _res, next) {
  debug('>>DELETE branch');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;

  try {
    const branchName = await db.deleteBranch(req.client, idBranch);
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
  debug('  next>>');
  next();
}

async function initMergeBranch(pgClientRequest, nameNewBranch, idBase, cache, overviews) {
  // establishment of the new branch
  const idNewBranch = await db.insertBranch(pgClientRequest, nameNewBranch, cache.id);
  debug('new branch : ', idNewBranch);
  // incorporation of the database corrections into this new branch
  const patches = await db.getActivePatches(pgClientRequest, idBase);
  let selectedSlabs = new Set();
  patches.features.forEach(async (feature) => {
    // the tiles are added to the list of affected tiles
    feature.properties.slabs.forEach((slab) => {
      selectedSlabs.add(JSON.stringify(slab));
    });
  });
  selectedSlabs = Array.from(selectedSlabs).map((slab) => JSON.parse(slab));
  debug('slabs to copy : ', selectedSlabs, idBase, idNewBranch);
  // We copy the image files to the cache for this new branch
  selectedSlabs.forEach((slab) => {
    const cogPath = cog.getSlabPath(
      slab[0],
      slab[1],
      slab[2],
      overviews.pathDepth,
    );
    const graphDir = path.join(cache.path, 'graph', cogPath.dirPath);
    const orthoDir = path.join(cache.path, 'ortho', cogPath.dirPath);
    const opiDir = path.join(cache.path, 'opi', cogPath.dirPath);
    debug(orthoDir);
    const arrayLinkOrtho = fs.readdirSync(orthoDir).filter(
      (filename) => (filename.startsWith(`${idBase}_${cogPath.filename}`)),
    );
    const regex = new RegExp(`^${idBase}_`);
    debug(regex);
    arrayLinkOrtho.forEach((file) => {
      const newName = file.replace(regex, `${idNewBranch}_`);
      debug('copy ', file, newName);
      // fs.copyFileSync(path.join(orthoDir, file), path.join(orthoDir, newName));
      const data = fs.readFileSync(path.join(orthoDir, file));
      fs.writeFileSync(path.join(orthoDir, newName), data);
    });
    debug(graphDir);
    const arrayLinkGraph = fs.readdirSync(graphDir).filter(
      (filename) => (filename.startsWith(`${idBase}_${cogPath.filename}`)),
    );
    arrayLinkGraph.forEach((file) => {
      const newName = file.replace(regex, `${idNewBranch}_`);
      debug('copy ', file, newName);
      // fs.copyFileSync(path.join(graphDir, file), path.join(graphDir, newName));
      const data = fs.readFileSync(path.join(graphDir, file));
      fs.writeFileSync(path.join(graphDir, newName), data);
    });
    debug(opiDir);
    const arrayLinkOpi = fs.readdirSync(opiDir).filter(
      (filename) => (filename.startsWith(`${idBase}_${cogPath.filename}`)),
    );
    arrayLinkOpi.forEach((file) => {
      const newName = file.replace(regex, `${idNewBranch}_`);
      debug('copy ', file, newName);
      // fs.copyFileSync(path.join(opiDir, file), path.join(opiDir, newName));
      const data = fs.readFileSync(path.join(opiDir, file));
      fs.writeFileSync(path.join(opiDir, newName), data);
    });
  });
  // We add the patches to the database on this new branch
  for (const feature of patches.features) {
    debug(feature.properties);
    const patchInserted = await db.insertPatch(pgClientRequest,
      idNewBranch,
      feature.geometry,
      {
        ref: feature.properties.id_opi,
        sec: feature.properties.id_opisec,
      },
      feature.properties.is_auto);
    const idNewPatch = patchInserted.id_patch;

    const slabs = feature.properties.slabs.map((s) => ({ x: s[0], y: s[1], z: s[2] }));

    // Add the slabs corresponding to the patch to the relevant table
    await db.insertSlabs(pgClientRequest, idNewPatch, slabs);
  }
  return idNewBranch;
}

async function merge(req, res, next) {
  debug('~~~merge branch~~~');
  if (req.error) {
    await pgClient.close(req, res, () => {});
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch, name } = params;
  debug(idBranch, name);
  // We retrieve and remove the first value from the array of branch IDs
  const idBase = idBranch.shift();
  let idNewBranch;

  // Check that the branches are on the same cache
  const cache = await db.getCache(req.client, idBase);
  const branchesCache = await db.getBranches(req.client, cache.id);
  const idBranchesCache = branchesCache.map((branch) => branch.id);
  const idsMiss = idBranch.find((id) => !idBranchesCache.includes(id));
  if (idsMiss) {
    req.error = {
      msg: `Branch '${idsMiss}' is not part of the cache ${cache.id}`,
      code: 406,
      function: 'merge',
    };
    await pgClient.close(req, res, () => {});
    next();
    return;
  }

  // We start by creating a copy of the branch
  // with the correct name and a new ID
  try {
    idNewBranch = await initMergeBranch(req.client, name, idBase,
      cache, req.overviews);
  } catch (error) {
    debug(error);
    req.error = {
      msg: `Branch '${idBase}' merge failed with error: ${error.message}`,
      code: 406,
      function: 'merge',
    };
    await pgClient.close(req, res, () => {});
    next();
    return;
  }

  // As this may take a long time, we need to set up a process
  const idProcess = await db.createProcess(req.client,
    `base: ${idBase} + branch: ${idBranch} -> ${idNewBranch} (${name})`);
  // It returns the thread ID, its name and the process ID
  req.result = { json: { name, idNewBranch, idProcess }, code: 200 };
  next();
  //  We apply the patches from the other branches to this new branch
  debug(`Loop on ids Branches ${idBranch}`);
  try {
    for (const [i, idBr] of idBranch.entries()) {
      // We make a commit for the first part of the merge and
      // open a transaction for each branch operation
      await db.endTransaction(req.client, !(req.error));
      await db.beginTransaction(req.client);
      // Processing a branch
      const patches = await db.getActivePatches(req.client, idBr);
      patches.features.sort((el1, el2) => el1.properties.id - el2.properties.id);
      debug('>>applyPatches', patches.features);
      // Cloning patches to modify one of them
      const patchWithOneFeature = JSON.parse(JSON.stringify(patches));
      for (const feature of patches.features) {
        patchWithOneFeature.features = [feature];
        await patch.applyPatch(
          req.client,
          req.overviews,
          cache.path,
          idNewBranch,
          patchWithOneFeature,
        );
      }
      debug('end to applyPatches');
      // Add patches applied to the patches in the branch
      await db.updateProcess(req.client, idProcess, `${((i + 1) / nbBranch) * 100}%`);
    }
    await db.finishProcess(req.client, 'succeed', idProcess, 'done');
  } catch (error) {
    debug(error);
    await db.finishProcess(req.client, 'failed', idProcess, 'done');
  }
  pgClient.close(req, res, () => {});
}

async function getCachePath(req, _res, next) {
  debug('>>GET CachePath');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  let { idBranch } = params;
  if (Array.isArray(idBranch)) {
    [idBranch] = idBranch;
  }
  try {
    req.dir_cache = await db.getCachePath(req.client, idBranch);
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

module.exports = {
  getBranches,
  postBranch,
  deleteBranch,
  merge,
  getCachePath,
};
