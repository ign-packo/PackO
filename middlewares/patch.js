const debug = require('debug')('patch');
const fs = require('fs');
const path = require('path');
const workerpool = require('workerpool');

const pool = workerpool.pool(`${__dirname}/worker.js`);

function getTiles(features, overviews) {
  const BBox = {};
  features.forEach((feature) => {
    feature.geometry.coordinates[0].forEach((point) => {
      if ('xmin' in BBox) {
        BBox.xmin = Math.min(BBox.xmin, point[0]);
        BBox.xmax = Math.max(BBox.xmax, point[0]);
        BBox.ymin = Math.min(BBox.ymin, point[1]);
        BBox.ymax = Math.max(BBox.ymax, point[1]);
      } else {
        [BBox.xmin, BBox.ymin] = point;
        [BBox.xmax, BBox.ymax] = point;
      }
    });
  });
  debug('~BBox:', 'Done');

  const tiles = [];

  const lvlMin = overviews.dataSet.level.min;
  const lvlMax = overviews.dataSet.level.max;
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  // const Rmax = overviews.resolution;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  // tileSet.forEach((level) => {
  // Array.from({ length: lvlMax - lvlMin + 1 }, (_, i) => i + lvlMin).forEach((level) => {
  for (let level = lvlMin; level <= lvlMax; level += 1) {
    const resolution = overviews.resolution * 2 ** (overviews.level.max - level);
    const x0 = Math.floor((BBox.xmin - xOrigin) / (resolution * tileWidth));
    const x1 = Math.ceil((BBox.xmax - xOrigin) / (resolution * tileWidth));
    const y0 = Math.floor((yOrigin - BBox.ymax) / (resolution * tileHeight));
    const y1 = Math.ceil((yOrigin - BBox.ymin) / (resolution * tileHeight));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        tiles.push({ x: `${x}`, y: `${y}`, z: `${level}` });
      }
    }
  }
  return tiles;
}

function applyPatch(features, overviews, tiles, branch, newPatchId) {
  debug('~~~POST applyPatch');
  const promisesCreatePatch = [];
  debug('~create patch avec workers');
  tiles.forEach((tile) => {
    promisesCreatePatch.push(pool.exec(
      'createPatch', [tile, features, overviews, global.dir_cache, branch.id],
    ));
  });
  return Promise.all(promisesCreatePatch).then((patches) => {
    const promises = [];
    const tilesModified = [];
    debug('~process patch avec workers');
    patches.forEach((patch) => {
      if (patch === null) {
        return;
      }
      /* eslint-disable no-param-reassign */
      patch.urlGraphOutput = path.join(global.dir_cache,
        'graph',
        patch.rok4Path.dirPath,
        `${branch.id}_${patch.rok4Path.filename}_${newPatchId}.png`);
      patch.urlOrthoOutput = path.join(global.dir_cache,
        'ortho', patch.rok4Path.dirPath,
        `${branch.id}_${patch.rok4Path.filename}_${newPatchId}.png`);
      /* eslint-enable no-param-reassign */
      tilesModified.push(patch.tile);
      promises.push(pool.exec(
        'processPatch', [patch],
      ).catch((error) => {
        throw error;
      }));
    });
    debug('', promises.length, 'patchs à appliquer.');
    return Promise.all(promises).then(() => {
      // Tout c'est bien passé
      debug("=> tout c'est bien passé on peut mettre à jour les liens symboliques");
      patches.forEach((patch) => {
        if (patch === null) {
          return;
        }
        const urlHistory = path.join(global.dir_cache,
          'opi',
          patch.rok4Path.dirPath,
          `${branch.id}_${patch.rok4Path.filename}_history.packo`);
        if (patch.withOrig) {
          const history = `orig;${newPatchId}`;
          fs.writeFileSync(`${urlHistory}`, history);
        } else {
          const history = `${fs.readFileSync(`${urlHistory}`)};${newPatchId}`;
          debug(patch.urlGraph);
          debug(' historique :', history);
          fs.writeFileSync(`${urlHistory}`, history);
          fs.unlinkSync(patch.urlGraph);
          fs.unlinkSync(patch.urlOrtho);
        }
        fs.linkSync(patch.urlGraphOutput, patch.urlGraph);
        fs.linkSync(patch.urlOrthoOutput, patch.urlOrtho);
      });
      // on note le patch Id
      features.forEach((feature) => {
        /* eslint-disable no-param-reassign */
        feature.properties.patchId = newPatchId;
        feature.properties.tiles = tilesModified;
        /* eslint-enable no-param-reassign */
      });
      // on ajoute ce patch à l'historique
      debug('=> Patch', newPatchId, 'ajouté');
      /* eslint-disable no-param-reassign */
      branch.activePatchs.features = branch.activePatchs.features.concat(
        features,
      );
      debug('features in activePatchs:', branch.activePatchs.features.length);
      // on purge les patchs inactifs puisqu'on ne pourra plus les appliquer
      branch.unactivePatchs.features = [];
      /* eslint-enable no-param-reassign */
      debug('features in unactivePatchs:', branch.unactivePatchs.features.length);
      return tilesModified;
    }).catch((error) => {
      throw error;
    });
  }).catch((error) => {
    pool.terminate(true);
    throw error;
  });
}

module.exports = {
  getTiles,
  applyPatch,
};

module.exports.workerpool = pool;
