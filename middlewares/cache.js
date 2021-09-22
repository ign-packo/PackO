const debug = require('debug')('cache');
const { matchedData } = require('express-validator');
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

async function getCaches(req, _res, next) {
  debug('~~~get caches~~~');
  if (req.error) {
    next();
    return;
  }
  let caches;
  try {
    caches = await db.getCaches(req.client, global.id_cache);
  } catch (error) {
    debug(error);
  }
  req.result = { json: caches, code: 200 };
  next();
}

async function insertCache(req, _res, next) {
  debug('~~~insert Cache~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { name, overviews } = params;

  try {
    const newCache = await db.insertCache(req.client, name, global.dir_cache);
    const nbOpiInserted = await db.insertListOpi(req.client, newCache.id, overviews.list_OPI);
    if (nbOpiInserted !== Object.keys(overviews.list_OPI).length) {
      throw new Error("erreur dans l'insertion des OPI");
    }
    req.result = {
      json: {
        id_cache: newCache.id,
        name: newCache.name,
        nbOpiInserted,
      },
      code: 200,
    };
  } catch (error) {
    debug('Error ', error);
    req.error = {
      msg: error,
      code: 406,
      function: 'insertCache',
    };
  }
  next();
}

async function deleteCache(req, _res, next) {
  debug('~~~delete cache~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idCache } = params;

  try {
    const cacheName = await db.deleteCache(req.client, idCache);
    debug(cacheName);
    req.result = { json: `cache '${cacheName}' détruit`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = {
      msg: `Impossible de détruire le cache : '${idCache}'`,
      code: 406,
      function: 'deleteCache',
    };
  }
  next();
}

module.exports = {
  encapBody,
  getCaches,
  insertCache,
  deleteCache,
};
