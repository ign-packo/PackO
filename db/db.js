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

async function isBranchValid(pgClient, idBranch, idCache) {
    debug('~isBranchValid');
    try {
        const results = await pgClient.query(
          'SELECT id INTO branches WHERE id_cache=$1 AND id = $2',
          [idCache, idBranch],
        );
        return (results.rowCount === 1);
      } catch (error) {
        debug('Error : ', error);
        throw error;
      }
}

async function getBranches(pgClient, idCache) {
    debug('~getBranches');
    try {
        const results = await pgClient.query(
          'SELECT name, id FROM branches WHERE id_cache=$1',
          [idCache],
        );
        return results.rows;
      } catch (error) {
        debug('Error : ', error);
        throw error;
      }
}

async function getIdCacheFromPath(pgClient, path) {
    debug('~getIdCacheFromPath');
    try {
        const results = await pgClient.query(
          'SELECT id FROM caches WHERE path=$1',
          [path],
        );
        if (results.rowCount !== 1) {
            throw new Error(`cache non trouvé pour le chemin '${path}'`);
        }
        return results.rows[0].id;
      } catch (error) {
        debug('Error : ', error);
        throw error;
      }
}

async function insertBranch(pgClient, name, idCache) {
    try {
        debug("ajout d'une branche : ", name);
        const results = await pgClient.query(
          'INSERT INTO branches (name, id_cache) values ($1, $2) RETURNING id',
          [name, idCache],
        );
        return results.rows[0].id;
      } catch (error) {
        debug('Error : ', error);
        throw error;
      }
}

async function deleteBranch(pgClient, idBranch, idCache) {
    try {
        debug("suppression d'une branche : ", idBranch);
        const results = await pgClient.query(
          "DELETE FROM branches WHERE id_cache=$1 AND id=$2 AND name<>'orig' RETURNING name",
          [idCache, idBranch],
        );
        debug(results);
        if (results.rowCount !== 1) {
            throw new Error(`branche non trouvée '${idBranch}'`);
        }
        return results.rows[0].name;
      } catch (error) {
        debug('Error : ', error);
        throw error;
      }
}


module.exports = {
    insertCache,
    insertListOpi,
    isBranchValid,
    getBranches,
    getIdCacheFromPath,
    insertBranch,
    deleteBranch,
};
