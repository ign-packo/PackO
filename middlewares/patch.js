const debug = require('debug')('patch');
const debugOzcpp = require('debug')('patch:Ozcpp');
const fs = require('fs');
const canvas = require('canvas');
const turf = require('@turf/turf');
const path = require('path');
const { matchedData } = require('express-validator');
const { execFile } = require('child_process');
const cog = require('../cog_path');
const gdalProcessing = require('../gdal_processing');
const db = require('../db/db');
const gjson = require('../db/geojson');

const ozExe = process.env.OZEXE;
let dirTmp = '';

function getSlabs(coordinates, overviews, borderMeters = 0) {
  const BBox = {};
  coordinates.forEach((point) => {
    if ('xmin' in BBox) {
      BBox.xmin = Math.min(BBox.xmin, point[0]);
      BBox.xmax = Math.max(BBox.xmax, point[0]);
      BBox.ymin = Math.min(BBox.ymin, point[1]);
      BBox.ymax = Math.max(BBox.ymax, point[1]);
    } else {
      [BBox.xmin, BBox.ymin] = point;
      [BBox.xmax, BBox.ymax] = point;
    }
  });
  BBox.xmin -= borderMeters;
  BBox.ymin -= borderMeters;
  BBox.xmax += borderMeters;
  BBox.ymax += borderMeters;

  debug('~BBox: Done');

  const slabs = [];

  const lvlMax = overviews.dataSet.level.max;
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const slabWidth = overviews.tileSize.width * overviews.slabSize.width;
  const slabHeight = overviews.tileSize.height * overviews.slabSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - lvlMax);
  const x0 = Math.floor((BBox.xmin - xOrigin) / (resolution * slabWidth));
  const x1 = Math.ceil((BBox.xmax - xOrigin) / (resolution * slabWidth));
  const y0 = Math.floor((yOrigin - BBox.ymax) / (resolution * slabHeight));
  const y1 = Math.ceil((yOrigin - BBox.ymin) / (resolution * slabHeight));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      slabs.push({ x: `${x}`, y: `${y}`, z: `${lvlMax}` });
    }
  }
  return slabs;
}

function rename(url, urlOrig) {
  fs.renameSync(url, urlOrig);
}

// Création des points de géométrie pour chaque dalle intersectant la saisie polygone
function createRingBySlab(slab, coordinates, overviews) {
  debug('     ~~createRingBySlab');
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const slabWidth = overviews.tileSize.width * overviews.slabSize.width;
  const slabHeight = overviews.tileSize.height * overviews.slabSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - slab.z);
  const inputRings = [];
  for (let n = 0; n < coordinates.length; n += 1) {
    const coors = coordinates[n];
    const ring = [];
    for (let i = 0; i < coors.length; i += 1) {
      const point = coors[i];
      const x = Math.round((point[0] - xOrigin - slab.x * slabWidth * resolution)
          / resolution);
      const y = Math.round((yOrigin - point[1] - slab.y * slabHeight * resolution)
          / resolution);
      ring.push([x, y]);
    }
    inputRings.push(ring);
  }

  const bbox = [0, 0, slabWidth, slabHeight];
  const poly = turf.polygon(inputRings);
  const clipped = turf.bboxClip(poly, bbox);
  const rings = clipped.geometry.coordinates;

  return rings;
}

// Calcule du lasque dans le cas ou la BBox et le polygone s'intersectent bien
function createMask(overviews, rings) {
  debug('     ~~createMask');
  const slabWidth = overviews.tileSize.width * overviews.slabSize.width;
  const slabHeight = overviews.tileSize.height * overviews.slabSize.height;

  const mask = canvas.createCanvas(slabWidth, slabHeight);
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

  mask.data = mask.toBuffer('raw');
  return mask;
}

// Preparation des masques
function createPatch(slab,
  propOpis,
  withRgb,
  withIr,
  overviews,
  dirCache,
  idBranch,
  isAuto = false) {
  debug('~~createPatch : ', slab, propOpis, withRgb, withIr, isAuto);
  const {
    colorRef, nameRef, colorSec, nameSec,
  } = propOpis;

  const patchData = {
    slab, colorRef, colorSec, withRgb, withIr,
  };

  const cogPath = cog.getSlabPath(
    slab.x,
    slab.y,
    slab.z,
    overviews.pathDepth,
  );

  patchData.cogPath = cogPath;

  const nameRefRgb = withRgb ? nameRef : nameRef.replace('_ix', 'x');
  const nameRefIr = withRgb ? nameRef.replace('x', '_ix') : nameRef;
  patchData.urlGraph = path.join(dirCache, 'graph', cogPath.dirPath,
    `${idBranch}_${cogPath.filename}.tif`);
  patchData.urlOrthoRgb = path.join(dirCache, 'ortho', cogPath.dirPath,
    `${idBranch}_${cogPath.filename}.tif`);
  patchData.urlOrthoIr = path.join(dirCache, 'ortho', cogPath.dirPath,
    `${idBranch}_${cogPath.filename}i.tif`);
  patchData.urlOpiRefRgb = path.join(dirCache, 'opi', cogPath.dirPath,
    `${cogPath.filename}_${nameRefRgb}.tif`);
  patchData.urlOpiRefIr = path.join(dirCache, 'opi', cogPath.dirPath,
    `${cogPath.filename}_${nameRefIr}.tif`);
  if (isAuto) {
    const nameSecRgb = withRgb ? nameSec : nameSec.replace('_ix', 'x');
    const nameSecIr = withRgb ? nameSec.replace('x', '_ix') : nameSec;
    patchData.urlOpiSecRgb = path.join(dirCache, 'opi', cogPath.dirPath,
      `${cogPath.filename}_${nameSecRgb}.tif`);
    patchData.urlOpiSecIr = path.join(dirCache, 'opi', cogPath.dirPath,
      `${cogPath.filename}_${nameSecIr}.tif`);
  }
  patchData.urlGraphOrig = path.join(dirCache, 'graph', cogPath.dirPath,
    `${cogPath.filename}.tif`);
  patchData.urlOrthoRgbOrig = path.join(dirCache, 'ortho', cogPath.dirPath,
    `${cogPath.filename}.tif`);
  patchData.urlOrthoIrOrig = path.join(dirCache, 'ortho', cogPath.dirPath,
    `${cogPath.filename}i.tif`);
  patchData.withOrig = false;

  // Give acces to file. A REFACTO
  // Verif juste l'existance du fichier et non les permissions
  const promises = [];
  promises.push(fs.promises.access(patchData.urlGraph, fs.constants.F_OK).catch(
    () => {
      // cas ou le patch sort du cache --> géré avec Opi
      patchData.withOrig = true;
    },
  ));
  if (patchData.withRgb) {
    promises.push(fs.promises.access(patchData.urlOrthoRgb, fs.constants.F_OK).catch(
      () => {
        // cas ou le patch sort du cache --> géré avec Opi
        patchData.withOrig = true;
      },
    ));
    promises.push(fs.promises.access(patchData.urlOpiRefRgb, fs.constants.F_OK));
    if (isAuto) promises.push(fs.promises.access(patchData.urlOpiSecRgb, fs.constants.F_OK));
  }
  if (patchData.withIr) {
    promises.push(fs.promises.access(patchData.urlOrthoIr, fs.constants.F_OK).catch(
      () => {
        // cas ou le patch sort du cache --> géré avec Opi
        patchData.withOrig = true;
      },
    ));
    promises.push(fs.promises.access(patchData.urlOpiRefIr, fs.constants.F_OK));
    if (isAuto) promises.push(fs.promises.access(patchData.urlOpiSecIr, fs.constants.F_OK));
  }

  return Promise.all(promises).then(() => patchData);
}

async function getPatches(req, _res, next) {
  debug('>>GET patches');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch, nbPatches } = params;
  try {
    const activePatches = await db.getActivePatches(req.client, idBranch, nbPatches);
    req.result = { json: activePatches, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: error,
      code: 406,
      function: 'getPatches',
    };
  }
  debug('  next>>');
  next();
}

function ozCppExe(patches, outputDir, geojsonPath) {
  debug('>>ozCppExe');
  const arrArgsR = ['-r'];
  const arrArgsS = ['-s'];
  const arrArgsG = ['-g'];
  const arrArgsO = ['-or'];
  const arrArgsRc = ['-rc'];
  const arrArgsSc = ['-sc'];
  const arrArgsOc = ['-orc'];
  patches.forEach((patch) => {
    arrArgsR.push(patch.withRgb ? patch.urlOpiRefRgb : patch.urlOpiRefIr);
    arrArgsS.push(patch.withRgb ? patch.urlOpiSecRgb : patch.urlOpiSecIr);
    arrArgsG.push(patch.withOrig ? patch.urlGraphOrig : patch.urlGraph);
    if (patch.withRgb) {
      arrArgsO.push(patch.withOrig ? patch.urlOrthoRgbOrig : patch.urlOrthoRgb);
    } else {
      arrArgsO.push(patch.withOrig ? patch.urlOrthoIrOrig : patch.urlOrthoIr);
    }
    if (patch.withRgb && patch.withIr) {
      arrArgsRc.push(patch.urlOpiRefIr);
      arrArgsSc.push(patch.urlOpiSecIr);
      arrArgsOc.push(patch.withOrig ? patch.urlOrthoIrOrig : patch.urlOrthoIr);
    }
  });
  const arrArgs = [...arrArgsR, ...(arrArgsRc.length === 1 ? [] : arrArgsRc),
    ...arrArgsS, ...(arrArgsSc.length === 1 ? [] : arrArgsSc),
    ...arrArgsG, ...arrArgsO, ...(arrArgsOc.length === 1 ? [] : arrArgsOc),
    '-p', geojsonPath];
  const options = {
    weightDiffCost: 0.95,
    weightTransition: 10,
    minCost: 0.0001,
    tension: 2,
    border: 20,
    outDir: outputDir,
  };
  arrArgs.push(
    '-w', `${options.weightDiffCost}`,
    '-wt', `${options.weightTransition}`,
    '-m', `${options.minCost}`,
    '-t', `${options.tension}`,
    '-b', `${options.border}`,
    '-o', `${options.outDir}`,
    '--verbose',
  );
  return new Promise((res, rej) => {
    execFile(ozExe, arrArgs, { env: { PROJ_LIB: process.env.PROJ_LIB } },
      (err, stdout) => {
        debugOzcpp(stdout);
        if (err) {
          console.warn(err);
          rej(err);
        } else {
          res(`${stdout} OK`);
        }
      });
  });
}

function createUrlOutputSemiAuto(urlOutputData, idBranch, patch) {
  debug('~~createUrlOutputSemiAuto');
  const outputUrl = {};
  const filename = (patch.withOrig ? '' : `${idBranch}_`) + patch.cogPath.filename;
  outputUrl.urlGraphOutput = path.join(urlOutputData,
    'out_graph',
    `out_${filename}_georef.tif`);

  if (patch.withRgb) {
    debug('  >>>> RGB');
    outputUrl.urlOrthoRgbOutput = path.join(urlOutputData,
      'out_ortho',
      `out_${filename}_georef.tif`);
  }

  if (patch.withIr) {
    debug('  >>>> IR');
    outputUrl.urlOrthoIrOutput = path.join(urlOutputData,
      'out_ortho',
      `out_${filename}i_georef.tif`);
  }
  return outputUrl;
}

function createUrlOutputPolygon(dirCache, patch, idStorage) {
  debug('~~createUrlOutputPolygon');
  const { idBranch, newBlockNum, newPatchNum } = idStorage;
  const outputUrl = {};
  outputUrl.urlGraphOutput = path.join(dirCache,
    'graph',
    patch.cogPath.dirPath,
    `${idBranch}_${patch.cogPath.filename}_${newBlockNum}-${newPatchNum}.tif`);

  if (patch.withRgb) {
    debug('  >>>> RGB');
    outputUrl.urlOrthoRgbOutput = path.join(dirCache,
      'ortho', patch.cogPath.dirPath,
      `${idBranch}_${patch.cogPath.filename}_${newBlockNum}-${newPatchNum}.tif`);
  }
  if (patch.withIr) {
    debug('  >>>> IR');
    outputUrl.urlOrthoIrOutput = path.join(dirCache,
      'ortho', patch.cogPath.dirPath,
      `${idBranch}_${patch.cogPath.filename}_${newBlockNum}-${newPatchNum}i.tif`);
  }
  return outputUrl;
}

function readHistory(urlHistory) {
  debug('  ~~readHistory');
  const history = JSON.parse(`${fs.readFileSync(`${urlHistory}`)}`);
  debug('historique :', history);
  const prevBlockNum = history.numBlock[history.numBlock.length - 1];
  return [history, prevBlockNum];
}

function renameSlab(dirCache, patch, idStorage) {
  debug('  ~~renameSlab');
  const { idBranch, newBlockNum, newPatchNum } = idStorage;
  const urlHistory = path.join(dirCache,
    'opi',
    patch.cogPath.dirPath,
    `${idBranch}_${patch.cogPath.filename}_history.packo`);
  const [history, prevBlockNum] = fs.existsSync(urlHistory)
    ? readHistory(urlHistory)
    : [{}, 'orig'];

  if (prevBlockNum !== 'orig') {
    let blockNum = newBlockNum;
    if (prevBlockNum !== newBlockNum) {
      history.numBlock.push(newBlockNum);
      history[`${newBlockNum}`] = ['orig'];
      blockNum = prevBlockNum;
    }

    const prevPatchNum = history[`${blockNum}`][history[`${blockNum}`].length - 1];

    // on ne fait un rename que si prevPatchNum n'est pas 'orig'
    if (prevPatchNum !== 'orig') {
      const urlGraphPrev = path.join(dirCache, 'graph', patch.cogPath.dirPath,
        `${idBranch}_${patch.cogPath.filename}_${blockNum}-${prevPatchNum}.tif`);
      rename(patch.urlGraph, urlGraphPrev);

      if (patch.withRgb) {
        const urlOrthoRbgPrev = path.join(dirCache, 'ortho', patch.cogPath.dirPath,
          `${idBranch}_${patch.cogPath.filename}_${blockNum}-${prevPatchNum}.tif`);
        debug('rename ortho ', patch.urlOrthoRgb, ' en ', urlOrthoRbgPrev);
        rename(patch.urlOrthoRgb, urlOrthoRbgPrev);
      }

      if (patch.withIr) {
        const urlOrthoIrPrev = path.join(dirCache, 'ortho', patch.cogPath.dirPath,
          `${idBranch}_${patch.cogPath.filename}_${blockNum}-${prevPatchNum}i.tif`);
        rename(patch.urlOrthoIr, urlOrthoIrPrev);
      }
    }
    history[`${newBlockNum}`].push(newPatchNum);
    debug(' historique :', history);
    fs.writeFileSync(`${urlHistory}`, JSON.stringify(history));
  } else {
    debug('le fichier \'history\' n\'existe pas encore');
    history.numBlock = [prevBlockNum, newBlockNum];
    history[`${newBlockNum}`] = [prevBlockNum, newPatchNum];
    fs.writeFileSync(`${urlHistory}`, JSON.stringify(history));
  // On a pas besoin de renommer l'image d'origine
  // qui reste partagée pour toutes les branches
  }
  rename(patch.urlGraphOutput, patch.urlGraph);
  if (patch.withRgb) {
    rename(patch.urlOrthoRgbOutput, patch.urlOrthoRgb);
  }
  if (patch.withIr) {
    rename(patch.urlOrthoIrOutput, patch.urlOrthoIr);
  }
}

async function processPolygonPatch(pgClient, slabs, feature, overviews, infoRgbIr,
  dirCache, idStorage) {
  debug('  ~~processPolygonPatch');
  // Pour chaque dalle intersectant le polygone, crée le patch GDAL et renomme les fichiers.
  const slabsProcessed = [];
  const processPromises = [];
  for (const slab of slabs) {
    const ring = createRingBySlab(slab, feature.geometry.coordinates, overviews);
    if (ring.length > 0) {
      slabsProcessed.push(slab);
      processPromises.push((async () => {
        let patch = await createPatch(
          slab,
          {
            colorRef: feature.properties.color,
            nameRef: feature.properties.opiName,
          },
          infoRgbIr.withRgb,
          infoRgbIr.withIr,
          overviews,
          dirCache,
          idStorage.idBranch,
        );
        // Creation des urls des données de sortie
        const outputUrl = createUrlOutputPolygon(dirCache, patch, idStorage);
        patch = { ...patch, ...outputUrl, mask: createMask(overviews, ring) };
        // Process polygon patch
        await gdalProcessing.processPolygonPatchAsync(patch, overviews.tileSize.width);
        // Renomme les données de sortie
        renameSlab(dirCache, patch, idStorage);
      })());
    }
  }
  const insertPatchPromise = db.insertSlabs(pgClient, idStorage.idPatch, slabsProcessed);
  debug('', processPromises.length, 'patchs à appliquer.');
  debug('~Promise.all');
  await Promise.all([...processPromises, insertPatchPromise]);
  return slabsProcessed;
}

async function processSemiAutoPatch(pgClient, slabs, feature, overviews, infoRgbIr, dirCache,
  idStorage, geojson) {
  debug('  ~~processSemiAutoPatch');
  const insertPatchPromise = db.insertSlabs(pgClient, idStorage.idPatch, slabs);
  const isAuto = true;
  // On écrit la saisie dans un fichier json pour le donner à OzCppExe
  const geojsonPath = await gjson.writeGeojson(idStorage, dirCache, geojson, feature);
  debug('~create patch');
  const promisesCheckFile = slabs.map((slab) => createPatch(slab,
    {
      colorRef: feature.properties.color,
      nameRef: feature.properties.opiName,
      colorSec: feature.properties.colorSec,
      nameSec: feature.properties.opiNameSec,
    },
    infoRgbIr.withRgb,
    infoRgbIr.withIr,
    overviews,
    dirCache,
    idStorage.idBranch,
    isAuto));
  debug('', promisesCheckFile.length, 'patchs à appliquer.');
  const urlOutputData = `${dirCache}/result_ozcpp_idBr${idStorage.idBranch}`;
  dirTmp = urlOutputData;
  debug('~Promise.all');
  const patchOnSlabs = await Promise.all(promisesCheckFile);
  // Traitement par OzCppExe
  await ozCppExe(patchOnSlabs, urlOutputData, geojsonPath);
  // Création des URL des données de sortie, puis déplacement et renommage des fichiers
  debug('~rename patch');
  patchOnSlabs.forEach((patch) => {
    const outputUrl = createUrlOutputSemiAuto(urlOutputData, idStorage.idBranch, patch);
    renameSlab(dirCache, { ...patch, ...outputUrl }, idStorage);
  });
  await insertPatchPromise;
  return slabs;
}

async function applyPatch(pgClient, overviews, dirCache, idStorage, geojson, feature) {
  const patchIsAuto = feature.properties.is_auto;
  debug('  ~~applyPatch: ', feature);
  const nameOpis = [feature.properties.opiName,
    ...(patchIsAuto ? [feature.properties.opiNameSec] : [])];

  const infoOpis = await db.getOPIFromNames(pgClient, idStorage.idBranch, nameOpis);
  const infoOpiRef = infoOpis.find((opi) => opi.name === feature.properties.opiName);
  const infoRgbIr = { withRgb: infoOpiRef.with_rgb, withIr: infoOpiRef.with_ir };
  const idOpi = {
    ref: infoOpiRef.id,
    ...(patchIsAuto ? {
      sec: infoOpis.find((opi) => opi.name === feature.properties.opiNameSec).id,
    } : {}),
  };

  const patchInsertedPromise = db.insertPatch(pgClient, idStorage.idBlock, feature.geometry,
    idOpi, patchIsAuto);

  // in case of patch-auto, add border to bbox for selecting slabs
  const borderMeters = patchIsAuto ? 20 : 0;
  let { coordinates } = feature.geometry;
  if (!patchIsAuto) {
    [coordinates] = coordinates;
  }
  const slabs = getSlabs(coordinates, overviews, borderMeters);

  const patchInserted = await patchInsertedPromise;
  const processPatch = patchIsAuto ? processSemiAutoPatch : processPolygonPatch;
  const slabsProcessed = await processPatch(pgClient,
    slabs,
    feature,
    overviews,
    infoRgbIr,
    dirCache,
    { ...idStorage, newPatchNum: patchInserted.num, idPatch: patchInserted.id_patch },
    geojson);

  debug('on retourne les dalles modifiees : ', slabsProcessed);
  debug('Fin de applyPatch');
  return slabsProcessed;
}

async function applyMultiPatches(pgClient, overviews, dirCache, idBranch, geojson) {
  debug('applyMultiPatches', geojson);
  const multipatchInserted = await db.insertMultiPatchesBlock(pgClient, idBranch);
  const idStorage = {
    idBranch,
    idBlock: multipatchInserted.id_block,
    newBlockNum: multipatchInserted.num,
  };
  const arraySlabs = [];
  for (const feature of geojson.features) {
    arraySlabs.push(await applyPatch(pgClient, overviews, dirCache, idStorage, geojson,
      feature));
  }
  return arraySlabs;
}

async function postMultiPatches(req, _res, next) {
  debug('>>POST multipatch');
  if (req.error) {
    debug(req.error);
    next();
    return;
  }
  const { overviews } = req;
  const params = matchedData(req);
  const geoJson = params.geoJSON;
  const { idBranch } = params;

  await applyMultiPatches(req.client,
    overviews,
    req.dir_cache,
    idBranch,
    geoJson)
    .then((slabsModified) => {
      debug('slabsModified : ', slabsModified);
      req.result = { json: slabsModified, code: 200 };
    })
    .catch((error) => {
      debug(error);
      req.error = {
        msg: error.toString(),
        code: 404,
        function: 'patch',
      };
    })
    .finally(() => {
      debug('Fin de POST patch');
      if (fs.existsSync(dirTmp)) {
        if (fs.lstatSync(dirTmp).isDirectory()) {
          try {
            fs.rmdirSync(dirTmp, { recursive: true, force: true });
            debug(`Suppression '${dirTmp}' OK`);
          } catch (err) {
            debug(err);
            return;
          }
        }
      }
      next();
    });
}

async function undo(req, _res, next) {
  debug('>>PUT multipatch/undo');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req;
  const [firstOPI] = Object.values(overviews.list_OPI);
  const withRgb = firstOPI.with_rgb;
  const withIr = firstOPI.with_ir;

  const activePatches = await db.getActivePatches(req.client, idBranch);

  if (activePatches.features.length === 0) {
    debug('rien à annuler');
    req.result = { json: 'rien à annuler', code: 201 };
    next();
    return;
  }

  // trouver le multi-patch a annuler: c'est-à-dire sortir les éléments
  // de req.app.activePatches.features avec blockId == lastBlockId
  const lastBlockId = Math.max(
    ...activePatches.features.map((feature) => feature.properties.id_block),
  );
  // filtrage du dernier multipatch à désactiver
  const filterPatches = activePatches.features
    .filter((feature) => feature.properties.id_block === lastBlockId);
  // récupération du numéro de multipatch
  const lastBlockNum = filterPatches[0].properties.num_block;

  debug(`Block '${lastBlockNum}' à annuler.`);

  let slabs = await db.getSlabs(req.client, filterPatches.map((feature) => feature.properties.id));

  debug(slabs);
  debug(slabs.length, 'dalles impactées');
  slabs = slabs.map((slab) => {
    debug('slab :', slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews.pathDepth);
    const opiDir = path.join(req.dir_cache, 'opi', cogPath.dirPath);

    // on récupère l'historique de cette tuile
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const history = JSON.parse(`${fs.readFileSync(`${urlHistory}`)}`);
    return {
      ...slab, history, urlHistory, cogPath,
    };
  });
  const slabsError = slabs.filter(
    ({ history }) => (history.numBlock[history.numBlock.length - 1]) !== lastBlockNum,
  );
  if (slabsError.length > 0) {
    req.error = {
      msg: slabsError.map((slabError) => {
        debug("erreur d'historique :", slabError.history, lastBlockNum);
        return `error: history on tile ${slabError.cogPath}`;
      }),
      code: 404,
      function: 'undo',
    };
    next();
    return;
  }
  const seen = new Set();
  slabs = slabs.filter(
    ({ cogPath }) => !seen.has(cogPath.filename) && seen.add(cogPath.filename),
  );

  slabs.forEach((slab) => {
    const { cogPath } = slab;
    debug(cogPath.filename);
    // on récupère la version à restaurer
    const { history } = slab;
    debug(history);
    const patchIdPrev = history[`${lastBlockNum}`][history[`${lastBlockNum}`].length - 1];
    const numBlockSelected = history.numBlock[history.numBlock.length - 2];
    debug(patchIdPrev, numBlockSelected);
    let numPatchSelected = 'orig';
    if (numBlockSelected !== 'orig') {
      numPatchSelected = history[`${numBlockSelected}`][history[`${numBlockSelected}`].length - 1];
    }
    // mise à jour de l'historique
    history.numBlock.pop();
    delete history[`${lastBlockNum}`];
    debug('newHistory : ', history);
    fs.writeFileSync(`${slab.urlHistory}`, JSON.stringify(history));
    debug(` dalle ${slab.z}/${slab.y}/${slab.x} : version ${numBlockSelected} selectionnée`);
    const graphDir = path.join(req.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(req.dir_cache, 'ortho', cogPath.dirPath);
    // renommer les images pour pointer sur ce numéro de version
    const nameCog = `${idBranch}_${cogPath.filename}`;
    const nameCogSelect = `${idBranch}_${cogPath.filename}_${numBlockSelected}-${numPatchSelected}`;
    const nameCogPrev = `${idBranch}_${cogPath.filename}_${lastBlockNum}-${patchIdPrev}`;
    const urlGraph = path.join(graphDir, `${nameCog}.tif`);
    const urlOrthoRgb = path.join(orthoDir, `${nameCog}.tif`);
    const urlOrthoIr = path.join(orthoDir, `${nameCog}i.tif`);
    const urlGraphSelected = path.join(graphDir, `${nameCogSelect}.tif`);
    const urlOrthoRgbSelected = path.join(orthoDir, `${nameCogSelect}.tif`);
    const urlOrthoIrSelected = path.join(orthoDir, `${nameCogSelect}i.tif`);

    // on renomme les anciennes images
    const urlGraphPrev = path.join(graphDir, `${nameCogPrev}.tif`);
    const urlOrthoRgbPrev = path.join(orthoDir, `${nameCogPrev}.tif`);
    const urlOrthoIrPrev = path.join(orthoDir, `${nameCogPrev}i.tif`);

    rename(urlGraph, urlGraphPrev);
    if (withRgb) rename(urlOrthoRgb, urlOrthoRgbPrev);
    if (withIr) rename(urlOrthoIr, urlOrthoIrPrev);

    // on renomme les nouvelles images sauf si c'est la version orig
    if (numBlockSelected !== 'orig') {
      rename(urlGraphSelected, urlGraph);
      if (withRgb) rename(urlOrthoRgbSelected, urlOrthoRgb);
      if (withIr) rename(urlOrthoIrSelected, urlOrthoIr);
    }
  });

  const result = await db.deactiveBlock(req.client, lastBlockId);

  debug(result.rowCount);

  debug('fin du undo');
  req.result = { json: `undo: multipatch ${lastBlockNum} annulé`, code: 200 };
  debug('  next>>');
  next();
}

async function redo(req, _res, next) {
  debug('>>PUT multipatch/redo');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req;
  const [firstOPI] = Object.values(overviews.list_OPI);
  const withRgb = firstOPI.with_rgb;
  const withIr = firstOPI.with_ir;

  const unactivePatches = await db.getUnactivePatches(req.client, idBranch);

  if (unactivePatches.features.length === 0) {
    debug('nothing to redo');
    req.result = { json: 'rien à réappliquer', code: 201 };
    next();
    return;
  }
  // trouver le multi-patch a réactiver: c'est-à-dire sortir les éléments
  // de req.app.unactivePatches.features avec blockId == blockIdRedo

  const blockIdRedo = Math.min(
    ...unactivePatches.features.map((feature) => feature.properties.id_block),
  );
  // filtrage du premier multipatch à réactiver
  const filterPatches = unactivePatches.features
    .filter((feature) => feature.properties.id_block === blockIdRedo);
  // récupération du numéro de multipatch
  const blockNumRedo = filterPatches[0].properties.num_block;

  debug(`Block '${blockNumRedo}' à réappliquer.`);
  // Map id patch avec son numéro
  const idsPatchesMap = new Map(filterPatches
    .sort((a, b) => a.properties.num - b.properties.num)
    .map((feature) => [feature.properties.id, feature.properties.num]));
  debug(idsPatchesMap);
  // Récupération des slabs liée aux ids des patchs
  const slabsOfFeature = await db.getSlabs(req.client, [...idsPatchesMap.keys()]);
  debug(slabsOfFeature, 'dalles impactées');
  // pour chaque tuile, renommer les images
  slabsOfFeature.forEach((slab) => {
    debug(slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews.pathDepth);
    debug(cogPath);
    const graphDir = path.join(req.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(req.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(req.dir_cache, 'opi', cogPath.dirPath);
    const patchNumRedo = idsPatchesMap.get(slab.id_patch);

    // on met a jour l'historique
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const [history, blockNumPrev] = readHistory(urlHistory);
    let patchNumPrev = 'orig';
    if (blockNumPrev !== 'orig') {
      patchNumPrev = history[`${blockNumPrev}`][history[blockNumPrev].length - 1];
    }
    if (blockNumPrev !== blockNumRedo) {
      history.numBlock.push(blockNumRedo);
    }
    if (history[`${blockNumRedo}`] === undefined) {
      history[`${blockNumRedo}`] = ['orig'];
    }
    history[`${blockNumRedo}`].push(patchNumRedo);
    fs.writeFileSync(`${urlHistory}`, JSON.stringify(history));
    // noms des fichiers
    const nameCog = `${idBranch}_${cogPath.filename}`;
    const nameCogSelect = `${idBranch}_${cogPath.filename}_${blockNumRedo}-${patchNumRedo}`;
    const nameCogPrev = `${idBranch}_${cogPath.filename}_${blockNumPrev}-${patchNumPrev}`;
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(graphDir, `${nameCogSelect}.tif`);
    const urlOrthoRgbSelected = path.join(orthoDir, `${nameCogSelect}.tif`);
    const urlOrthoIrSelected = path.join(orthoDir, `${nameCogSelect}i.tif`);
    // renommer les images pour pointer sur ce numéro de version
    const urlGraph = path.join(graphDir, `${nameCog}.tif`);
    const urlOrthoRgb = path.join(orthoDir, `${nameCog}.tif`);
    const urlOrthoIr = path.join(orthoDir, `${nameCog}i.tif`);
    // on renomme les anciennes images
    const urlGraphPrev = path.join(graphDir, `${nameCogPrev}.tif`);
    const urlOrthoRgbPrev = path.join(orthoDir, `${nameCogPrev}.tif`);
    const urlOrthoIrPrev = path.join(orthoDir, `${nameCogPrev}i.tif`);
    if (patchNumPrev !== 'orig') {
      rename(urlGraph, urlGraphPrev);
      if (withRgb) rename(urlOrthoRgb, urlOrthoRgbPrev);
      if (withIr) rename(urlOrthoIr, urlOrthoIrPrev);
    }

    // on renomme les nouvelles images
    rename(urlGraphSelected, urlGraph);
    if (withRgb) rename(urlOrthoRgbSelected, urlOrthoRgb);
    if (withIr) rename(urlOrthoIrSelected, urlOrthoIr);
  });
  // on remet les features dans req.app.activePatches.features

  const result = await db.reactiveBlock(req.client, blockIdRedo);
  debug(result.rowCount);

  debug('fin du redo');
  req.result = { json: `redo: multipatch ${blockNumRedo} réappliqué`, code: 200 };
  debug('  next>>');
  next();
}

async function clear(req, _res, next) {
  debug('>>PUT multipatches/clear');
  if (req.error) {
    next();
    return;
  }
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    req.result = { json: 'non autorisé', code: 401 };
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req;

  const activePatches = await db.getActivePatches(req.client, idBranch);

  // pour chaque patch de req.app.activePatches.features
  if (activePatches.features.length === 0) {
    debug(' nothing to clear');
    req.result = { json: 'rien à nettoyer', code: 201 };
    next();
    return;
  }
  const { features } = activePatches;
  const slabsDico = {};
  features.forEach((feature) => {
    feature.properties.slabs.forEach((slab) => {
      slabsDico[JSON.stringify(slab)] = { x: slab[0], y: slab[1], z: slab[2] };
    });
  });
  debug('', Object.keys(slabsDico).length, ' dalles impactées');

  debug(slabsDico);

  Object.values(slabsDico).forEach((slab) => {
    debug('clear sur : ', slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews.pathDepth);

    const graphDir = path.join(req.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(req.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(req.dir_cache, 'opi', cogPath.dirPath);

    const arrayLinkGraph = fs.readdirSync(graphDir).filter((filename) => (filename.startsWith(`${idBranch}_${cogPath.filename}`)));
    // suppression des images intermediaires
    arrayLinkGraph.forEach((file) => fs.unlinkSync(
      path.join(graphDir, file),
    ));
    const arrayLinkOrtho = fs.readdirSync(orthoDir).filter((filename) => (filename.startsWith(`${idBranch}_${cogPath.filename}`)));
    // suppression des images intermediaires
    arrayLinkOrtho.forEach((file) => fs.unlinkSync(
      path.join(orthoDir, file),
    ));

    // remise à zéro de l'historique de la tuile
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    fs.unlinkSync(urlHistory);
  });

  const result = await db.deleteMultiPatchesBlocks(req.client, idBranch);

  debug(result.rowCount);

  debug('fin du clear');
  req.result = { json: 'clear: tous les patches ont été effacés', code: 200 };
  debug('  next>>');
  next();
}

module.exports = {
  getPatches,
  applyPatch,
  applyMultiPatches,
  postMultiPatches,
  undo,
  redo,
  clear,
};
