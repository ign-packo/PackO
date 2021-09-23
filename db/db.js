const debug = require('debug')('db');
const format = require('pg-format');

async function getCaches(pgClient) {
  debug('~getCaches');
  try {
    const results = await pgClient.query(
      'SELECT id, name, path FROM caches',
    );
    return results.rows;
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function insertCache(pgClient, name, path) {
  try {
    debug('ajout du cache : ', name, path);
    const results = await pgClient.query(
      'INSERT INTO caches (name, path) values ($1, $2) RETURNING id, name, path',
      [name, path],
    );
    return results.rows[0];
  } catch (error) {
    debug('Error : ', error);
    throw error.detail;
  }
}

async function deleteCache(pgClient, idCache) {
  try {
    debug("suppression d'un cache : ", idCache);
    const results = await pgClient.query(
      'DELETE FROM caches WHERE id=$1 RETURNING name',
      [idCache],
    );
    if (results.rowCount !== 1) {
      throw new Error(`cache non trouvée '${idCache}'`);
    }
    return results.rows[0].name;
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

async function getCachePath(pgClient, idBranch) {
  debug('~getCachePathValid');
  try {
    const results = await pgClient.query(
      'SELECT c.path FROM branches b, caches c WHERE b.id_cache = c.id AND b.id = $1',
      [idBranch],
    );
    if (results.rowCount === 1) return results.rows[0].path;
    throw new Error('idBranch non valide');
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function getBranches(pgClient, idCache) {
  debug('~getBranches');
  try {
    let results;
    if (idCache) {
      results = await pgClient.query(
        'SELECT name, id FROM branches WHERE id_cache=$1',
        [idCache],
      );
    } else {
      results = await pgClient.query(
        'SELECT name, id FROM branches',
      );
    }
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

async function deleteBranch(pgClient, idBranch) {
  try {
    debug("suppression d'une branche : ", idBranch);
    const results = await pgClient.query(
      "DELETE FROM branches WHERE id=$1 AND name<>'orig' RETURNING name",
      [idBranch],
    );
    if (results.rowCount !== 1) {
      throw new Error(`branche '${idBranch}' non supprimée`);
    }
    return results.rows[0].name;
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function getActivePatches(pgClient, idBranch) {
  try {
    debug('Recuperation des patchs actifs de la branche : ', idBranch);

    const sql = "SELECT json_build_object('type', 'FeatureCollection', "
    + "'features', json_agg(ST_AsGeoJSON(t.*)::json)) FROM "
    + '(SELECT p.*, ARRAY_AGG(s.x) as x, ARRAY_AGG(s.y) as y, ARRAY_AGG(s.z) as z '
    + 'FROM patches p LEFT JOIN slabs s ON p.id = s.id_patch WHERE p.id_branch = $1 '
    + 'GROUP BY p.id ORDER BY p.num) as t';

    debug(sql);

    const results = await pgClient.query(
      sql, [idBranch],
    );

    debug(results.rows[0].json_build_object);
    return results.rows[0].json_build_object;
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function getOPIFromColor(pgClient, idBranch, color) {
  try {
    debug('Recuperation d une OPI de la branche : ', idBranch);
    const results = await pgClient.query(
      'SELECT o.name, o.date, o.color FROM opi o, branches b WHERE b.id_cache = o.id_cache AND b.id = $1 AND o.color=$2',
      [idBranch, color],
    );
    debug(results.rows);
    if (results.rowCount !== 1) {
      throw new Error(`opi non trouvée '${color}'`);
    }
    return results.rows[0];
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function getOpiId(pgClient, name) {
  try {
    debug('Recuperation de l\'id de l\'OPI : ', name);

    const sql = `SELECT id FROM opi WHERE name = '${name}'`;

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results.rows[0].id;
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function insertPatch(pgClient, idBranch, patch, opiId) {
  try {
    debug('Ajout d\'un patch dans la branche : ', idBranch);

    const values = [];
    values.push(patch.properties.patchId, JSON.stringify(patch.geometry), idBranch, 'True', opiId);

    const sql = format("INSERT INTO patches (num, geom, id_branch, active, id_opi) values (%s, ST_GeomFromGeoJSON('%s'), %s, %s, %s) RETURNING id as id_patch", values[0], values[1], values[2], values[3], values[4]);

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results.rows[0].id_patch;
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

async function insertSlabs(pgClient, id_patch, patch) {
  try {
    debug('Ajout des slabs correspondant au patch : ', id_patch);

    // onsole.log(patch)

    console.log(patch.properties.slabs[0]);

    patch.properties.slabs.push(patch.properties.slabs[0]);

    const values = [];
    patch.properties.slabs.forEach((slab) => {
      values.push([id_patch, slab.x, slab.y, slab.z]);
    });

    console.log(values);

    const sql = format('INSERT INTO slabs (id_patch, x, y , z) values (%s)', values.join('),('));

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results.rows;
  } catch (error) {
    debug('Error : ', error);
    throw error;
  }
}

module.exports = {
  getCaches,
  insertCache,
  deleteCache,
  insertListOpi,
  getCachePath,
  getBranches,
  getIdCacheFromPath,
  insertBranch,
  deleteBranch,
  getActivePatches,
  getOPIFromColor,
  getOpiId,
  insertPatch,
  insertSlabs,
};
