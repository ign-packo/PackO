const debug = require('debug')('workers');
const rok4IO = require('bindings')('rok4IO');

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

exports.processPatch = processPatch;
