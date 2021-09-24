const debug = require('debug')('patch');
const fs = require('fs');
const PImage = require('pureimage');
const turf = require('@turf/turf');
const path = require('path');
const { matchedData } = require('express-validator');
const cog = require('../cog_path');
const gdalProcessing = require('../gdal_processing');
const db = require('../db/db');

// Encapsulation des informations du requestBody dans une nouvelle clé 'keyName' ("body" par defaut)
function encapBody(req, _res, next) {
  let keyName = 'body';
  if (this.keyName) { keyName = this.keyName; }
  if (JSON.stringify(req.body) !== '{}') {
    const requestBodyKeys = Object.keys(req.body);
    req.body[keyName] = JSON.parse(JSON.stringify(req.body));
    for (let i = 0; i < requestBodyKeys.length; i += 1) {
      delete req.body[requestBodyKeys[i]];
    }
  }
  next();
}

function getCOGs(features, overviews) {
  const BBox = {};
  features.forEach((feature) => {
    feature.geometry.coordinates[0].forEach((point) => {
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
  });
  debug('~BBox: Done');

  const cogs = [];

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
      cogs.push({ x: `${x}`, y: `${y}`, z: `${lvlMax}` });
    }
  }
  return cogs;
}

function rename(url, urlOrig) {
  gdalProcessing.clearCache();
  fs.renameSync(url, urlOrig);
}

async function getPatches(req, _res, next) {
  debug('~~~GET patches');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  try {
    const activePatches = await db.getActivePatches(req.client, idBranch);
    req.result = { json: activePatches, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: error,
      code: 406,
      function: 'getPatches',
    };
  }
  next();
}

// Preparation des masques
function createPatch(slab, geoJson, overviews, dirCache, idBranch) {
  debug('createPatch : ', slab);
  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  const slabWidth = overviews.tileSize.width * overviews.slabSize.width;
  const slabHeight = overviews.tileSize.height * overviews.slabSize.height;

  const resolution = overviews.resolution * 2 ** (overviews.level.max - slab.z);
  const inputRings = [];
  for (let f = 0; f < geoJson.features.length; f += 1) {
    const feature = geoJson.features[f];
    for (let n = 0; n < feature.geometry.coordinates.length; n += 1) {
      const coordinates = feature.geometry.coordinates[n];
      const ring = [];
      for (let i = 0; i < coordinates.length; i += 1) {
        const point = coordinates[i];
        const x = Math.round((point[0] - xOrigin - slab.x * slabWidth * resolution)
              / resolution);
        const y = Math.round((yOrigin - point[1] - slab.y * slabHeight * resolution)
              / resolution) + 1;
        ring.push([x, y]);
      }
      inputRings.push(ring);
    }
  }

  const bbox = [0, 0, slabWidth, slabHeight + 1];
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
  const mask = PImage.make(slabWidth, slabHeight + 1);
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

  const P = { slab, mask, color: geoJson.features[0].properties.color };
  P.cogPath = cog.getSlabPath(
    P.slab.x,
    P.slab.y,
    P.slab.z,
    overviews,
  );
  P.urlGraph = path.join(dirCache, 'graph', P.cogPath.dirPath,
    `${idBranch}_${P.cogPath.filename}.tif`);
  P.urlOrtho = path.join(dirCache, 'ortho', P.cogPath.dirPath,
    `${idBranch}_${P.cogPath.filename}.tif`);
  P.urlOpi = path.join(dirCache, 'opi', P.cogPath.dirPath,
    `${P.cogPath.filename}_${geoJson.features[0].properties.cliche}.tif`);
  P.urlGraphOrig = path.join(dirCache, 'graph', P.cogPath.dirPath,
    `${P.cogPath.filename}.tif`);
  P.urlOrthoOrig = path.join(dirCache, 'ortho', P.cogPath.dirPath,
    `${P.cogPath.filename}.tif`);
  P.withOrig = false;
  const checkGraph = fs.promises.access(P.urlGraph, fs.constants.F_OK).catch(
    () => {
      fs.promises.access(P.urlGraphOrig, fs.constants.F_OK);
      P.withOrig = true;
    },
  );
  const checkOrtho = fs.promises.access(P.urlOrtho, fs.constants.F_OK).catch(
    () => {
      fs.promises.access(P.urlOrthoOrig, fs.constants.F_OK);
      P.withOrig = true;
    },
  );
  const checkOpi = fs.promises.access(P.urlOpi, fs.constants.F_OK);
  return Promise.all([checkGraph, checkOrtho, checkOpi]).then(() => P);
}

async function postPatch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  debug('~~~POST patch');

  const { overviews } = req;
  const params = matchedData(req);
  const geoJson = params.geoJSON;
  const { idBranch } = params;

  let newPatchId = 0;
  const activePatches = await db.getActivePatches(req.client, idBranch);

  for (let i = 0; i < activePatches.features.length; i += 1) {
    const id = activePatches.features[i].properties.num;
    if (newPatchId < id) newPatchId = id;
  }

  newPatchId += 1;

  const cogs = getCOGs(geoJson.features, overviews);
  debug('cogs =', cogs);
  const promisesCreatePatch = [];
  debug('~create patch');
  cogs.forEach((aCog) => {
    promisesCreatePatch.push(createPatch(aCog, geoJson, overviews, req.dir_cache, idBranch));
  });
  debug('~Promise.all');
  Promise.all(promisesCreatePatch).then((patches) => {
    const promises = [];
    const slabsModified = [];

    debug('~process patch');

    patches.forEach((P) => {
      if (P === null) {
        return;
      }
      /* eslint-disable no-param-reassign */
      P.urlGraphOutput = path.join(req.dir_cache,
        'graph',
        P.cogPath.dirPath,
        `${idBranch}_${P.cogPath.filename}_${newPatchId}.tif`);
      P.urlOrthoOutput = path.join(req.dir_cache,
        'ortho', P.cogPath.dirPath,
        `${idBranch}_${P.cogPath.filename}_${newPatchId}.tif`);
      /* eslint-enable no-param-reassign */
      slabsModified.push(P.slab);

      promises.push(gdalProcessing.processPatch(P, overviews.tileSize.width).catch((err) => {
        debug(err);
        throw err;
      }));
    });
    debug('', promises.length, 'patchs à appliquer.');
    Promise.all(promises).then(
      async () => {
      // Tout c'est bien passé
        debug("=> tout c'est bien passé on peut renommer les images");
        patches.forEach((P) => {
          if (P === null) {
            return;
          }
          const urlHistory = path.join(req.dir_cache,
            'opi',
            P.cogPath.dirPath,
            `${idBranch}_${P.cogPath.filename}_history.packo`);
          if (fs.existsSync(urlHistory)) {
            debug('history existe');
            const history = `${fs.readFileSync(`${urlHistory}`)};${newPatchId}`;
            const tabHistory = history.split(';');
            const prevId = tabHistory[tabHistory.length - 2];

            const urlGraphPrev = path.join(req.dir_cache, 'graph', P.cogPath.dirPath,
              `${idBranch}_${P.cogPath.filename}_${prevId}.tif`);
            const urlOrthoPrev = path.join(req.dir_cache, 'ortho', P.cogPath.dirPath,
              `${idBranch}_${P.cogPath.filename}_${prevId}.tif`);

            debug(P.urlGraph);
            debug(' historique :', history);
            fs.writeFileSync(`${urlHistory}`, history);
            // on ne fait un rename que si prevId n'est pas 'orig'
            if (prevId !== 'orig') {
              rename(P.urlGraph, urlGraphPrev);
              rename(P.urlOrtho, urlOrthoPrev);
            }
          } else {
            debug('history n existe pas encore');
            const history = `orig;${newPatchId}`;
            fs.writeFileSync(`${urlHistory}`, history);
            // On a pas besoin de renommer l'image d'origine
            // qui reste partagée pour toutes les branches
          }
          rename(P.urlGraphOutput, P.urlGraph);
          rename(P.urlOrthoOutput, P.urlOrtho);
        });
        // on note le patch Id
        geoJson.features.forEach((feature) => {
          /* eslint-disable no-param-reassign */
          feature.properties.patchId = newPatchId;
          feature.properties.slabs = slabsModified;
          /* eslint-enable no-param-reassign */
        });
        // on ajoute ce patch à l'historique
        debug('=> Patch', newPatchId, 'ajouté');
        // debug(geoJson.features);
        // activePatches.features = activePatches.features.concat(
        //  geoJson.features,
        // );

        const opiId = await db.getOpiId(req.client, geoJson.features[0].properties.cliche);
        const patchId = await db.insertPatch(req.client, idBranch, geoJson.features[0], opiId);

        // ajouter les slabs correspondant au patch dans la table correspondante
        const result = await db.insertSlabs(req.client, patchId, geoJson.features[0]);

        debug(result.rowCount);

        // debug('features in activePatches:', activePatches.features.length);

        // on purge les patchs inactifs puisqu'on ne pourra plus les appliquer
        // req.selectedBranch.unactivePatches.features = [];
        // debug('features in unactivePatches:',req.selectedBranch.unactivePatches.features.length);
        // on sauve l'historique (au cas ou l'API devrait etre relancee)
        // fs.writeFileSync(path.join(global.dir_cache, 'branches.json'),
        // JSON.stringify(req.app.branches, null, 4));
        // req.result = { json: slabsModified, code: 200 };

        req.result = { json: slabsModified, code: 200 };
        next();
      },
    ).catch((err) => {
      debug(err);
      req.error = {
        msg: err.toString(),
        code: 400,
        function: 'patch',
      };
      next();
    });
  }).catch((error) => {
    debug('on a reçu une erreur : ', error);
    req.error = {
      msg: error.toString(),
      code: 404,
      function: 'patch',
    };
    next();
  });
}

function undo(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  debug('~~~PUT patch/undo');
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req;
  if (req.selectedBranch.activePatches.features.length === 0) {
    debug('rien à annuler');
    req.result = { json: 'nothing to undo', code: 201 };
    next();
    return;
  }

  // trouver le patch a annuler: c'est-à-dire sortir les éléments
  // de req.app.activePatches.features avec patchId == lastPatchId
  const lastPatchId = req.selectedBranch.activePatches.features[
    req.selectedBranch.activePatches.features.length - 1]
    .properties.patchId;
  debug(`Patch '${lastPatchId}' à annuler.`);
  const features = [];
  let index = req.selectedBranch.activePatches.features.length - 1;
  const slabs = {};
  while (index >= 0) {
    const feature = req.selectedBranch.activePatches.features[index];
    if (feature.properties.patchId === lastPatchId) {
      features.push(feature);
      req.selectedBranch.activePatches.features.splice(index, 1);
      feature.properties.slabs.forEach((item) => {
        slabs[`${item.x}_${item.y}_${item.z}`] = item;
      });
    }
    index -= 1;
  }
  debug(Object.keys(slabs).length, 'dalles impactées');
  // pour chaque tuile, trouver le numéro de version le plus élevé inférieur au numéro de patch
  const errors = [];
  const histories = [];
  Object.values(slabs).forEach((slab, indexSlab) => {
    debug('slab :', slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

    // on récupère l'historique de cette tuile
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const history = fs.readFileSync(`${urlHistory}`).toString().split(';');
    // on vérifie que le lastPatchId est bien le dernier sur cette tuile
    if (`${history[history.length - 1]}` !== `${lastPatchId}`) {
      debug("erreur d'historique");
      errors.push(`erreur d'historique sur la tuile ${cogPath}`);
      debug('erreur : ', history, lastPatchId);
      // res.status(404).send(`erreur d'historique sur la tuile ${cogPath}`);
    } else {
      histories[indexSlab] = history;
    }
  });
  if (errors.length > 0) {
    req.error = {
      msg: errors,
      code: 404,
      function: 'undo',
    };
    next();
    return;
  }
  Object.values(slabs).forEach((slab, indexSlab) => {
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    // on récupère la version à restaurer
    const history = histories[indexSlab];
    const patchIdPrev = history[history.length - 1];
    const idSelected = history[history.length - 2];
    // mise à jour de l'historique
    let newHistory = '';
    for (let i = 0; i < (history.length - 1); i += 1) {
      newHistory += history[i];
      if (i < (history.length - 2)) newHistory += ';';
    }
    debug('newHistory : ', newHistory);
    fs.writeFileSync(`${urlHistory}`, newHistory);
    debug(` dalle ${slab.z}/${slab.y}/${slab.x} : version ${idSelected} selectionnée`);
    // debug(' version selectionnée pour la tuile :', idSelected);
    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    // renommer les images pour pointer sur ce numéro de version
    const urlGraph = path.join(graphDir, `${idBranch}_${cogPath.filename}.tif`);
    const urlOrtho = path.join(orthoDir, `${idBranch}_${cogPath.filename}.tif`);
    const urlGraphSelected = path.join(graphDir, `${idBranch}_${cogPath.filename}_${idSelected}.tif`);
    const urlOrthoSelected = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${idSelected}.tif`);

    // on renomme les anciennes images
    const urlGraphPrev = path.join(graphDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    const urlOrthoPrev = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    rename(urlGraph, urlGraphPrev);
    rename(urlOrtho, urlOrthoPrev);

    // on renomme les nouvelles images sauf si c'est la version orig
    if (idSelected !== 'orig') {
      rename(urlGraphSelected, urlGraph);
      rename(urlOrthoSelected, urlOrtho);
    }
  });

  req.selectedBranch.unactivePatches.features = req.selectedBranch.unactivePatches.features.concat(
    features,
  );
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug('fin du undo');
  debug('features in activePatches:', req.selectedBranch.activePatches.features.length);
  debug('features in unactivePatches:', req.selectedBranch.unactivePatches.features.length);
  req.result = { json: `undo: patch ${lastPatchId} canceled`, code: 200 };
  next();
}

function redo(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  debug('~~~PUT patch/redo');
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;

  if (req.selectedBranch.unactivePatches.features.length === 0) {
    debug('nothing to redo');
    req.result = { json: 'nothing to redo', code: 201 };
    next();
    return;
  }
  // trouver le patch a refaire: c'est-à-dire sortir les éléments
  // de req.app.unactivePatches.features avec patchId == patchIdRedo
  const patchIdRedo = req.selectedBranch.unactivePatches.features[
    req.selectedBranch.unactivePatches.features.length - 1]
    .properties.patchId;
  debug('patchIdRedo:', patchIdRedo);
  const features = [];
  const slabs = {};
  let index = req.selectedBranch.unactivePatches.features.length - 1;
  while (index >= 0) {
    const feature = req.selectedBranch.unactivePatches.features[index];
    if (feature.properties.patchId === patchIdRedo) {
      features.push(feature);
      feature.properties.slabs.forEach((item) => {
        slabs[`${item.x}_${item.y}_${item.z}`] = item;
      });
      req.selectedBranch.unactivePatches.features.splice(index, 1);
    }
    index -= 1;
  }
  debug(Object.keys(slabs).length, ' dalles impactées');
  // pour chaque tuile, renommer les images
  Object.values(slabs).forEach((slab) => {
    debug(slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    debug(cogPath);
    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

    // on met a jour l'historique
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const history = `${fs.readFileSync(`${urlHistory}`)};${patchIdRedo}`;
    const tabHistory = history.split(';');
    const patchIdPrev = tabHistory[tabHistory.length - 2];
    fs.writeFileSync(`${urlHistory}`, history);
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(graphDir, `${idBranch}_${cogPath.filename}_${patchIdRedo}.tif`);
    const urlOrthoSelected = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${patchIdRedo}.tif`);
    // renommer les images pour pointer sur ce numéro de version
    const urlGraph = path.join(graphDir, `${idBranch}_${cogPath.filename}.tif`);
    const urlOrtho = path.join(orthoDir, `${idBranch}_${cogPath.filename}.tif`);
    // on renomme les anciennes images
    const urlGraphPrev = path.join(graphDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    const urlOrthoPrev = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${patchIdPrev}.tif`);
    if (patchIdPrev !== 'orig') {
      rename(urlGraph, urlGraphPrev);
      rename(urlOrtho, urlOrthoPrev);
    }

    // on renomme les nouvelles images
    rename(urlGraphSelected, urlGraph);
    rename(urlOrthoSelected, urlOrtho);
  });
  // on remet les features dans req.app.activePatches.features
  req.selectedBranch.activePatches.features = req.selectedBranch.activePatches.features.concat(
    features,
  );
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug('features in activePatches:', req.selectedBranch.activePatches.features.length);
  debug('features in unactivePatches:', req.selectedBranch.unactivePatches.features.length);
  debug('fin du redo');
  req.result = { json: `redo: patch ${patchIdRedo} reapplied`, code: 200 };
  next();
}

function clear(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  debug('~~~PUT patches/clear');
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    req.result = { json: 'unauthorized', code: 401 };
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;
  gdalProcessing.clearCache();
  // pour chaque patch de req.app.activePatches.features
  if (req.selectedBranch.activePatches.features.length === 0) {
    debug(' nothing to clear');
    req.result = { json: 'nothing to clear', code: 201 };
    next();
    return;
  }
  const { features } = req.selectedBranch.activePatches;

  const slabsDico = {};
  features.forEach((feature) => {
    feature.properties.slabs.forEach((item) => {
      slabsDico[`${item.x}_${item.y}_${item.z}`] = item;
    });
  });
  debug('', Object.keys(slabsDico).length, ' dalles impactées');
  Object.values(slabsDico).forEach((slab) => {
    debug('clear sur : ', slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);

    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

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

  req.selectedBranch.activePatches.features = [];
  req.selectedBranch.unactivePatches.features = [];
  fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(req.app.branches, null, 4));

  debug(' features in activePatches:', req.selectedBranch.activePatches.features.length);
  debug(' features in unactivePatches:', req.selectedBranch.unactivePatches.features.length);
  debug('fin du clear');
  req.result = { json: 'clear: all patches deleted', code: 200 };
  next();
}

module.exports = {
  getPatches,
  postPatch,
  undo,
  redo,
  clear,
  encapBody,
};
