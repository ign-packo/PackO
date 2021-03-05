const PImage = require('pureimage');
const debug = require('debug')('workers');
const fs = require('fs');
const turf = require('@turf/turf');
const path = require('path');
const rok4 = require('../rok4.js');

// Preparation des masques
function createPatch(slab, geoJson, overviews, dirCache) {
  debug('createPatch : ', slab);
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const width = overviews.tileSize.width * overviews.slabSize.width;
  const height = overviews.tileSize.height * overviews.slabSize.height;
  const resolution = overviews.resolution * 2 ** (overviews.level.max - slab.z);

  const inputRings = [];
  for (let f = 0; f < geoJson.features.length; f += 1) {
    const feature = geoJson.features[f];
    for (let n = 0; n < feature.geometry.coordinates.length; n += 1) {
      const coordinates = feature.geometry.coordinates[n];
      const ring = [];
      for (let i = 0; i < coordinates.length; i += 1) {
        const point = coordinates[i];
        const x = Math.round((point[0] - xOrigin - slab.x * width * resolution)
              / resolution);
        const y = Math.round((yOrigin - point[1] - slab.y * height * resolution)
              / resolution) + 1;
        ring.push([x, y]);
      }
      inputRings.push(ring);
    }
  }

  const bbox = [0, 0, width, height + 1];
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
  const mask = PImage.make(width, height + 1);
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

  // // Il y a parfois un bug sur le dessin du premier pixel
  // // on cree donc un masque une ligne de plus
  // const mask = PImage.make(width, height + 1);

  // const ctx = mask.getContext('2d');
  // geoJson.features.forEach((feature) => {
  //   // debug(feature.properties.color);
  //   ctx.fillStyle = '#FFFFFF';
  //   ctx.beginPath();
  //   let first = true;
  //   /* eslint-disable no-restricted-syntax */
  //   const resolution = overviews.resolution * 2 ** (overviews.level.max - slab.z);
  //   for (const point of feature.geometry.coordinates[0]) {
  //     const i = Math.round((point[0] - xOrigin - slab.x * width * resolution)
  //           / resolution);
  //     const j = Math.round((yOrigin - point[1] - slab.y * height * resolution)
  //           / resolution) + 1;
  //     if (first) {
  //       first = false;
  //       ctx.moveTo(i, j);
  //     } else {
  //       ctx.lineTo(i, j);
  //     }
  //   }
  //   ctx.closePath();
  //   ctx.fill();
  // });

  // On cherche la liste des tiles a mettre à jour
  // en stockant la liste des pixels
  // a mettre a jour
  const patch = {
    slab, tiles: [], pixels: [], color: geoJson.features[0].properties.color,
  };
  for (let l = 0; l < overviews.slabSize.height; l += 1) {
    for (let c = 0; c < overviews.slabSize.width; c += 1) {
      const idTile = l * overviews.slabSize.width + c;
      patch.pixels[idTile] = [];
    }
  }
  for (let l = 0; l < height; l += 1) {
    for (let c = 0; c < width; c += 1) {
      const idx = width * 4 + l * width * 4 + c * 4;
      if (mask.data[idx + 3]) {
        const idTile = Math.trunc(l / overviews.tileSize.height) * overviews.slabSize.width
        + Math.trunc(c / overviews.tileSize.width);
        patch.pixels[idTile].push((c % overviews.tileSize.width)
          + (l % overviews.tileSize.height) * overviews.tileSize.width);
        debug(c, l, idTile, (c % overviews.tileSize.width), (l % overviews.tileSize.height));
        // debug(overviews.tileSize.width, overviews.tileSize.height);
        // debug(c % overviews.tileSize.width, l % overviews.tileSize.height);
      }
    }
  }
  for (let l = 0; l < overviews.slabSize.height; l += 1) {
    for (let c = 0; c < overviews.slabSize.width; c += 1) {
      const idTile = l * overviews.slabSize.width + c;
      if (patch.pixels[idTile].length > 0) {
        patch.tiles.push(idTile);
      }
    }
  }
  if (patch.tiles.length === 0) {
    debug('masque vide, on passe a la suite : ', slab);
    return null;
  }
  patch.url = rok4.getTileRoot(slab.x * overviews.slabSize.width,
    slab.y * overviews.slabSize.height,
    slab.z,
    overviews.pathDepth,
    overviews.slabSize).url;
  patch.urlGraph = path.join(dirCache, 'graph', `${patch.url}.tif`);
  patch.urlOrtho = path.join(dirCache, 'ortho', `${patch.url}.tif`);
  patch.urlOpi = path.join(dirCache, 'opi', `${patch.url}_${geoJson.features[0].properties.cliche}.tif`);
  const checkGraph = fs.promises.access(patch.urlGraph, fs.constants.F_OK);
  const checkOrtho = fs.promises.access(patch.urlOrtho, fs.constants.F_OK);
  const checkOpi = fs.promises.access(patch.urlOpi, fs.constants.F_OK);
  return Promise.all([checkGraph, checkOrtho, checkOpi]).then(() => patch);
}

exports.createPatch = createPatch;
