const workerpool = require('workerpool');
const PImage = require('pureimage');
const jimp = require('jimp');
const debug = require('debug')('patch');
const fs = require('fs');
const turf = require('@turf/turf');
const path = require('path');
const rok4 = require('../rok4.js');

// Preparation des masques
function createPatch(tile, features, overviews, dirCache, idBranch) {
  debug('createPatch : ', tile);
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - tile.z);
  const inputRings = [];
  for (let f = 0; f < features.length; f += 1) {
    const feature = features[f];
    for (let n = 0; n < feature.geometry.coordinates.length; n += 1) {
      const coordinates = feature.geometry.coordinates[n];
      const ring = [];
      for (let i = 0; i < coordinates.length; i += 1) {
        const point = coordinates[i];
        const x = Math.round((point[0] - xOrigin - tile.x * tileWidth * resolution)
              / resolution);
        const y = Math.round((yOrigin - point[1] - tile.y * tileHeight * resolution)
              / resolution) + 1;
        ring.push([x, y]);
      }
      inputRings.push(ring);
    }
  }

  const bbox = [0, 0, tileWidth, tileHeight + 1];
  const poly = turf.polygon(inputRings);
  const clipped = turf.bboxClip(poly, bbox);
  const rings = clipped.geometry.coordinates;

  if (rings.length === 0) {
    debug('masque vide, on passe a la suite : ', tile);
    return null;
  }

  // La BBox et le polygone s'intersectent
  debug('on calcule un masque : ', tile);
  // Il y a parfois un bug sur le dessin du premier pixel
  // on cree donc un masque une ligne de plus
  const mask = PImage.make(tileWidth, tileHeight + 1);
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

  const patch = {
    tile, mask, color: features[0].properties.color, idBranch,
  };
  patch.rok4Path = rok4.getPath(
    patch.tile.x,
    patch.tile.y,
    patch.tile.z,
    overviews.pathDepth,
  );
  patch.urlGraph = path.join(dirCache,
    'graph',
    patch.rok4Path.dirPath,
    `${patch.idBranch}_${patch.rok4Path.filename}.png`);
  patch.urlOrtho = path.join(dirCache,
    'ortho',
    patch.rok4Path.dirPath,
    `${patch.idBranch}_${patch.rok4Path.filename}.png`);
  patch.urlGraphOrig = path.join(dirCache,
    'graph',
    patch.rok4Path.dirPath,
    `${patch.rok4Path.filename}.png`);
  patch.urlOrthoOrig = path.join(dirCache,
    'ortho',
    patch.rok4Path.dirPath,
    `${patch.rok4Path.filename}.png`);
  patch.urlOpi = path.join(dirCache, 'opi', patch.rok4Path.dirPath, `${patch.rok4Path.filename}_${features[0].properties.cliche}.png`);
  patch.withOrig = false;
  const checkGraph = fs.promises.access(patch.urlGraph, fs.constants.F_OK).catch(
    () => {
      patch.withOrig = true;
      return fs.promises.access(patch.urlGraphOrig, fs.constants.F_OK);
    },
  );
  const checkOrtho = fs.promises.access(patch.urlOrtho, fs.constants.F_OK).catch(
    () => fs.promises.access(patch.urlOrthoOrig, fs.constants.F_OK),
  );
  const checkOpi = fs.promises.access(patch.urlOpi, fs.constants.F_OK);
  return Promise.all([checkGraph, checkOrtho, checkOpi]).then(() => patch);
}

function processPatch(patch) {
  // On patch le graph
  const { mask } = patch;
  /* eslint-disable no-param-reassign */
  const urlGraph = patch.withOrig ? patch.urlGraphOrig : patch.urlGraph;
  const graphPromise = jimp.read(urlGraph).then((graph) => {
    const { bitmap } = graph;
    for (let idx = 0; idx < bitmap.width * bitmap.height * 4; idx += 4) {
      if (mask.data[mask.width * 4 + idx + 3]) {
        [bitmap.data[idx],
          bitmap.data[idx + 1],
          bitmap.data[idx + 2]] = patch.color;
      }
    }
    return graph.writeAsync(patch.urlGraphOutput);
  }).then(() => {
    debug('graph done');
  });

  // On patch l ortho
  /* eslint-disable no-param-reassign */
  const urlOrtho = patch.withOrig ? patch.urlOrthoOrig : patch.urlOrtho;
  const orthoPromise = Promise.all([
    jimp.read(urlOrtho),
    jimp.read(patch.urlOpi),
  ]).then((images) => {
    const ortho = images[0].bitmap;
    const opi = images[1].bitmap;
    for (let idx = 0; idx < ortho.width * ortho.height * 4; idx += 4) {
      if (mask.data[mask.width * 4 + idx + 3]) {
        ortho.data[idx] = opi.data[idx];
        ortho.data[idx + 1] = opi.data[idx + 1];
        ortho.data[idx + 2] = opi.data[idx + 2];
      }
    }
    return images[0].writeAsync(patch.urlOrthoOutput);
  }).then(() => {
    debug('ortho done');
  });
  return Promise.all([graphPromise, orthoPromise]);
}

// create a worker and register public functions
workerpool.worker({
  createPatch,
  processPatch,
});
