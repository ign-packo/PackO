const workerpool = require('workerpool');
const PImage = require('pureimage');
const debug = require('debug')('workers');
const fs = require('fs');
const turf = require('@turf/turf');
const path = require('path');
const rok4IO = require('bindings')('rok4IO');
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

function processPatch(patch) {
  // On lit toutes les tuiles utiles du patch
  debug('processPatch : ', patch.urlGraph, patch.tiles);
  const graphPromise = new Promise((resolve) => {
    const slab = new rok4IO.ImageROK4();
    slab.load(patch.urlGraph).then(() => {
      slab.getTiles(patch.tiles).then((graphs) => {
        debug(graphs);
        const outTiles = [];
        // met a jour chaque graph
        for (let i = 0; i < patch.tiles.length; i += 1) {
          const idTile = patch.tiles[i];
          const graph = graphs[i];
          patch.pixels[idTile].forEach((idx) => {
            [graph[3 * idx],
              graph[3 * idx + 1],
              graph[3 * idx + 2]] = patch.color;
          });
          outTiles[i] = graph;
        }
        // on ecrit
        debug('on ecrit le graph ', patch.tiles);
        // resolve();
        resolve(slab.setTiles(patch.urlGraphOutput, patch.tiles, outTiles).then(() => {
          debug('graph done');
        }));
      });
    });
  });
  // On lit toutes les tuiles utiles du patch
  const orthoPromise = new Promise((resolve) => {
    const slabOrtho = new rok4IO.ImageROK4();
    const slabOpi = new rok4IO.ImageROK4();
    slabOrtho.load(patch.urlOrtho).then(() => {
      slabOpi.load(patch.urlOpi).then(() => {
        slabOrtho.getTiles(patch.tiles).then((orthos) => {
          slabOpi.getTiles(patch.tiles).then((opis) => {
            // met a jour chaque ortho
            const outTiles = [];
            for (let i = 0; i < patch.tiles.length; i += 1) {
              const idTile = patch.tiles[i];
              const ortho = orthos[i];
              const opi = opis[i];
              patch.pixels[idTile].forEach((idx) => {
                ortho[3 * idx] = opi[3 * idx];
                ortho[3 * idx + 1] = opi[3 * idx + 1];
                ortho[3 * idx + 2] = opi[3 * idx + 2];
              });
              outTiles[i] = ortho;
            }
            // on ecrit
            debug('on ecrit l ortho ', patch.tiles);
            // resolve();
            resolve(slabOrtho.setTiles(patch.urlOrthoOutput, patch.tiles, outTiles).then(() => {
              debug('graph done');
            }));
          });
        });
      });
    });
  });
  return Promise.all([graphPromise, orthoPromise]);
}

// Preparation des masques
// function createPatch(tile, geoJson, overviews, dirCache) {
//   debug('createPatch : ', tile);
//   const xOrigin = overviews.crs.boundingBox.xmin;
//   const yOrigin = overviews.crs.boundingBox.ymax;
//   const tileWidth = overviews.tileSize.width;
//   const tileHeight = overviews.tileSize.height;

//   const resolution = overviews.resolution * 2 ** (overviews.level.max - tile.z);
//   const inputRings = [];
//   for (let f = 0; f < geoJson.features.length; f += 1) {
//     const feature = geoJson.features[f];
//     for (let n = 0; n < feature.geometry.coordinates.length; n += 1) {
//       const coordinates = feature.geometry.coordinates[n];
//       const ring = [];
//       for (let i = 0; i < coordinates.length; i += 1) {
//         const point = coordinates[i];
//         const x = Math.round((point[0] - xOrigin - tile.x * tileWidth * resolution)
//               / resolution);
//         const y = Math.round((yOrigin - point[1] - tile.y * tileHeight * resolution)
//               / resolution) + 1;
//         ring.push([x, y]);
//       }
//       inputRings.push(ring);
//     }
//   }

//   const bbox = [0, 0, tileWidth, tileHeight + 1];
//   const poly = turf.polygon(inputRings);
//   const clipped = turf.bboxClip(poly, bbox);
//   const rings = clipped.geometry.coordinates;

//   if (rings.length === 0) {
//     debug('masque vide, on passe a la suite : ', tile);
//     return null;
//   }

//   // La BBox et le polygone s'intersectent
//   debug('on calcule un masque : ', tile);
//   // Il y a parfois un bug sur le dessin du premier pixel
//   // on cree donc un masque une ligne de plus
//   const mask = PImage.make(tileWidth, tileHeight + 1);
//   const ctx = mask.getContext('2d');
//   ctx.fillStyle = '#FFFFFF';
//   for (let n = 0; n < rings.length; n += 1) {
//     const ring = rings[n];
//     // console.log(ring);
//     ctx.beginPath();
//     ctx.moveTo(ring[0][0], ring[0][1]);
//     for (let i = 1; i < ring.length; i += 1) {
//       ctx.lineTo(ring[i][0], ring[i][1]);
//     }
//     ctx.closePath();
//     ctx.fill();
//   }

//   const patch = { tile, mask, color: geoJson.features[0].properties.color };
//   patch.tileRoot = rok4.getTileRoot(patch.tile.x,
//     patch.tile.y,
//     patch.tile.z,
//     overviews.pathDepth);
//   patch.urlGraph = path.join(dirCache, 'graph', `${patch.tileRoot}.png`);
//   patch.urlOrtho = path.join(dirCache, 'ortho', `${patch.tileRoot}.png`);
//   patch.urlOpi = path.join(dirCache, 'opi', `${patch.tileRoot}_${geoJson.
// features[0].properties.cliche}.png`);
//   const checkGraph = fs.promises.access(patch.urlGraph, fs.constants.F_OK);
//   const checkOrtho = fs.promises.access(patch.urlOrtho, fs.constants.F_OK);
//   const checkOpi = fs.promises.access(patch.urlOpi, fs.constants.F_OK);
//   return Promise.all([checkGraph, checkOrtho, checkOpi]).then(() => patch);
// }

// function processPatch(patch) {
//   // On patch le graph
//   const mask = patch.mask.data;
//   /* eslint-disable no-param-reassign */
//   const graphPromise = jimp.read(patch.urlGraph).then((graph) => {
//     const { bitmap } = graph;
//     for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
//       if (mask[1024 + idx + 3]) {
//         [bitmap.data[idx],
//           bitmap.data[idx + 1],
//           bitmap.data[idx + 2]] = patch.color;
//       }
//     }
//     return graph.writeAsync(patch.urlGraphOutput);
//   }).then(() => {
//     debug('graph done');
//   });

//   // On patch l ortho
//   /* eslint-disable no-param-reassign */
//   const orthoPromise = Promise.all([
//     jimp.read(patch.urlOrtho),
//     jimp.read(patch.urlOpi),
//   ]).then((images) => {
//     const ortho = images[0].bitmap.data;
//     const opi = images[1].bitmap.data;
//     for (let idx = 0; idx < 256 * 256 * 4; idx += 4) {
//       if (mask[1024 + idx + 3]) {
//         ortho[idx] = opi[idx];
//         ortho[idx + 1] = opi[idx + 1];
//         ortho[idx + 2] = opi[idx + 2];
//       }
//     }
//     return images[0].writeAsync(patch.urlOrthoOutput);
//   }).then(() => {
//     debug('ortho done');
//   });
//   return Promise.all([graphPromise, orthoPromise]);
// }

// create a worker and register public functions
workerpool.worker({
  createPatch,
  processPatch,
});
