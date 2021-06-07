const { matchedData } = require('express-validator');
const debug = require('debug')('branch');
const fs = require('fs');
const path = require('path');
const pacthMiddlewares = require('./patch');
const rok4 = require('../rok4.js');

function valbranchId(req, res, next) {
  const params = matchedData(req);
  const { branchId } = params;
  const selectedBranches = req.app.branches.filter((item) => item.id === Number(branchId));
  debug('selectedBranches : ', selectedBranches);
  if (selectedBranches.length === 0) {
    return res.status(400).json({
      errors: 'branch does not exist',
    });
  }
  [req.selectedBranch] = selectedBranches;
  return next();
}

function validUser(req, res, next) {
  const params = matchedData(req);
  const { userId } = params;
  if (req.selectedBranch.user !== userId) {
    debug('non valid user for selectedBranch');
    return res.status(400).json({
      errors: `branch already edited by ${req.selectedBranch.user}`,
    });
  }
  return next();
}

function createCopy(newBranch, selectedBranch, overviews) {
  debug('~~~createCopy~~~');
  const { id } = selectedBranch;

  // on cherche les tuiles de façon unique (pour ne passer qu'une fois dans chaque tuile)
  let selectedTiles = new Set();
  selectedBranch.activePatchs.features.forEach((feature) => {
    feature.properties.tiles.forEach((tile) => {
      selectedTiles.add(JSON.stringify(tile));
    });
  });
  // selectedBranch.unactivePatchs.features.forEach((feature) => {
  //   debug('On purge : ', feature);
  //   feature.properties.tiles.forEach((tile) => {
  //     selectedTiles.add(JSON.stringify(tile));
  //   });
  // });
  selectedTiles = Array.from(selectedTiles).map((element) => JSON.parse(element));

  debug('tuiles a copier : ', selectedTiles);
  selectedTiles.forEach((tile) => {
    const rok4Path = rok4.getPath(tile.x, tile.y, tile.z, overviews.pathDepth);
    const graphDir = path.join(global.dir_cache, 'graph', rok4Path.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', rok4Path.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', rok4Path.dirPath);
    debug(orthoDir);
    const arrayLinkOrtho = fs.readdirSync(orthoDir).filter(
      (filename) => (filename.startsWith(`${id}_${rok4Path.filename}`)),
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
      (filename) => (filename.startsWith(`${id}_${rok4Path.filename}`)),
    );
    arrayLinkGraph.forEach((file) => {
      const newName = file.replace(regex, `${newBranch.id}_`);
      debug('copy ', file, newName);
      fs.copyFileSync(path.join(graphDir, file), path.join(graphDir, newName));
    });
    debug(opiDir);
    const arrayLinkOpi = fs.readdirSync(opiDir).filter(
      (filename) => (filename.startsWith(`${id}_${rok4Path.filename}`)),
    );
    arrayLinkOpi.forEach((file) => {
      const newName = file.replace(regex, `${newBranch.id}_`);
      debug('copy ', file, newName);
      fs.copyFileSync(path.join(opiDir, file), path.join(opiDir, newName));
    });
  });
  debug('~~~fin createCopy~~~');
}

function applyNextPatch(newBranch, features, overviews) {
  const feature = features.shift();
  if (feature) {
    feature.patchId = newBranch.activePatchs.length;
    debug('application de ', feature);
    // on vérifie s'il y a un conflit
    // ...
    return pacthMiddlewares.applyPatch(
      [feature], overviews, feature.properties.tiles, newBranch, feature.properties.patchId,
    ).then(
      () => {
        applyNextPatch(newBranch, features, overviews);
      },
    );
  }
  debug('fin des pacths');
  return Promise.resolve();
}

module.exports = {
  valbranchId,
  validUser,
  createCopy,
  applyNextPatch,
};
