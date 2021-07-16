const debug = require('debug')('branch');
const { matchedData } = require('express-validator');
const path = require('path');
const fs = require('fs');
const cog = require('../cog_path.js');
const pacthMiddlewares = require('./patch');

function validBranch(req, res, next) {
  const params = matchedData(req);
  const { idBranch } = params;
  const selectedBranches = req.app.branches.filter((item) => item.id === Number(idBranch));
  if (selectedBranches.length === 0) {
    return res.status(400).json({
      errors: 'branch does not exist',
    });
  }
  [req.selectedBranch] = selectedBranches;
  return next();
}

function createCopy(newBranch, selectedBranch, overviews) {
  debug('~~~createCopy~~~');
  const { id } = selectedBranch;

  // on cherche les tuiles de façon unique (pour ne passer qu'une fois dans chaque tuile)
  let selectedSlabs = new Set();
  selectedBranch.activePatches.features.forEach((feature) => {
    feature.properties.slabs.forEach((slab) => {
      selectedSlabs.add(JSON.stringify(slab));
    });
  });
  selectedSlabs = Array.from(selectedSlabs).map((slab) => JSON.parse(slab));

  debug('tuiles a copier : ', selectedSlabs);
  selectedSlabs.forEach((slab) => {
    const cogPath = cog.getSlabPath(
      slab.x,
      slab.y,
      slab.z,
      overviews,
    );
    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);
    debug(orthoDir);
    const arrayLinkOrtho = fs.readdirSync(orthoDir).filter(
      (filename) => (filename.startsWith(`${id}_${cogPath.filename}`)),
    );
    const regex = new RegExp(`^${id}_`);
    debug(regex);
    arrayLinkOrtho.forEach((file) => {
      const newName = file.replace(regex, `${newBranch.id}_`);
      debug('copy ', file, newName);
      fs.copyFileSync(path.join(orthoDir, file), path.join(orthoDir, newName));
    });
    debug(graphDir);
    const arrayLinkGraph = fs.readdirSync(graphDir).filter(
      (filename) => (filename.startsWith(`${id}_${cogPath.filename}`)),
    );
    arrayLinkGraph.forEach((file) => {
      const newName = file.replace(regex, `${newBranch.id}_`);
      debug('copy ', file, newName);
      fs.copyFileSync(path.join(graphDir, file), path.join(graphDir, newName));
    });
    debug(opiDir);
    const arrayLinkOpi = fs.readdirSync(opiDir).filter(
      (filename) => (filename.startsWith(`${id}_${cogPath.filename}`)),
    );
    arrayLinkOpi.forEach((file) => {
      const newName = file.replace(regex, `${newBranch.id}_`);
      debug('copy ', file, newName);
      fs.copyFileSync(path.join(opiDir, file), path.join(opiDir, newName));
    });
  });
  // on transfert les patchs
  /* eslint-disable no-param-reassign */
  newBranch.activePatches.features = selectedBranch.activePatches.features;
  /* eslint-enable no-param-reassign */
  debug('features in activePatches:', newBranch.activePatches.features.length);
  debug('~~~fin createCopy~~~');
}

function applyAllPatches(newBranch, features, overviews) {
  return features.reduce((previousPromise, nextFeature) => previousPromise.then(() => {
    /* eslint-disable no-param-reassign */
    nextFeature.properties.patchId = newBranch.activePatches.features.length + 1;
    /* eslint-enable no-param-reassign */
    debug('application de ', nextFeature);
    return pacthMiddlewares.applyPatch(
      [nextFeature],
      overviews,
      nextFeature.properties.slabs,
      newBranch,
      nextFeature.properties.patchId,
    );
  }),
  Promise.resolve());
}

module.exports = {
  validBranch,
  createCopy,
  applyAllPatches,
};
