const debug = require('debug')('patch');
const fs = require('fs');
const PImage = require('pureimage');
const turf = require('@turf/turf');
const path = require('path');
const { matchedData } = require('express-validator');
const cog = require('../cog_path.js');
const gdalProcessing = require('../gdal_processing.js');

// Encapsulation des informations du requestBody dans une nouvelle clé 'keyName' ("body" par defaut)
function encapBody(req, res, next) {
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
  debug('~BBox:', 'Done');

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

async function getSelectedBranchPatches(req, res, next) {
  debug('~~~GET patches');
  const params = matchedData(req);
  const { idBranch } = params;
  try {
    const results = await req.client.query('SELECT patches.*, ARRAY_AGG(slabs.x) as x, ARRAY_AGG(slabs.y) as y, ARRAY_AGG(slabs.z) as z FROM patches, slabs WHERE patches.id_branch = $1 AND slabs.id_patch = patches.id GROUP BY patches.id ORDER BY patches.num', [idBranch]);
    req.selectedBranch.patches = results.rows;
    debug('selectedBranch.patches :', req.selectedBranch.patches);
  } catch (error) {
    debug(error);
    req.error = {
      msg: error.toString(),
      code: 500,
      function: 'getPatches',
    };
  }
  next();
}

function getPatches(req, _res, next) {
  debug('~~~GET patches');
  req.result = { json: req.selectedBranch.patches, code: 200 };
  next();
}

function patch(req, _res, next) {
  debug('~~~POST patch');

  const { overviews } = req.app;
  const params = matchedData(req);
  const geoJson = params.geoJSON;
  const { idBranch } = params;

  let newPatchNum = 0;
  for (let i = 0; i < req.selectedBranch.patches.length; i += 1) {
    const { num } = req.selectedBranch.patches[i];
    if (newPatchNum < num) newPatchNum = num;
  }

  newPatchNum += 1;

  const cogs = getCOGs(geoJson.features, overviews);
  const promisesCreatePatch = [];
  debug('~create patch');
  cogs.forEach((aCog) => {
    promisesCreatePatch.push(createPatch(aCog, geoJson, overviews, global.dir_cache, idBranch));
  });
  Promise.all(promisesCreatePatch).then((patches) => {
    const promises = [];
    const slabsModified = [];

    debug('~process patch');

    patches.forEach((P) => {
      if (P === null) {
        return;
      }
      /* eslint-disable no-param-reassign */
      P.urlGraphOutput = path.join(global.dir_cache,
        'graph',
        P.cogPath.dirPath,
        `${idBranch}_${P.cogPath.filename}_${newPatchNum}.tif`);
      P.urlOrthoOutput = path.join(global.dir_cache,
        'ortho', P.cogPath.dirPath,
        `${idBranch}_${P.cogPath.filename}_${newPatchNum}.tif`);
      /* eslint-enable no-param-reassign */
      slabsModified.push(P.slab);

      promises.push(gdalProcessing.processPatch(P, overviews.tileSize.width).catch((err) => {
        debug(err);
        throw err;
      }));
    });
    debug('', promises.length, 'patchs à appliquer.');
    Promise.all(promises).then(() => {
      // Tout c'est bien passé
      debug("=> tout c'est bien passé on peut renommer les images");
      patches.forEach((P) => {
        if (P === null) {
          return;
        }
        const urlHistory = path.join(global.dir_cache,
          'opi',
          P.cogPath.dirPath,
          `${idBranch}_${P.cogPath.filename}_history.packo`);
        if (fs.existsSync(urlHistory)) {
          debug('history existe');
          const history = `${fs.readFileSync(`${urlHistory}`)};${newPatchNum}`;
          const tabHistory = history.split(';');
          const prevId = tabHistory[tabHistory.length - 2];

          const urlGraphPrev = path.join(global.dir_cache, 'graph', P.cogPath.dirPath,
            `${idBranch}_${P.cogPath.filename}_${prevId}.tif`);
          const urlOrthoPrev = path.join(global.dir_cache, 'ortho', P.cogPath.dirPath,
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
          const history = `orig;${newPatchNum}`;
          fs.writeFileSync(`${urlHistory}`, history);
          // On a pas besoin de renommer l'image d'origine
          // qui reste partagée pour toutes les branches
        }
        rename(P.urlGraphOutput, P.urlGraph);
        rename(P.urlOrthoOutput, P.urlOrtho);
      });
      // on note le patch Num
      geoJson.features.forEach((feature) => {
        /* eslint-disable no-param-reassign */
        feature.properties.num = newPatchNum;
        feature.properties.slabs = slabsModified;
        /* eslint-enable no-param-reassign */
      });
      // on ajoute ce patch à l'historique
      debug('=> Patch', newPatchNum, 'ajouté');

      debug('il faut ajouter : ', geoJson, ' aux patchs');
      debug('slabsModified : ', slabsModified);
      try {
        debug([
          geoJson.features[0].properties.color[0],
          geoJson.features[0].properties.color[1],
          geoJson.features[0].properties.color[2],
          geoJson.features[0].properties.cliche,
          newPatchNum,
          JSON.stringify(geoJson.features[0].geometry),
          idBranch,
        ]);
        // Quand on insert un patch, il est par défaut actif
        // et on supprime automatiquement les patchs inactifs de cette branche
        req.client.query(
          'INSERT INTO patches (red, green, blue, image, num, geom, id_branch) VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6), $7) RETURNING id', [
            geoJson.features[0].properties.color[0],
            geoJson.features[0].properties.color[1],
            geoJson.features[0].properties.color[2],
            geoJson.features[0].properties.cliche,
            newPatchNum,
            JSON.stringify(geoJson.features[0].geometry),
            idBranch,
          ],
        ).then((result) => {
          const idPatch = result.rows[0].id;
          let insertCommannd = 'INSERT INTO slabs (id_patch, x, y, z) VALUES ';
          const vars = [idPatch];
          slabsModified.forEach((slab) => {
            const id = vars.length + 1;
            insertCommannd += `($1, $${id}, $${id + 1}, $${id + 2})`;
            vars.push(slab.x);
            vars.push(slab.y);
            vars.push(slab.z);
          });
          req.client.query(insertCommannd, vars).then(() => {
            req.result = { json: slabsModified, code: 200 };
            next();
          });
        });
      } catch (error) {
        debug(error);
      }
    }).catch((err) => {
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
  debug('~~~PUT patch/undo');
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;

  let lastActivePatch = null;
  for (let i = 0; i < req.selectedBranch.patches.length; i += 1) {
    const P = req.selectedBranch.patches[i];
    if (P.active
      && ((lastActivePatch === null) || (lastActivePatch.num < P.num))) {
      lastActivePatch = P;
    }
  }

  debug('lastActivePatch : ', lastActivePatch);

  if (lastActivePatch === null) {
    debug('rien à annuler');
    req.error = {
      msg: 'nothing to undo',
      code: 201,
      function: 'undo',
    };
    next();
    return;
  }

  const slabs = [];
  lastActivePatch.x.forEach((x, i) => {
    slabs.push({
      i, x, y: lastActivePatch.y[i], z: lastActivePatch.z[i],
    });
  });

  debug(slabs.length, 'dalles impactées');
  debug(slabs);
  // pour chaque tuile, trouver le numéro de version le plus élevé inférieur au numéro de patch
  const errors = [];
  const histories = [];
  slabs.forEach((slab) => {
    debug('slab : ', slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

    // on récupère l'historique de cette tuile
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const history = fs.readFileSync(`${urlHistory}`).toString().split(';');
    // on vérifie que le lastActivePatch.num est bien le dernier sur cette tuile
    if (`${history[history.length - 1]}` !== `${lastActivePatch.num}`) {
      debug("erreur d'historique");
      errors.push(`erreur d'historique sur la tuile ${cogPath}`);
      debug('erreur : ', history, lastActivePatch.num);
      // res.status(404).send(`erreur d'historique sur la tuile ${cogPath}`);
    } else {
      histories[slab.i] = history;
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
  slabs.forEach((slab) => {
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    // on récupère la version à restaurer
    const history = histories[slab.i];
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

  // On passe rend le patch inactif
  req.client.query(
    'UPDATE patches SET active = false WHERE id = $1', [
      lastActivePatch.id,
    ],
  ).then(() => {
    debug('fin du undo');
    req.result = { json: `undo: patch ${lastActivePatch.id} canceled`, code: 200 };
    next();
  });
}

function redo(req, _res, next) {
  debug('~~~PUT patch/redo');
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;

  let firstUnActivePatch = null;
  for (let i = 0; i < req.selectedBranch.patches.length; i += 1) {
    const P = req.selectedBranch.patches[i];
    if ((P.active === false)
      && ((firstUnActivePatch === null) || (firstUnActivePatch.num > P.num))) {
      firstUnActivePatch = P;
    }
  }

  debug('firstUnActivePatch : ', firstUnActivePatch);

  if (firstUnActivePatch === null) {
    debug('nothing to redo');
    req.error = {
      msg: 'nothing to redo',
      code: 201,
      function: 'redo',
    };
    next();
    return;
  }

  const slabs = [];
  firstUnActivePatch.x.forEach((x, i) => {
    slabs.push({
      i, x, y: firstUnActivePatch.y[i], z: firstUnActivePatch.z[i],
    });
  });

  debug(slabs.length, 'dalles impactées');
  debug(slabs);

  // pour chaque tuile, renommer les images
  slabs.forEach((slab) => {
    debug(slab);
    const cogPath = cog.getSlabPath(slab.x, slab.y, slab.z, overviews);
    debug(cogPath);
    const graphDir = path.join(global.dir_cache, 'graph', cogPath.dirPath);
    const orthoDir = path.join(global.dir_cache, 'ortho', cogPath.dirPath);
    const opiDir = path.join(global.dir_cache, 'opi', cogPath.dirPath);

    // on met a jour l'historique
    const urlHistory = path.join(opiDir, `${idBranch}_${cogPath.filename}_history.packo`);
    const history = `${fs.readFileSync(`${urlHistory}`)};${firstUnActivePatch.num}`;
    const tabHistory = history.split(';');
    const patchIdPrev = tabHistory[tabHistory.length - 2];
    fs.writeFileSync(`${urlHistory}`, history);
    // on verifie si la tuile a été effectivement modifiée par ce patch
    const urlGraphSelected = path.join(graphDir, `${idBranch}_${cogPath.filename}_${firstUnActivePatch.num}.tif`);
    const urlOrthoSelected = path.join(orthoDir, `${idBranch}_${cogPath.filename}_${firstUnActivePatch.num}.tif`);
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

  // On passe rend le patch actif
  req.client.query(
    'UPDATE patches SET active = true WHERE id = $1', [
      firstUnActivePatch.id,
    ],
  ).then(() => {
    debug('fin du redo');
    req.result = { json: `redo: patch ${firstUnActivePatch.id} reapplied`, code: 200 };
    next();
  });
}

function clear(req, res, next) {
  debug('~~~PUT patches/clear');
  if (!(process.env.NODE_ENV === 'development' || req.query.test === 'true')) {
    debug('unauthorized');
    res.status(401).send('unauthorized');
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  const { overviews } = req.app;
  gdalProcessing.clearCache();
  // on verifie qu'il y a des patchs (actif ou non)
  if (req.selectedBranch.patches.length === 0) {
    debug(' nothing to clear');
    req.error = {
      msg: 'nothing to clear',
      code: 201,
      function: 'clear',
    };
    next();
    return;
  }

  // Il faut trouver l'ensemble des dalles impactées
  const slabsDico = {};
  req.selectedBranch.patches.forEach((P) => {
    P.x.forEach((x, i) => {
      const slab = { x, y: P.y[i], z: P.z[i] };
      slabsDico[`${slab.x}_${slab.y}_${slab.z}`] = slab;
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

  // On supprime l'historique dans le base
  req.client.query(
    'DELETE FROM patches WHERE id_branch = $1', [
      idBranch,
    ],
  ).then(() => {
    debug('fin du clear');
    req.result = { json: 'clear: all patches deleted', code: 200 };
    next();
  });
}

module.exports = {
  getPatches,
  getSelectedBranchPatches,
  patch,
  undo,
  redo,
  clear,
  encapBody,
};
