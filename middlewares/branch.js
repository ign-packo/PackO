const debug = require('debug')('branch');
const fs = require('fs');
const path = require('path');
const { matchedData } = require('express-validator');
const db = require('../db/db');
const cog = require('../cog_path');
const patch = require('./patch');

async function validBranch(req, _res, next) {
  debug('~~~validBranch~~~');
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
      msg: `Branch '${idBranch}' can't be deleted`,
      code: 400,
      function: 'deleteBranch',
    };
  }
  next();
}

async function rebase(req, _res, next) {
  debug('~~~rebase branch~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { name } = params;
  const { idBase } = params;
  debug(idBranch, name, idBase);

  // On commence par creer une copie de la branche
  // avec le bon nom et un nouvel id
  try {
    // on récupére le cache correspondant aux deux branches
    const cache = await db.getCache(req.client, idBranch);
    const cacheBase = await db.getCache(req.client, idBase);
    if (cache.id !== cacheBase.id) {
      throw new Error('error rebase on two different caches');
    }
    // creation de la nouvelle branche
    const idNewBranch = await db.insertBranch(req.client, name, cache.id);
    debug('nouvelle branche : ', idNewBranch);
    // reprise des corrections de la base dans cette nouvelle branche
    const patches = await db.getActivePatches(req.client, idBase);
    let selectedSlabs = new Set();
    patches.features.forEach(async (feature) => {
      // on ajoute les dalles dans la liste des dalles impactées
      feature.properties.slabs.forEach((slab) => {
        selectedSlabs.add(JSON.stringify(slab));
      });
    });
    selectedSlabs = Array.from(selectedSlabs).map((slab) => JSON.parse(slab));
    debug('tuiles a copier : ', selectedSlabs, idBase, idNewBranch);
    // on copie les fichers images dans le cache pour cette nouvelle branche
    selectedSlabs.forEach((slab) => {
      const cogPath = cog.getSlabPath(
        slab[0],
        slab[1],
        slab[2],
        req.overviews,
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
        fs.copyFileSync(path.join(orthoDir, file), path.join(orthoDir, newName));
      });
      debug(graphDir);
      const arrayLinkGraph = fs.readdirSync(graphDir).filter(
        (filename) => (filename.startsWith(`${idBase}_${cogPath.filename}`)),
      );
      arrayLinkGraph.forEach((file) => {
        const newName = file.replace(regex, `${idNewBranch}_`);
        debug('copy ', file, newName);
        fs.copyFileSync(path.join(graphDir, file), path.join(graphDir, newName));
      });
      debug(opiDir);
      const arrayLinkOpi = fs.readdirSync(opiDir).filter(
        (filename) => (filename.startsWith(`${idBase}_${cogPath.filename}`)),
      );
      arrayLinkOpi.forEach((file) => {
        const newName = file.replace(regex, `${idNewBranch}_`);
        debug('copy ', file, newName);
        fs.copyFileSync(path.join(opiDir, file), path.join(opiDir, newName));
      });
    });
    // on ajoute les patchs dans la BD sur cette nouvelle branche
    /* eslint-disable-next-line */
    for (const feature of patches.features) {
      // on insert ce patch dans les MTD de la branche
      debug(feature.properties);
      /* eslint-disable-next-line */
      const idNewPatch = await db.insertPatch(req.client,
        idNewBranch,
        feature,
        feature.properties.id_opi);
      const slabs = [];

      /* eslint-disable-next-line */
      for (const s of feature.properties.slabs) {
        slabs.push({ x: s[0], y: s[1], z: s[2] });
      }
      // ajouter les slabs correspondant au patch dans la table correspondante
      /* eslint-disable-next-line */
      const result = await db.insertSlabs(req.client, idNewPatch, slabs);
      debug(idNewPatch);
    }
    // on applique les patchs de idBranch dans cette nouvelle branche
    const patches2 = await db.getActivePatches(req.client, idBranch);
    debug('patches2 : ', patches2);
    await patch.applyPatches(req.client,
      req.overviews,
      cache.path,
      idNewBranch,
      patches2.features);
    req.result = { json: { name, id: idNewBranch }, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: `Branch '${idBranch}' rebase failed`,
      code: 406,
      function: 'rebase',
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
  rebase,
};
