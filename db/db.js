const debug = require('debug')('db');
const format = require('pg-format');

async function insertCache(pgClient, name, path) {
  try {
    debug('ajout du cache : ', name, path);
    const results = await pgClient.query(
      'INSERT INTO caches (name, path) values ($1, $2) RETURNING id, name',
      [name, path],
    );
    return results.rows[0];
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function insertListOpi(pgClient, idCache, listOpi) {
  try {
    debug("ajout d'une liste d'OPI cache : ", listOpi);

    const values = [];
    Object.entries(listOpi).forEach((entry) => {
      const [name, color] = entry;
      values.push([idCache, name, `{${color[0]}, ${color[1]}, ${color[2]}}`]);
    });
    const sqlRequest = format('INSERT INTO opi (id_cache, name, color) VALUES %L', values);
    const results = await pgClient.query(sqlRequest);
    return results.rowCount;
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

exports.insertCache = insertCache;
exports.insertListOpi = insertListOpi;
