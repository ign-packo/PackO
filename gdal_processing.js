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
        ds,
        size,
      ]);
    }
    debug('chargement...');
    Promise.all([
      gdal.openAsync(urlGraph).then((ds) => getBands(ds)),
      gdal.openAsync(urlOpi).then((ds) => getBands(ds)),
      gdal.openAsync(urlOrtho).then((ds) => getBands(ds)),
    ]).then(async (bands) => {
      debug('... fin chargement');
      debug('application du patch...');
      const graph = bands[0];
      const opi = bands[1];
      const ortho = bands[2];
      graph[0].forEach((_element, index) => {
        /* eslint-disable no-param-reassign */
        if (mask.data[4 * index] > 0) {
          [graph[0][index],
            graph[1][index],
            graph[2][index]] = patch.color;
          [ortho[0][index],
            ortho[1][index],
            ortho[2][index]] = [opi[0][index], opi[1][index], opi[2][index]];
        }
        /* eslint-enable no-param-reassign */
      });
      debug('... fin application des patch');
      debug('creation des images en memoire...');
      const graphMem = gdal.open('graph', 'w', 'MEM', graph[4].x, graph[4].y, 3);
      // graphMem.geoTransform = dsGraph.geoTransform;
      graphMem.srs = graph[3].srs;
      graphMem.bands.get(1).pixels.write(0, 0,
        graph[4].x, graph[4].y, graph[0]);
      graphMem.bands.get(2).pixels.write(0, 0,
        graph[4].x, graph[4].y, graph[1]);
      graphMem.bands.get(3).pixels.write(0, 0,
        graph[4].x, graph[4].y, graph[2]);
      const orthoMem = gdal.open('ortho', 'w', 'MEM', ortho[4].x, ortho[4].y, 3);
      // orthoMem.geoTransform = dsOrtho.geoTransform;
      orthoMem.srs = ortho[3].srs;
      orthoMem.bands.get(1).pixels.write(0, 0,
        ortho[4].x, ortho[4].y, ortho[0]);
      orthoMem.bands.get(2).pixels.write(0, 0,
        ortho[4].x, ortho[4].y, ortho[1]);
      orthoMem.bands.get(3).pixels.write(0, 0,
        ortho[4].x, ortho[4].y, ortho[2]);
      debug('... fin creation des images en memoire');
      debug('creation des COGs ...');

      graph[3].close();
      ortho[3].close();
      opi[3].close();

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
}

exports.getTileEncoded = getTileEncoded;
exports.getPixel = getPixel;
exports.getDefaultEncoded = getDefaultEncoded;
exports.processPatch = processPatchAsync;
exports.clearCache = clearCache;
