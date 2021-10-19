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
 * @returns
 */
function getTile(url, x, y, z, blocSize, cacheKey) {
  debug('~~~getTile : ', url, x, y, z, blocSize, cacheKey);
  if (!fs.existsSync(url)) {
    debug('default');
    if (DEFAULT_IMAGE === null) {
      DEFAULT_IMAGE = new Jimp(blocSize, blocSize, 0x000000ff);
    }
    return Promise.resolve(DEFAULT_IMAGE);
  }

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

  const { ds } = cache[cacheKey];
  debug('fichier ouvert ');
  // if (z > ds.bands.get(1).overviews.count()) {
  //   const error = new Error();
  //   error.msg = {
  //     status: `niveau de zoom ${z} non dispo sur ${url}!`,
  //     errors: [{
  //       localisation: 'getTile',
  //       msg: `niveau de zoom ${z} non dispo sur ${url}!`,
  //     }],
  //   };
  //   throw error;
  // }
  const bandR = z === 0 ? ds.bands.get(1) : ds.bands.get(1).overviews.get(z - 1);
  const bandG = z === 0 ? ds.bands.get(2) : ds.bands.get(2).overviews.get(z - 1);
  const bandB = z === 0 ? ds.bands.get(3) : ds.bands.get(3).overviews.get(z - 1);
  const bands = [
    bandR.pixels.readBlock(x, y),
    bandG.pixels.readBlock(x, y),
    bandB.pixels.readBlock(x, y),
  ];
  return new Promise((res, rej) => {
    try {
      /* eslint-disable no-new */
      new Jimp(blocSize, blocSize, (err, image) => {
        /* eslint-disable no-param-reassign */
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (_x, _y, idx) => {
          image.bitmap.data[idx] = bands[0][idx / 4];
          image.bitmap.data[idx + 1] = bands[1][idx / 4];
          image.bitmap.data[idx + 2] = bands[2][idx / 4];
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

function getTileEncoded(url, x, y, z, mime, blocSize, cacheKey) {
  return getTile(url, x, y, z, blocSize, cacheKey).then((image) => image.getBufferAsync(mime));
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
  return new Promise((res) => {
    // On patch le graph
    const { mask } = patch;
    // On a modifier le cache, donc il faut forcer le refresh
    cache = {};

    // Modification du graph
    debug('ouverture de l image');
    debug(patch);
    const urlGraph = patch.withOrig ? patch.urlGraphOrig : patch.urlGraph;
    const urlOrtho = patch.withOrig ? patch.urlOrthoOrig : patch.urlOrtho;
    const { urlOpi } = patch;
    Promise.all([
      gdal.openAsync(urlGraph),
      gdal.openAsync(urlOpi),
      gdal.openAsync(urlOrtho),
    ]).then((dsArray) => {
      const dsGraph = dsArray[0];
      const dsOpi = dsArray[1];
      const dsOrtho = dsArray[2];
      debug('chargement...');
      Promise.all([
        dsGraph.bands.get(1).pixels.readAsync(0, 0, dsGraph.rasterSize.x, dsGraph.rasterSize.y),
        dsGraph.bands.get(2).pixels.readAsync(0, 0, dsGraph.rasterSize.x, dsGraph.rasterSize.y),
        dsGraph.bands.get(3).pixels.readAsync(0, 0, dsGraph.rasterSize.x, dsGraph.rasterSize.y),
        dsOpi.bands.get(1).pixels.readAsync(0, 0, dsOpi.rasterSize.x, dsOpi.rasterSize.y),
        dsOpi.bands.get(2).pixels.readAsync(0, 0, dsOpi.rasterSize.x, dsOpi.rasterSize.y),
        dsOpi.bands.get(3).pixels.readAsync(0, 0, dsOpi.rasterSize.x, dsOpi.rasterSize.y),
        dsOrtho.bands.get(1).pixels.readAsync(0, 0, dsOrtho.rasterSize.x, dsOrtho.rasterSize.y),
        dsOrtho.bands.get(2).pixels.readAsync(0, 0, dsOrtho.rasterSize.x, dsOrtho.rasterSize.y),
        dsOrtho.bands.get(3).pixels.readAsync(0, 0, dsOrtho.rasterSize.x, dsOrtho.rasterSize.y),
      ]).then((bands) => {
        debug('... fin chargement');
        debug('application du patch...');
        bands[0].forEach((_element, index) => {
          // Attention, il y a une ligne de decalage dans la masque
          /* eslint-disable no-param-reassign */
          if (mask.data[mask.width * 4 + 4 * index] > 0) {
            [bands[0][index],
              bands[1][index],
              bands[2][index]] = patch.color;
            [bands[6][index],
              bands[7][index],
              bands[8][index]] = [bands[3][index], bands[4][index], bands[5][index]];
          }
          /* eslint-enable no-param-reassign */
        });
        debug('... fin application des patch');
        debug('creation des images en memoire...');
        const graphMem = gdal.open('graph', 'w', 'MEM', dsGraph.rasterSize.x, dsGraph.rasterSize.y, 3);
        graphMem.geoTransform = dsGraph.geoTransform;
        graphMem.srs = dsGraph.srs;
        graphMem.bands.get(1).pixels.write(0, 0,
          dsGraph.rasterSize.x, dsGraph.rasterSize.y, bands[0]);
        graphMem.bands.get(2).pixels.write(0, 0,
          dsGraph.rasterSize.x, dsGraph.rasterSize.y, bands[1]);
        graphMem.bands.get(3).pixels.write(0, 0,
          dsGraph.rasterSize.x, dsGraph.rasterSize.y, bands[2]);
        const orthoMem = gdal.open('ortho', 'w', 'MEM', dsOrtho.rasterSize.x, dsOrtho.rasterSize.y, 3);
        orthoMem.geoTransform = dsOrtho.geoTransform;
        orthoMem.srs = dsOrtho.srs;
        orthoMem.bands.get(1).pixels.write(0, 0,
          dsOrtho.rasterSize.x, dsOrtho.rasterSize.y, bands[6]);
        orthoMem.bands.get(2).pixels.write(0, 0,
          dsOrtho.rasterSize.x, dsOrtho.rasterSize.y, bands[7]);
        orthoMem.bands.get(3).pixels.write(0, 0,
          dsOrtho.rasterSize.x, dsOrtho.rasterSize.y, bands[8]);
        debug('... fin creation des images en memoire');
        debug('creation des COGs ...');

        dsGraph.close();
        dsOpi.close();
        dsOrtho.close();

        Promise.all([
          gdal.drivers.get('COG').createCopyAsync(patch.urlGraphOutput, graphMem, {
            BLOCKSIZE: blocSize,
            COMPRESS: 'LZW',
          }),
          gdal.drivers.get('COG').createCopyAsync(patch.urlOrthoOutput, orthoMem, {
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
  });
}

exports.getTileEncoded = getTileEncoded;
exports.getPixel = getPixel;
exports.getDefaultEncoded = getDefaultEncoded;
exports.processPatch = processPatchAsync;
exports.clearCache = clearCache;
