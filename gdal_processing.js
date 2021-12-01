const fs = require('fs');
const debug = require('debug')('gdal');
const gdal = require('gdal-async');
const Jimp = require('jimp');

// Image par defaut (elle sera créée la premier fois que l'on en a besoin)
let DEFAULT_IMAGE = null;

// cache pour réutiliser les images ouvertes lorsque c'est possible
let cache = {};

function clearCache() {
  debug('debut de clearCache : ', cache);
  Object.values(cache).forEach((value) => {
    value.ds.close();
  });
  cache = {};
  debug('fin de clearCache ');
}

/**
 *
 * @param {string} url - url de l'image
 * @param {int} x - numéro de tuile en colonne dans l'image
 * @param {int} y - numéro de tuile en ligne dans l'image
 * @param {int} z - niveau de zoom dans l'image (0 : pleine resolution)
 * @param {*} blocSize - taille des tuiles
 * @param {*} cacheKey - clé utilisée pour gérer le cache des images
 * @param {*} bands - tableau des bandes à utiliser ([0, 1, 2] par défaut)
 * @returns
 */
function getTile(url, x, y, z, blocSize, cacheKey, bands) {
  const b = bands || [0, 1, 2];
  debug('~~~getTile : ', url, x, y, z, blocSize, cacheKey, b);

  // url correspond au chemin de l'image RGB
  // en cas de besoin (bands contient 3), il faut construire le chemin vers l'image IR
  // pour les OPIs (YB_OPI_20FD6925x00001_00588.tif -> YB_OPI_20FD6925ix00001_00588.tif)
  // pour les Ortho (UP.tif -> IPi.tif)
  const urlIr = url.includes('x')? url.replace('x', 'ix') : url.replace('.', 'i.');
  const cacheKeyIr = cacheKey + '_ir';

  if (bands.includes(3)){
    if (!fs.existsSync(urlIr)) {
      debug('default');
      if (DEFAULT_IMAGE === null) {
        DEFAULT_IMAGE = new Jimp(blocSize, blocSize, 0x000000ff);
      }
      return Promise.resolve(DEFAULT_IMAGE);
    }
  }
  else if (!fs.existsSync(url)) {
    debug('default');
    if (DEFAULT_IMAGE === null) {
      DEFAULT_IMAGE = new Jimp(blocSize, blocSize, 0x000000ff);
    }
    return Promise.resolve(DEFAULT_IMAGE);
  }

  // On ouvre les images si nécessaire
  if (bands.includes(0) || bands.includes(1) || bands.includes(2)){
    if ((cacheKey in cache) && (cache[cacheKey][url] !== url)) {
      cache[cacheKey].ds.close();
      delete cache[cacheKey];
    }
    if (!(cacheKey in cache)) {
      cache[cacheKey] = {
        url,
        ds: gdal.open(url),
      };
    }  
  }
  if (bands.includes(3)){
    if ((cacheKeyIr in cache) && (cache[cacheKeyIr][urlIr] !== urlIr)) {
      cache[cacheKeyIr].ds.close();
      delete cache[cacheKeyIr];
    }
    if (!(cacheKeyIr in cache)) {
      cache[cacheKeyIr] = {
        urlIr,
        ds: gdal.open(urlIr),
      };
    }  
  }

  debug('fichier ouvert ');
  const { ds } = cache[cacheKey];
  const { dsIr } = cache[cacheKeyIr];
  let blocks = {};
  bands.forEach((b) => {
    if (blocks.includes(b)) return;
    const selectedDs = b === 3 ? dsIr : ds;
    const B = z === 0 ? selectedDs.bands.get(1) : selectedDs.bands.get(1).overviews.get(z - 1);
    blocks[b] = B.pixels.readBlock(x, y);
  });

  return new Promise((res, rej) => {
    try {
      /* eslint-disable no-new */
      new Jimp(blocSize, blocSize, (err, image) => {
        /* eslint-disable no-param-reassign */
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (_x, _y, idx) => {
          image.bitmap.data[idx] = blocks[bands[0]][idx / 4];
          image.bitmap.data[idx + 1] = blocks[bands[1]][idx / 4];
          image.bitmap.data[idx + 2] = blocks[bands[2]][idx / 4];
          image.bitmap.data[idx + 3] = 255;
        });
        res(image);
        /* eslint-enable no-param-reassign */
      });
    } catch (error) {
      rej(error);
    }
  });
}

function getTileEncoded(url, x, y, z, mime, blocSize, cacheKey, bands) {
  return getTile(url, x, y, z, blocSize, cacheKey, bands).then((image) => image.getBufferAsync(mime));
}

function getPixel(url, x, y, z, col, lig, blocSize, cacheKey) {
  debug(getPixel, url, x, y, z, col, lig, blocSize, cacheKey);
  return getTile(url, x, y, z, blocSize).then((image) => {
    const index = image.getPixelIndex(col, lig);
    const out = {
      color: [image.bitmap.data[index],
        image.bitmap.data[index + 1],
        image.bitmap.data[index + 2]],
    };
    return out;
  });
}

function getDefaultEncoded(mime, blocSize) {
  if (DEFAULT_IMAGE === null) {
    DEFAULT_IMAGE = new Jimp(blocSize, blocSize, 0x000000ff);
  }
  return Promise.resolve(DEFAULT_IMAGE.getBufferAsync(mime));
}

function processPatchAsync(patch, blocSize) {
  return new Promise((res, reject) => {
    // On patch le graph
    const { mask } = patch;
    // On a modifier le cache, donc il faut forcer le refresh
    cache = {};

    // Modification du graph
    debug('ouverture de l image');
    debug(patch);
    const urlGraph = patch.withOrig ? patch.urlGraphOrig : patch.urlGraph;
    const urlOrthoRgb = patch.withOrig ? patch.urlOrthoOrig : patch.urlOrtho;
    const urlOrthoIr = urlOrtho.replace('.', 'i.');
    const { urlOpi } = patch;
    const urlOpiIr = urlOpi.replace('x', 'ix');
    async function getBands(ds) {
      const size = await ds.rasterSizeAsync;
      return Promise.all([
        ds.bands.getAsync(1).then(
          (band) => band.pixels.readAsync(0, 0, size.x, size.y),
        ),
        ds.bands.getAsync(2).then(
          (band) => band.pixels.readAsync(0, 0, size.x, size.y),
        ),
        ds.bands.getAsync(3).then(
          (band) => band.pixels.readAsync(0, 0, size.x, size.y),
        ),
        ds.geoTransformAsync,
        ds.srsAsync,
      ]).then((res2) => ({
        bands: [res2[0], res2[1], res2[2]],
        geoTransform: res2[3],
        srs: res2[4],
        size,
        ds,
      }));
    }
    async function getBand(ds) {
      const size = await ds.rasterSizeAsync;
      return Promise.all([
        ds.bands.getAsync(1).then(
          (band) => band.pixels.readAsync(0, 0, size.x, size.y),
        ),
        ds,
        size,
      ]);
    }
    debug('chargement...');
    Promise.all([
      gdal.openAsync(urlGraph).then((ds) => getBands(ds)),
      P.withRgb ? gdal.openAsync(urlOpiRgb).then((ds) => getBands(ds)): null,
      P.withIr ? gdal.openAsync(urlOpiIr).then((ds) => getBand(ds)): null,
      P.withRgb ? gdal.openAsync(urlOrthoRgb).then((ds) => getBands(ds)):null,
      P.withIr ? gdal.openAsync(urlOrthoIr).then((ds) => getBands(ds)):null,
    ]).then(async (images) => {
      debug('... fin chargement');
      debug('application du patch...');
      const graph = images[0];
      const opiRgb = images[1];
      const opiIr = images[2];
      const orthoRgb = images[3];
      const orthoIr = images[4];
      graph.bands[0].forEach((_element, index) => {
        /* eslint-disable no-param-reassign */
        if (mask.data[4 * index] > 0) {
          [graph.bands[0][index],
            graph.bands[1][index],
            graph.bands[2][index]] = patch.color;
          if (orthoRgb) {
            [orthoRgb.bands[0][index],
            orthoRgb.bands[1][index],
            orthoRgb.bands[2][index]] = [
              opiRgb.bands[0][index],
              opiRgb.bands[1][index],
              opiRgb.bands[2][index]];
          }
          if (orthoIr) {
            orthoIr.bands[0][index] = opiIr.bands[0][index];
          }
        }
        /* eslint-enable no-param-reassign */
      });
      debug('... fin application des patch');
      debug('creation des images en memoire...');
      // on verifie que l orientation est bien interprété
      try {
        graph.srs.autoIdentifyEPSG();
      } catch (error) {
        console.log('Erreur dans la gestion des SRS');
        console.log('Il faut probablement supprimer la variable PROJ_LIB de votre environement');
        reject(new Error('PROJ_LIB Error'));
      }
      const graphMem = gdal.open('graph', 'w', 'MEM', graph.size.x, graph.size.y, 3);
      graphMem.geoTransform = graph.geoTransform;
      graphMem.srs = graph.srs;
      graphMem.bands.get(1).pixels.write(0, 0,
        graph.size.x, graph.size.y, graph.bands[0]);
      graphMem.bands.get(2).pixels.write(0, 0,
        graph.size.x, graph.size.y, graph.bands[1]);
      graphMem.bands.get(3).pixels.write(0, 0,
        graph.size.x, graph.size.y, graph.bands[2]);
      const orthoRgbMem = gdal.open('orthoRgb', 'w', 'MEM',
        orthoRgb.size.x, orthoRgb.size.y, 3);
      orthoRgbMem.geoTransform = orthoRgb.geoTransform;
      orthoRgbMem.srs = gdal.SpatialReference.fromWKT(orthoRgb.srs.toWKT());
      orthoRgbMem.bands.get(1).pixels.write(0, 0,
        orthoRgb.size.x, orthoRgb.size.y, orthoRgb.bands[0]);
      orthoRgbMem.bands.get(2).pixels.write(0, 0,
        orthoRgb.size.x, orthoRgb.size.y, orthoRgb.bands[1]);
      orthoRgbMem.bands.get(3).pixels.write(0, 0,
        orthoRgb.size.x, orthoRgb.size.y, orthoRgb.bands[2]);
      const orthoIrMem = gdal.open('orthoIr', 'w', 'MEM', orthoIr.size.x, orthoIr.size.y, 1);
      orthoIrMem.geoTransform = orthoIr.geoTransform;
      orthoIrMem.srs = gdal.SpatialReference.fromWKT(orthoIr.srs.toWKT());
      orthoIrMem.bands.get(1).pixels.write(0, 0,
        orthoIr.size.x, orthoIr.size.y, orthoIr.bands[0]);
      
      debug('... fin creation des images en memoire');
      debug('creation des COGs ...');

      graph.ds.close();
      if (orthoRgb){
        orthoRgb.ds.close();
      }
      if (orthoIr){
        orthoIr.ds.close();
      }
      if (opiRgb){
        opiRgb.ds.close();
      }
      if (opiIr){
        opiIr.ds.close();
      }

      Promise.all([
        gdal.drivers.get('COG').createCopyAsync(patch.urlGraphOutput, graphMem, {
          BLOCKSIZE: blocSize,
          COMPRESS: 'LZW',
        }),
        gdal.drivers.get('COG').createCopyAsync(patch.urlOrthoRgbOutput, orthoRgbMem, {
          BLOCKSIZE: blocSize,
          COMPRESS: 'JPEG',
          QUALITY: 90,
        }),
        gdal.drivers.get('COG').createCopyAsync(patch.urlOrthoIrOutput, orthoIrMem, {
          BLOCKSIZE: blocSize,
          COMPRESS: 'JPEG',
          QUALITY: 90,
        }),
      ]).then((createdDs) => {
        debug('...fin creation des COGs');
        createdDs.forEach((ds) => {
          ds.close();
        });
        res('fin');
      });
    });
  });
}

exports.getTileEncoded = getTileEncoded;
exports.getPixel = getPixel;
exports.getDefaultEncoded = getDefaultEncoded;
exports.processPatch = processPatchAsync;
exports.clearCache = clearCache;
