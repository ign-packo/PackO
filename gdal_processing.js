const fs = require('fs');
const debug = require('debug')('gdal');
const gdal = require('gdal-async');
const path = require('path');
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
  // pour les Ortho (UP.tif -> UPi.tif)
  let urlIr = url;
  const dname = path.dirname(urlIr);
  let fname = path.basename(urlIr);

  if (fname.includes('_ix') === false) {
    fname = fname.includes('x') ? fname.replace('x', '_ix') : fname.replace('.', 'i.');
    urlIr = path.join(dname, fname);
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
  debug('On ouvre les images si nécessaire');
  const withRgb = b.includes(0) || b.includes(1) || b.includes(2);
  const withIr = b.includes(3);

  const blocks = [];
  if (withRgb) {
    const dsRgb = await gdal.openAsync(url);
    const blocksRgb = await Promise.all([
      dsRgb.bands.getAsync(1)
        .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
        .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y)),
      dsRgb.bands.getAsync(2)
        .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
        .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y)),
      dsRgb.bands.getAsync(3)
        .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
        .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y)),
    ]);
    // Attention a toujours fermer les images ouvertes avec openAsync
    // afin de ne pas bloquer le fichier
    dsRgb.close();
    blocks.push(blocksRgb[0], blocksRgb[1], blocksRgb[2]);
  } else {
    blocks.push(null, null, null);
  }

  if (withIr) {
    const dsIr = await gdal.openAsync(urlIr);
    const blockIr = await dsIr.bands.getAsync(1)
      .then((band) => (z === 0 ? band : band.overviews.getAsync(z - 1)))
      .then((selectedLevel) => selectedLevel.pixels.readBlockAsync(x, y));
    // Attention a toujours fermer les images ouvertes avec openAsync
    // afin de ne pas bloquer le fichier
    dsIr.close();
    blocks.push(blockIr);
  } else {
    blocks.push(null);
  }

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
    const result = (z === 0)
      ? [
        await (await ds.bands.getAsync(1)).pixels.getAsync(col + x * blocSize,
          lig + y * blocSize),
        await (await ds.bands.getAsync(2)).pixels.getAsync(col + x * blocSize,
          lig + y * blocSize),
        await (await ds.bands.getAsync(3)).pixels.getAsync(col + x * blocSize,
          lig + y * blocSize),
      ] : [
        await (await (await ds.bands.getAsync(1)).overviews.getAsync(z))
          .pixels.getAsync(col, lig),
        await (await (await ds.bands.getAsync(2)).overviews.getAsync(z - 1))
          .pixels.getAsync(col, lig),
        await (await (await ds.bands.getAsync(3)).overviews.getAsync(z - 1))
          .pixels.getAsync(col, lig),
      ];
    // Attention a toujours fermer les images ouvertes avec openAsync
    // afin de ne pas bloquer le fichier
    ds.close();
    return result;
  } catch (_) {
    return [0, 0, 0];
  }
}

async function getDefaultEncoded(formatGDAL, blocSize) {
  const name = `/vsimem/${uuid.v4()}`;
  await gdal.openAsync(name, 'w', formatGDAL, blocSize, blocSize, 3);
  return gdal.vsimem.release(name);
}

function processPatchAsync(patch, blocSize, isAuto) {
  return new Promise((res, reject) => {
    // On patch le graph
    const { mask } = patch;

    // Modification du graph
    debug('ouverture de l image');
    debug(patch);
    const urlGraph = patch.withOrig ? patch.urlGraphOrig : patch.urlGraph;
    const urlOrthoRgb = patch.withOrig ? patch.urlOrthoRgbOrig : patch.urlOrthoRgb;
    const urlOrthoIr = urlOrthoRgb.replace('.', 'i.');
    const { urlOpiRefRgb, urlOpiSecRgb } = patch;
    let urlOpiRefIr = urlOpiRefRgb;
    const dnameRef = path.dirname(urlOpiRefIr);
    let fnameRef = path.basename(urlOpiRefIr);
    if (fnameRef.includes('_ix') === false) {
      fnameRef = fnameRef.includes('x') ? fnameRef.replace('x', '_ix') : fnameRef.replace('.', 'i.');
      urlOpiRefIr = path.join(dnameRef, fnameRef);
    }
    let urlOpiSecIr = urlOpiSecRgb;
    if (isAuto) {
      const dnameSec = path.dirname(urlOpiSecIr);
      let fnameSec = path.basename(urlOpiSecIr);
      if (fnameSec.includes('_ix') === false) {
        fnameSec = fnameSec.includes('x') ? fnameSec.replace('x', '_ix') : fnameSec.replace('.', 'i.');
        urlOpiSecIr = path.join(dnameSec, fnameSec);
      }
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
      patch.withRgb ? gdal.openAsync(urlOpiRefRgb).then((ds) => getBands(ds)) : null,
      patch.withIr ? gdal.openAsync(urlOpiRefIr).then((ds) => getBand(ds)) : null,
      patch.withRgb ? gdal.openAsync(urlOrthoRgb).then((ds) => getBands(ds)) : null,
      patch.withIr ? gdal.openAsync(urlOrthoIr).then((ds) => getBand(ds)) : null,
      (isAuto && patch.withRgb) ? gdal.openAsync(urlOpiSecRgb).then((ds) => getBands(ds)) : null,
      (isAuto && patch.withIr) ? gdal.openAsync(urlOpiSecIr).then((ds) => getBand(ds)) : null,
    ]).then(async (images) => {
      debug('... fin chargement');
      debug('application du patch...');
      // TODO: opi sec
      const graph = images[0];
      const opiRefRgb = images[1];
      const opiRefIr = images[2];
      const orthoRgb = images[3];
      const orthoIr = images[4];
      const opiSecRgb = (isAuto ? images[5] : 'none');
      const opiSecIr = (isAuto ? images[6] : 'none');

      graph.bands[0].forEach((_element, index) => {
        /* eslint-disable no-param-reassign */
        if (mask.data[4 * index] > 0) {
          [graph.bands[0][index],
            graph.bands[1][index],
            graph.bands[2][index]] = patch.colorRef;
          if (orthoRgb) {
            [orthoRgb.bands[0][index],
              orthoRgb.bands[1][index],
              orthoRgb.bands[2][index]] = [
              opiRefRgb.bands[0][index],
              opiRefRgb.bands[1][index],
              opiRefRgb.bands[2][index]];
          }
          if (orthoIr) {
            orthoIr.bands[0][index] = opiRefIr.bands[0][index];
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

      // Attention a toujours fermer les images ouvertes avec openAsync
      // afin de ne pas bloquer le fichier
      graph.ds.close();
      if (orthoRgb) {
        orthoRgb.ds.close();
      }
      if (orthoIr) {
        orthoIr.ds.close();
      }
      if (opiRefRgb) {
        opiRefRgb.ds.close();
      }
      if (opiRefIr) {
        opiRefIr.ds.close();
      }
      if (isAuto) {
        if (opiSecRgb) {
          opiSecRgb.ds.close();
        }
        if (opiSecIr) {
          opiSecIr.ds.close();
        }
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
exports.processPatchAsync = processPatchAsync;
