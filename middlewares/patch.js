const debug = require('debug')('patch');
const PImage = require('pureimage');
const turf = require('@turf/turf');
const fs = require('fs');
const path = require('path');
const gdalProcessing = require('../gdal_processing.js');
const cog = require('../cog_path.js');

function rename(url, urlOrig) {
  gdalProcessing.clearCache();
  fs.renameSync(url, urlOrig);
}

function getCOGs(features, overviews) {
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

  const cogs = [];

  const lvlMax = overviews.dataSet.level.max;
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const slabWidth = overviews.tileSize.width * overviews.slabSize.width;
  const slabHeight = overviews.tileSize.height * overviews.slabSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - lvlMax);
  const x0 = Math.floor((BBox.xmin - xOrigin) / (resolution * slabWidth));
  const x1 = Math.ceil((BBox.xmax - xOrigin) / (resolution * slabWidth));
  const y0 = Math.floor((yOrigin - BBox.ymax) / (resolution * slabHeight));
  const y1 = Math.ceil((yOrigin - BBox.ymin) / (resolution * slabHeight));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      cogs.push({ x: `${x}`, y: `${y}`, z: `${lvlMax}` });
    }
  }
  return cogs;
}

// Preparation des masques
function createPatch(slab, features, overviews, dirCache, idBranch) {
  debug('createPatch : ', slab);
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const slabWidth = overviews.tileSize.width * overviews.slabSize.width;
  const slabHeight = overviews.tileSize.height * overviews.slabSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - slab.z);
  const inputRings = [];
  for (let f = 0; f < features.length; f += 1) {
    const feature = features[f];
    for (let n = 0; n < feature.geometry.coordinates.length; n += 1) {
      const coordinates = feature.geometry.coordinates[n];
      const ring = [];
      for (let i = 0; i < coordinates.length; i += 1) {
        const point = coordinates[i];
        const x = Math.round((point[0] - xOrigin - slab.x * slabWidth * resolution)
                / resolution);
        const y = Math.round((yOrigin - point[1] - slab.y * slabHeight * resolution)
                / resolution) + 1;
        ring.push([x, y]);
      }
      inputRings.push(ring);
    }
  }

  const bbox = [0, 0, slabWidth, slabHeight + 1];
  const poly = turf.polygon(inputRings);
  const clipped = turf.bboxClip(poly, bbox);
  const rings = clipped.geometry.coordinates;

  if (rings.length === 0) {
    debug('masque vide, on passe a la suite : ', slab);
    return null;
  }

  // La BBox et le polygone s'intersectent
  debug('on calcule un masque : ', slab);
  // Il y a parfois un bug sur le dessin du premier pixel
  // on cree donc un masque une ligne de plus
  const mask = PImage.make(slabWidth, slabHeight + 1);
  const ctx = mask.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  for (let n = 0; n < rings.length; n += 1) {
    const ring = rings[n];
    // console.log(ring);
    ctx.beginPath();
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i += 1) {
      ctx.lineTo(ring[i][0], ring[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  const patch = { slab, mask, color: features[0].properties.color };
  patch.cogPath = cog.getSlabPath(
    patch.slab.x,
    patch.slab.y,
    patch.slab.z,
    overviews,
  );
  patch.urlGraph = path.join(dirCache, 'graph', patch.cogPath.dirPath,
    `${idBranch}_${patch.cogPath.filename}.tif`);
  patch.urlOrtho = path.join(dirCache, 'ortho', patch.cogPath.dirPath,
    `${idBranch}_${patch.cogPath.filename}.tif`);
  patch.urlOpi = path.join(dirCache, 'opi', patch.cogPath.dirPath,
    `${patch.cogPath.filename}_${features[0].properties.cliche}.tif`);
  patch.urlGraphOrig = path.join(dirCache, 'graph', patch.cogPath.dirPath,
    `${patch.cogPath.filename}.tif`);
  patch.urlOrthoOrig = path.join(dirCache, 'ortho', patch.cogPath.dirPath,
    `${patch.cogPath.filename}.tif`);
  patch.withOrig = false;
  const checkGraph = fs.promises.access(patch.urlGraph, fs.constants.F_OK).catch(
    () => {
      fs.promises.access(patch.urlGraphOrig, fs.constants.F_OK);
      patch.withOrig = true;
    },
  );
  const checkOrtho = fs.promises.access(patch.urlOrtho, fs.constants.F_OK).catch(
    () => {
      fs.promises.access(patch.urlOrthoOrig, fs.constants.F_OK);
      patch.withOrig = true;
    },
  );
  const checkOpi = fs.promises.access(patch.urlOpi, fs.constants.F_OK);
  return Promise.all([checkGraph, checkOrtho, checkOpi]).then(() => patch);
}

function applyPatch(features, overviews, cogs, branch, newPatchId) {
  const promisesCreatePatch = [];
  debug('~create patch');
  cogs.forEach((aCog) => {
    promisesCreatePatch.push(createPatch(aCog,
      features,
      overviews,
      global.dir_cache,
      branch.id));
  });
  return Promise.all(promisesCreatePatch).then((patches) => {
    const promises = [];
    const slabsModified = [];

    debug('~process patch');
    patches.forEach((patch) => {
      if (patch === null) {
        return;
      }
      /* eslint-disable no-param-reassign */
      patch.urlGraphOutput = path.join(global.dir_cache,
        'graph',
        patch.cogPath.dirPath,
        `${branch.id}_${patch.cogPath.filename}_${newPatchId}.tif`);
      patch.urlOrthoOutput = path.join(global.dir_cache,
        'ortho', patch.cogPath.dirPath,
        `${branch.id}_${patch.cogPath.filename}_${newPatchId}.tif`);
      /* eslint-enable no-param-reassign */
      slabsModified.push(patch.slab);

      promises.push(gdalProcessing.processPatch(patch, overviews.tileSize.width).catch((err) => {
        debug(err);
        throw err;
      }));
    });
    debug('', promises.length, 'patchs à appliquer.');
    return Promise.all(promises).then(() => {
      // Tout c'est bien passé
      debug("=> tout c'est bien passé on peut renommer les images");
      patches.forEach((patch) => {
        if (patch === null) {
          return;
        }
        const urlHistory = path.join(global.dir_cache,
          'opi',
          patch.cogPath.dirPath,
          `${branch.id}_${patch.cogPath.filename}_history.packo`);
        if (fs.existsSync(urlHistory)) {
          debug('history existe');
          const history = `${fs.readFileSync(`${urlHistory}`)};${newPatchId}`;
          const tabHistory = history.split(';');
          const prevId = tabHistory[tabHistory.length - 2];

          const urlGraphPrev = path.join(global.dir_cache, 'graph', patch.cogPath.dirPath,
            `${branch.id}_${patch.cogPath.filename}_${prevId}.tif`);
          const urlOrthoPrev = path.join(global.dir_cache, 'ortho', patch.cogPath.dirPath,
            `${branch.id}_${patch.cogPath.filename}_${prevId}.tif`);

          debug(patch.urlGraph);
          debug(' historique :', history);
          fs.writeFileSync(`${urlHistory}`, history);
          // on ne fait un rename que si prevId n'est pas 'orig'
          if (prevId !== 'orig') {
            rename(patch.urlGraph, urlGraphPrev);
            rename(patch.urlOrtho, urlOrthoPrev);
          }
        } else {
          debug('history n existe pas encore');
          const history = `orig;${newPatchId}`;
          fs.writeFileSync(`${urlHistory}`, history);
          // On a pas besoin de renommer l'image d'origine
          // qui reste partagée pour toutes les branches
        }
        rename(patch.urlGraphOutput, patch.urlGraph);
        rename(patch.urlOrthoOutput, patch.urlOrtho);
      });
      // on note le patch Id
      features.forEach((feature) => {
        /* eslint-disable no-param-reassign */
        feature.properties.patchId = newPatchId;
        feature.properties.slabs = slabsModified;
        /* eslint-enable no-param-reassign */
      });
      // on ajoute ce patch à l'historique
      debug('=> Patch', newPatchId, 'ajouté');
      /* eslint-disable no-param-reassign */
      branch.activePatches.features = branch.activePatches.features.concat(
        features,
      );
      debug('features in activePatches:', branch.activePatches.features.length);

      // on purge les patchs inactifs puisqu'on ne pourra plus les appliquer
      branch.unactivePatches.features = [];
      /* eslint-enable no-param-reassign */
      debug('features in unactivePatches:', branch.unactivePatches.features.length);
      return slabsModified;
    });
  });
}

module.exports = {
  getCOGs,
  applyPatch,
  rename,
};
