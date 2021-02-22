const workerpool = require('workerpool');
const PImage = require('pureimage');
const jimp = require('jimp');
const debugProcess = require('debug')('patch');
const fsProcess = require('fs');
const trurfProcess = require('@turf/turf');
const pathProcess = require('path');
const rok4Process = require('../rok4.js');

// Preparation des masques
function createPatch(tile, geoJson, overviews, dirCache) {
  debugProcess('createPatch : ', tile);
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const tileWidth = overviews.tileSize.width;
  const tileHeight = overviews.tileSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - tile.z);
  const inputRings = [];
  for (let f = 0; f < geoJson.features.length; f += 1) {
    const feature = geoJson.features[f];
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
  const poly = trurfProcess.polygon(inputRings);
  const clipped = trurfProcess.bboxClip(poly, bbox);
  const rings = clipped.geometry.coordinates;

  if (rings.length === 0) {
    debugProcess('masque vide, on passe a la suite : ', tile);
    return null;
  }

  // La BBox et le polygone s'intersectent
  debugProcess('on calcule un masque : ', tile);
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

  const patch = { tile, mask, color: geoJson.features[0].properties.color };
  patch.tileRoot = rok4Process.getTileRoot(patch.tile.x,
    patch.tile.y,
    patch.tile.z,
    overviews.pathDepth);
  patch.urlGraph = pathProcess.join(dirCache, 'graph', `${patch.tileRoot}.png`);
  patch.urlOrtho = pathProcess.join(dirCache, 'ortho', `${patch.tileRoot}.png`);
  patch.urlOpi = pathProcess.join(dirCache, 'opi', `${patch.tileRoot}_${geoJson.features[0].properties.cliche}.png`);
  const checkGraph = fsProcess.promises.access(patch.urlGraph, fsProcess.constants.F_OK);
  const checkOrtho = fsProcess.promises.access(patch.urlOrtho, fsProcess.constants.F_OK);
  const checkOpi = fsProcess.promises.access(patch.urlOpi, fsProcess.constants.F_OK);
  return Promise.all([checkGraph, checkOrtho, checkOpi]).then(() => patch);
}

function processPatch(patch) {
  // On patch le graph
  const mask = patch.mask.data;
  /* eslint-disable no-param-reassign */
  const graphPromise = jimp.read(patch.urlGraph).then((graph) => {
    const { bitmap } = graph;
    for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
      if (mask[1024 + idx + 3]) {
        [bitmap.data[idx],
          bitmap.data[idx + 1],
          bitmap.data[idx + 2]] = patch.color;
      }
    }
    return graph.writeAsync(patch.urlGraphOutput);
  }).then(() => {
    debugProcess('graph done');
  });

  // On patch l ortho
  /* eslint-disable no-param-reassign */
  const orthoPromise = Promise.all([
    jimp.read(patch.urlOrtho),
    jimp.read(patch.urlOpi),
  ]).then((images) => {
    const ortho = images[0].bitmap.data;
    const opi = images[1].bitmap.data;
    for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
      if (mask[1024 + idx + 3]) {
        ortho[idx] = opi[idx];
        ortho[idx + 1] = opi[idx + 1];
        ortho[idx + 2] = opi[idx + 2];
      }
    }
    return images[0].writeAsync(patch.urlOrthoOutput);
  }).then(() => {
    debugProcess('ortho done');
  });
  return Promise.all([graphPromise, orthoPromise]);
}

// create a worker and register public functions
workerpool.worker({
  createPatch,
  processPatch,
});
