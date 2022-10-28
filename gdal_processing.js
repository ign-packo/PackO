const fs = require('fs');
const debug = require('debug')('gdal');
const gdal = require('gdal-async');
const Jimp = require('jimp');
const path = require('path');

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

  // url correspond au chemin de l'image RGB sauf
  // dans le cas des OPI avec un cache purement IR (présence de _ix)
  // en cas de besoin (bands contient 3), il faut construire le chemin vers l'image IR
  // pour les OPIs (YB_OPI_20FD6925x00001_00588.tif -> YB_OPI_20FD6925ix00001_00588.tif)
  // pour les Ortho (UP.tif -> UPi.tif)
  let urlIr = url;
  const dname = path.dirname(urlIr);
  let fname = path.basename(urlIr);

  if (fname.includes('_ix') === false) {
    fname = fname.includes('x') ? fname.replace('x', '_ix') : fname.replace('.', 'i.');
    urlIr = path.join(dname, fname);
  }

  debug(url, urlIr);

  const cacheKeyIr = `${cacheKey}_ir`;

  if (b.includes(3)) {
    if (!fs.existsSync(urlIr)) {
      debug('default');
      if (DEFAULT_IMAGE === null) {
        DEFAULT_IMAGE = new Jimp(blocSize, blocSize, 0x000000ff);
      }
      return Promise.resolve(DEFAULT_IMAGE);
    }
  } else if (!fs.existsSync(url)) {
    debug('default');
    if (DEFAULT_IMAGE === null) {
      DEFAULT_IMAGE = new Jimp(blocSize, blocSize, 0x000000ff);
    }
    return Promise.resolve(DEFAULT_IMAGE);
  }

  // On ouvre les images si nécessaire
  const withRgb = b.includes(0) || b.includes(1) || b.includes(2);
  if (withRgb) {
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
  const withIr = b.includes(3);
  if (withIr) {
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
  const ds = withRgb ? cache[cacheKey].ds : null;
  const dsIr = withIr ? cache[cacheKeyIr].ds : null;
  const blocks = {};
  b.forEach((band) => {
    if (band in blocks) return;
    const selectedBand = band === 3 ? dsIr.bands.get(1)
      : ds.bands.get(band + 1);
    const B = z === 0
      ? selectedBand
      : selectedBand.overviews.get(z - 1);
    blocks[band] = B.pixels.readBlock(x, y);
  });

  return new Promise((res, rej) => {
    try {
      /* eslint-disable no-new */
      new Jimp(blocSize, blocSize, (err, image) => {
        /* eslint-disable no-param-reassign */
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (_x, _y, idx) => {
          image.bitmap.data[idx] = blocks[b[0]][idx / 4];
          image.bitmap.data[idx + 1] = blocks[b[1]][idx / 4];
          image.bitmap.data[idx + 2] = blocks[b[2]][idx / 4];
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
  return getTile(url, x, y, z, blocSize, cacheKey, bands)
    .then((image) => image.getBufferAsync(mime));
}

function getColor(url, x, y, z, col, lig, blocSize, cacheKey) {
  debug('getColor', url, x, y, z, col, lig, blocSize, cacheKey);
  return getTile(url, x, y, z, blocSize).then((image) => {
    const index = image.getPixelIndex(col, lig);
    return [
      image.bitmap.data[index],
      image.bitmap.data[index + 1],
      image.bitmap.data[index + 2],
    ];
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
    const urlOrthoRgb = patch.withOrig ? patch.urlOrthoRgbOrig : patch.urlOrthoRgb;
    const urlOrthoIr = urlOrthoRgb.replace('.', 'i.');
    const { urlOpiRgb } = patch;
    let urlOpiIr = urlOpiRgb;
    const dname = path.dirname(urlOpiIr);
    let fname = path.basename(urlOpiIr);
    if (fname.includes('_ix') === false) {
      fname = fname.includes('x') ? fname.replace('x', '_ix') : fname.replace('.', 'i.');
      urlOpiIr = path.join(dname, fname);
    }
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
        ds.geoTransformAsync,
        ds.srsAsync,
      ]).then((res2) => ({
        bands: [res2[0]],
        geoTransform: res2[1],
        srs: res2[2],
        size,
        ds,
      }));
    }
    debug('chargement...');
    Promise.all([
      gdal.openAsync(urlGraph).then((ds) => getBands(ds)),
      patch.withRgb ? gdal.openAsync(urlOpiRgb).then((ds) => getBands(ds)) : null,
      patch.withIr ? gdal.openAsync(urlOpiIr).then((ds) => getBand(ds)) : null,
      patch.withRgb ? gdal.openAsync(urlOrthoRgb).then((ds) => getBands(ds)) : null,
      patch.withIr ? gdal.openAsync(urlOrthoIr).then((ds) => getBand(ds)) : null,
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
        console.log('Il faut probablement supprimer la variable PROJ_LIB de votre environnement');
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
      const orthoRgbMem = orthoRgb ? gdal.open('orthoRgb', 'w', 'MEM',
        orthoRgb.size.x, orthoRgb.size.y, 3) : null;
      if (orthoRgbMem) {
        orthoRgbMem.geoTransform = orthoRgb.geoTransform;
        orthoRgbMem.srs = gdal.SpatialReference.fromWKT(orthoRgb.srs.toWKT());
        orthoRgbMem.bands.get(1).pixels.write(0, 0,
          orthoRgb.size.x, orthoRgb.size.y, orthoRgb.bands[0]);
        orthoRgbMem.bands.get(2).pixels.write(0, 0,
          orthoRgb.size.x, orthoRgb.size.y, orthoRgb.bands[1]);
        orthoRgbMem.bands.get(3).pixels.write(0, 0,
          orthoRgb.size.x, orthoRgb.size.y, orthoRgb.bands[2]);
      }
      const orthoIrMem = orthoIr ? gdal.open('orthoIr', 'w', 'MEM', orthoIr.size.x, orthoIr.size.y, 1) : null;
      if (orthoIrMem) {
        orthoIrMem.geoTransform = orthoIr.geoTransform;
        orthoIrMem.srs = gdal.SpatialReference.fromWKT(orthoIr.srs.toWKT());
        orthoIrMem.bands.get(1).pixels.write(0, 0,
          orthoIr.size.x, orthoIr.size.y, orthoIr.bands[0]);
      }

      debug('... fin creation des images en memoire');
      debug('creation des COGs ...');

      graph.ds.close();
      if (orthoRgb) {
        orthoRgb.ds.close();
      }
      if (orthoIr) {
        orthoIr.ds.close();
      }
      if (opiRgb) {
        opiRgb.ds.close();
      }
      if (opiIr) {
        opiIr.ds.close();
      }

      Promise.all([
        gdal.drivers.get('COG').createCopyAsync(patch.urlGraphOutput, graphMem, {
          BLOCKSIZE: blocSize,
          COMPRESS: 'LZW',
          RESAMPLING: 'NEAREST',
        }),
        orthoRgbMem ? gdal.drivers.get('COG').createCopyAsync(patch.urlOrthoRgbOutput, orthoRgbMem, {
          BLOCKSIZE: blocSize,
          COMPRESS: 'JPEG',
          QUALITY: 90,
        }) : null,
        orthoIrMem ? gdal.drivers.get('COG').createCopyAsync(patch.urlOrthoIrOutput, orthoIrMem, {
          BLOCKSIZE: blocSize,
          COMPRESS: 'JPEG',
          QUALITY: 90,
        }) : null,
      ]).then((createdDs) => {
        debug('...fin creation des COGs');
        createdDs.forEach((ds) => {
          if (ds) ds.close();
        });
        res('fin');
      });
    });
  });
}

exports.getTileEncoded = getTileEncoded;
exports.getColor = getColor;
exports.getDefaultEncoded = getDefaultEncoded;
exports.processPatch = processPatchAsync;
exports.clearCache = clearCache;
