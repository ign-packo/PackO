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

async function rebase(req, res, next) {
  debug('~~~rebase branch~~~');
  if (req.error) {
    await pgClient.close(req, res);
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { name } = params;
  const { idBase } = params;
  debug(idBranch, name, idBase);
  let idNewBranch = null;
  let cache = null;

  // On commence par creer une copie de la branche
  // avec le bon nom et un nouvel id
  try {
    if (idBranch === idBase) {
      throw new Error('impossible to rebase a branch on itself');
    }
    // on récupére le cache correspondant aux deux branches
    cache = await db.getCache(req.client, idBranch);
    const cacheBase = await db.getCache(req.client, idBase);
    if (cache.id !== cacheBase.id) {
      throw new Error('impossible to rebase on two different caches');
    }
    // creation de la nouvelle branche
    idNewBranch = await db.insertBranch(req.client, name, cache.id);
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
      const patchInserted = await db.insertPatch(req.client,
        idNewBranch,
        feature.geometry,
        feature.properties.id_opi);
      const idNewPatch = patchInserted.id_patch;

      const slabs = [];

      /* eslint-disable-next-line */
      for (const s of feature.properties.slabs) {
        slabs.push({ x: s[0], y: s[1], z: s[2] });
      }

      // ajouter les slabs correspondant au patch dans la table correspondante
      /* eslint-disable-next-line */
      await db.insertSlabs(req.client, idNewPatch, slabs);
    }
  } catch (error) {
    debug(error);
    req.error = {
      msg: `Branch '${idBranch}' rebase failed with error: ${error.message}`,
      code: 406,
      function: 'rebase',
    };
    await pgClient.close(req, res, () => {});
    next();
    return;
  }
  // on applique les patchs de idBranch dans cette nouvelle branche
  // Comme cela peut-être long
  // il faut créer un processus
  const idProcess = await db.createProcess(req.client);
  // On fait un commit pour la première partie du rebase et on ouvre une transaction pour la suite
  await db.endTransaction(req.client, !(req.error));
  await db.beginTransaction(req.client);
  // on retourne l'identifiant de la branche, son nom et l'identifiant et du processus
  req.result = { json: { name, id: idNewBranch, idProcess }, code: 200 };
  next();
  // a partir de d'ici c'est non bloquant
  try {
    const patches = await db.getActivePatches(req.client, idBranch);
    debug('patches : ', patches);
    await patch.applyPatches(req.client,
      req.overviews,
      cache.path,
      idNewBranch,
      patches.features);
    await db.finishProcess(req.client, 'succeed', idProcess, 'done');
  } catch (error) {
    debug(error);
    await db.finishProcess(req.client, 'failed', idProcess, 'done');
  }
  pgClient.close(req, res, () => {});
}

module.exports = {
  getBranches,
  postBranch,
  deleteBranch,
  rebase,
};
