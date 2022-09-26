const fs = require('fs');
const debug = require('debug')('gdal');
const gdal = require('gdal-async');
const uuid = require('uuid');

const defaultImage = {};

/**
 *
 * @param {string} url - url de l'image
 * @param {int} x - numéro de tuile en colonne dans l'image
 * @param {int} y - numéro de tuile en ligne dans l'image
 * @param {int} z - niveau de zoom dans l'image (0 : pleine resolution)
 * @param {string} formatGDAL - ex: PNG ou JPEG
 * @param {*} blocSize - taille des tuiles
 * @param {*} bands - tableau des bandes à utiliser ([0, 1, 2] par défaut)
 * @returns
 */
async function getTileEncoded(url, x, y, z, formatGDAL, blocSize, bands) {
  const b = bands || [0, 1, 2];
  debug('~~~getTileEncoded : ', url, x, y, z, blocSize, b);
  const name = `/vsimem/${uuid.v4()}`;

  // url correspond au chemin de l'image RGB sauf
  // dans le cas des OPI avec un cache purement IR (présence de _ix)
  // en cas de besoin (bands contient 3), il faut construire le chemin vers l'image IR
  // pour les OPIs (YB_OPI_20FD6925x00001_00588.tif -> YB_OPI_20FD6925ix00001_00588.tif)
  // pour les Ortho (UP.tif -> IPi.tif)
  let urlIr = url;
  if (url.includes('_ix') === false) {
    urlIr = url.includes('x') ? url.replace('x', '_ix') : url.replace('.', 'i.');
  }

  debug(url, urlIr);
  if (b.includes(3)) {
    try {
      await fs.promises.access(urlIr, fs.constants.R_OK);
    } catch (_) {
      debug('default');
      if (!(blocSize in defaultImage)) {
        const outDS = await gdal.openAsync('default', 'w', 'MEM', blocSize, blocSize, 3);
        await gdal.drivers.get(formatGDAL).createCopyAsync(name, outDS);
        defaultImage[blocSize] = gdal.vsimem.release(name);
      }
      return defaultImage[blocSize];
    }
  } else {
    try {
      await fs.promises.access(url, fs.constants.R_OK);
    } catch (_) {
      debug('default');
      if (!(blocSize in defaultImage)) {
        const outDS = await gdal.openAsync('default', 'w', 'MEM', blocSize, blocSize, 3);
        await gdal.drivers.get(formatGDAL).createCopyAsync(name, outDS);
        defaultImage[blocSize] = gdal.vsimem.release(name);
      }
      return defaultImage[blocSize];
    }
  }

  // On ouvre les images si nécessaire
  const withRgb = b.includes(0) || b.includes(1) || b.includes(2);
  const withIr = b.includes(3);

  // const ds = withRgb ? await gdal.openAsync(url) : null;
  // const dsIr = withIr ? await gdal.openAsync(urlIr) : null;
  const blocks = withRgb
    ? await gdal.openAsync(url).then((ds) => Promise.all([
      ds.bands.getAsync(1)
        .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
        .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y)),
      ds.bands.getAsync(2)
        .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
        .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y)),
      ds.bands.getAsync(3)
        .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
        .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y)),
    ]))
    : [null, null, null];
  blocks.push(withIr
    ? await gdal.openAsync(urlIr).then((ds) => ds.bands.getAsync(1)
      .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
      .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y)))
    : null);

  const outDS = await gdal.openAsync('default', 'w', 'MEM', blocSize, blocSize, 3);

  await Promise.all([
    outDS.bands.getAsync(1).then((band) => band.pixels.writeAsync(0, 0,
      blocSize, blocSize, blocks[b[0]])),
    outDS.bands.getAsync(2).then((band) => band.pixels.writeAsync(0, 0,
      blocSize, blocSize, blocks[b[1]])),
    outDS.bands.getAsync(3).then((band) => band.pixels.writeAsync(0, 0,
      blocSize, blocSize, blocks[b[2]]))])
    .then(() => gdal.drivers.get(formatGDAL).createCopyAsync(name, outDS));

  return gdal.vsimem.release(name);
}

async function getColor(url, x, y, z, col, lig, blocSize) {
  debug('getColor', url, x, y, z, col, lig, blocSize);
  try {
    await fs.promises.access(url, fs.constants.R_OK);
    const ds = await gdal.openAsync(url);
    if (z === 0) {
      return [await (await ds.bands.getAsync(1)).pixels.getAsync(col + x * blocSize,
        lig + y * blocSize),
      await (await ds.bands.getAsync(2)).pixels.getAsync(col + x * blocSize,
        lig + y * blocSize),
      await (await ds.bands.getAsync(3)).pixels.getAsync(col + x * blocSize,
        lig + y * blocSize)];
    }
    return [await (await (await ds.bands.getAsync(1)).overviews.getAsync(z))
      .pixels.getAsync(col, lig),
    await (await (await ds.bands.getAsync(2)).overviews.getAsync(z - 1)).pixels.getAsync(col, lig),
    await (await (await ds.bands.getAsync(3)).overviews.getAsync(z - 1)).pixels.getAsync(col, lig)];
  } catch (_) {
    return [0, 0, 0];
  }
}

async function getDefaultEncoded(formatGDAL, blocSize) {
  const name = `/vsimem/${uuid.v4()}`;
  await gdal.openAsync(name, 'w', formatGDAL, blocSize, blocSize, 3);
  return gdal.vsimem.release(name);
}

function processPatchAsync(patch, blocSize) {
  return new Promise((res, reject) => {
    // On patch le graph
    const { mask } = patch;

    // Modification du graph
    debug('ouverture de l image');
    debug(patch);
    const urlGraph = patch.withOrig ? patch.urlGraphOrig : patch.urlGraph;
    const urlOrthoRgb = patch.withOrig ? patch.urlOrthoRgbOrig : patch.urlOrthoRgb;
    const urlOrthoIr = urlOrthoRgb.replace('.', 'i.');
    const { urlOpiRgb } = patch;
    const urlOpiIr = urlOpiRgb.replace('x', '_ix');
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
