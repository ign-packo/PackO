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
  // creation de la nouvelle branche
  const idNewBranch = await db.insertBranch(pgClientRequest, nameNewBranch, cache.id);
  debug('nouvelle branche : ', idNewBranch);
  // reprise des corrections de la base dans cette nouvelle branche
  const patches = await db.getActivePatches(pgClientRequest, idBase);
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
  // on ajoute les patchs dans la BD sur cette nouvelle branche
  for (const feature of patches.features) {
    // on insert ce patch dans les MTD de la branche
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

    // ajouter les slabs correspondant au patch dans la table correspondante
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
  // On récupère est on enléve la premier valeur du tableau d'ids des branches
  const idBase = idBranch.shift();
  let idNewBranch;

  // Vérification que les branches sont sur le même cache
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

  // On commence par creer une copie de la branche
  // avec le bon nom et un nouvel id
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

  // Comme cela peut-être long
  // il faut créer un processus
  const idProcess = await db.createProcess(req.client,
    `base: ${idBase} + branch: ${idBranch} -> ${idNewBranch} (${name})`);
  // on retourne l'identifiant de la branche, son nom et l'identifiant et du processus
  req.result = { json: { idNewBranch, idProcess }, code: 200 };
  next();
  // on applique les patchs des autres Branches dans cette nouvelle branche
  debug(`Boucle sur les ids Banches ${idBranch}`);
  try {
    for (const [i, idBr] of idBranch.entries()) {
      // On fait un commit pour la première partie du merge et on ouvre une transaction
      // pour chaque traitement de branche
      await db.endTransaction(req.client, !(req.error));
      await db.beginTransaction(req.client);
      // Traitement d'une branche
      const patches = await db.getActivePatches(req.client, idBr);
      patches.features.sort((el1, el2) => el1.properties.id - el2.properties.id);
      debug('>>applyPatches', patches.features);
      // Clonage du patches pour en modifier un
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
      debug('fin de applyPatches');
      // Ajout patches appliqués aux patches de la branche
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
