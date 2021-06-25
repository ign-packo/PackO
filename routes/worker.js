const workerpool = require('workerpool');
const PImage = require('pureimage');
const debugProcess = require('debug')('patch');
const fsProcess = require('fs');
const trurfProcess = require('@turf/turf');
const pathProcess = require('path');
const cogProcess = require('../cog_path.js');

// Preparation des masques
function createPatch(slab, geoJson, overviews, dirCache) {
  debugProcess('createPatch : ', slab);
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const slabWidth = overviews.tileSize.width * overviews.slabSize.width;
  const slabHeight = overviews.tileSize.height * overviews.slabSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - slab.z);
  const inputRings = [];
  for (let f = 0; f < geoJson.features.length; f += 1) {
    const feature = geoJson.features[f];
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
  const poly = trurfProcess.polygon(inputRings);
  const clipped = trurfProcess.bboxClip(poly, bbox);
  const rings = clipped.geometry.coordinates;

  if (rings.length === 0) {
    debugProcess('masque vide, on passe a la suite : ', slab);
    return null;
  }

  // La BBox et le polygone s'intersectent
  debugProcess('on calcule un masque : ', slab);
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

  const patch = { slab, mask, color: geoJson.features[0].properties.color };
  patch.cogPath = cogProcess.getSlabPath(
    patch.slab.x,
    patch.slab.y,
    patch.slab.z,
    overviews,
  );
  patch.urlGraph = pathProcess.join(dirCache, 'graph', patch.cogPath.dirPath, `${patch.cogPath.filename}.tif`);
  patch.urlOrtho = pathProcess.join(dirCache, 'ortho', patch.cogPath.dirPath, `${patch.cogPath.filename}.tif`);
  patch.urlOpi = pathProcess.join(dirCache, 'opi', patch.cogPath.dirPath, `${patch.cogPath.filename}_${geoJson.features[0].properties.cliche}.tif`);
  const checkGraph = fsProcess.promises.access(patch.urlGraph, fsProcess.constants.F_OK);
  const checkOrtho = fsProcess.promises.access(patch.urlOrtho, fsProcess.constants.F_OK);
  const checkOpi = fsProcess.promises.access(patch.urlOpi, fsProcess.constants.F_OK);
  return Promise.all([checkGraph, checkOrtho, checkOpi]).then(() => patch);
}

// create a worker and register public functions
workerpool.worker({
  createPatch,
});
