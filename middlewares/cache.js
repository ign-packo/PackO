const debug = require('debug')('cache');
const fs = require('fs');
const pathMod = require('path');
const { matchedData } = require('express-validator');
const db = require('../db/db');

async function getCaches(req, _res, next) {
  debug('>>GET caches');
  if (req.error) {
    // Cas ou pgOpen c'est mal passé
    next();
    return;
  }
  let caches;
  try {
    caches = await db.getCaches(req.client);
  } catch (error) {
    debug(error);
  }
  if (this.column) {
    req.result = { json: caches.map((cache) => cache[this.column]), code: 200 };
  } else {
    req.result = { json: caches, code: 200 };
  }
  debug('  next>>');
  next();
}

async function getCachePath(req, _res, next) {
  debug('>>GET CachePath');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;

  try {
    req.dir_cache = await db.getCachePath(req.client, idBranch);
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function postCache(req, _res, next) {
  debug('>>POST Cache');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { name, overviews, path } = params;
  const { crs } = overviews;

  const cacheCrs = `${crs.type}:${crs.code}`;

  try {
    const newCache = await db.insertCache(req.client, name, path, cacheCrs);
    const nbOpiInserted = await db.insertListOpi(req.client, newCache.id, overviews.list_OPI);
    if (nbOpiInserted !== Object.keys(overviews.list_OPI).length) {
      // TODO test REGRESS
      throw new Error('error when adding OPI in base');
    }
    req.result = {
      json: {
        id_cache: newCache.id,
        name: newCache.name,
        path: newCache.path,
        nbOpiInserted,
      },
      code: 200,
    };
  } catch (error) {
    debug('Error ', error);
    if (error.constraint === 'caches_name_key') {
      req.error = {
        json: {
          msg: 'A cache with this name already exists.',
          function: 'insertCache',
        },
        code: 406,
      };
    } else {
      req.error = error;
    }
  }
  debug('  next>>');
  next();
}

async function deleteCache(req, _res, next) {
  debug('>>DELETE cache');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idCache } = params;

  try {
    const cacheName = await db.deleteCache(req.client, idCache);
    req.result = { json: `cache '${cacheName}' détruit`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function getOverviews(req, _res, next) {
  debug('>>getOverviews');
  if (req.error) {
    next();
    return;
  }
  const overviewsFileName = pathMod.join(req.dir_cache, 'overviews.json');
  fs.readFile(overviewsFileName, (error, data) => {
    if (error) {
      debug(error);
      req.error = {
        msg: 'overviews does not exist',
        code: 400,
        function: 'getOverviews',
      };
    } else {
      req.overviews = JSON.parse(data);
    }
    debug('  next>>');
    next();
  });
}

module.exports = {
  getCaches,
  getCachePath,
  postCache,
  deleteCache,
  getOverviews,
};
