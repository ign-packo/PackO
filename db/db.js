const debug = require('debug')('db');
const format = require('pg-format');

async function getCaches(pgClient) {
  debug('~~getCaches');
  try {
    const results = await pgClient.query(
      'SELECT id, name, path FROM caches',
    );
    return results.rows;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function insertCache(pgClient, name, path) {
  debug(`~~insertCache (name: ${name}, path: ${path})`);
  try {
    const results = await pgClient.query(
      'INSERT INTO caches (name, path) values ($1, $2) RETURNING id, name, path',
      [name, path],
    );
    return results.rows[0];
  } catch (error) {
    debug('Error: ', error);
    throw error.detail;
  }
}

async function deleteCache(pgClient, idCache) {
  debug(`~~deleteCache (idCache: ${idCache})`);
  try {
    const results = await pgClient.query(
      'DELETE FROM caches WHERE id=$1 RETURNING name',
      [idCache],
    );
    if (results.rowCount !== 1) {
      throw new Error(`cache non trouvée '${idCache}'`);
    }
    return results.rows[0].name;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function insertListOpi(pgClient, idCache, listOpi) {
  try {
    debug(`~~insertListOpi (listOpi: ${listOpi})`);

    const values = [];
    Object.entries(listOpi).forEach((entry) => {
      const [name, color] = entry;
      values.push([idCache, name, `{${color[0]}, ${color[1]}, ${color[2]}}`]);
    });
    const sqlRequest = format('INSERT INTO opi (id_cache, name, color) VALUES %L', values);
    const results = await pgClient.query(sqlRequest);
    return results.rowCount;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function getCache(pgClient, idBranch) {
  debug(`~~getCache (idBranch: ${idBranch})`);
  try {
    const results = await pgClient.query(
      'SELECT c.id, c.path FROM branches b, caches c WHERE b.id_cache = c.id AND b.id = $1',
      [idBranch],
    );
    if (results.rowCount === 1) return results.rows[0];
    throw new Error('idBranch non valide');
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function getCachePath(pgClient, idBranch) {
  debug(`~~getCachePath (idBranch: ${idBranch})`);
  const c = await getCache(pgClient, idBranch);
  return c.path;
}

async function getBranches(pgClient, idCache) {
  debug('~~getBranches');
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
    debug('Error: ', error);
    throw error;
  }
}

async function getIdCacheFromPath(pgClient, path) {
  try {
    debug(`~~getIdCacheFromPath (path: ${path})`);
    const results = await pgClient.query(
      'SELECT id FROM caches WHERE path=$1',
      [path],
    );
    if (results.rowCount !== 1) {
      throw new Error(`cache non trouvé pour le chemin '${path}'`);
    }
    return results.rows[0].id;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function insertBranch(pgClient, name, idCache) {
  try {
    debug(`~~insertBranch (name: ${name})`);
    const results = await pgClient.query(
      'INSERT INTO branches (name, id_cache) values ($1, $2) RETURNING id',
      [name, idCache],
    );
    return results.rows[0].id;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function deleteBranch(pgClient, idBranch) {
  try {
    debug(`~~deleteBranch (idBranch: ${idBranch})`);
    const results = await pgClient.query(
      "DELETE FROM branches WHERE id=$1 AND name<>'orig' RETURNING name",
      [idBranch],
    );
    if (results.rowCount !== 1) {
      throw new Error(`branche '${idBranch}' non supprimée`);
    }
    return results.rows[0].name;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function getActivePatches(pgClient, idBranch) {
  try {
    debug(`~~getActivePatches (idBranch: ${idBranch})`);

    const sql = "SELECT json_build_object('type', 'FeatureCollection', "
    + "'features', json_agg(ST_AsGeoJSON(s.*)::json)) FROM "
    + '(SELECT t.*, o.name as cliche, o.color FROM '
    + '(SELECT p.*, ARRAY_AGG(ARRAY[s.x, s.y, s.z]) as slabs '
    + 'FROM patches p LEFT JOIN slabs s ON p.id = s.id_patch WHERE p.id_branch = $1 '
    + 'AND p.active=True '
    + 'GROUP BY p.id ORDER BY p.num) as t, opi o '
    + 'WHERE t.id_opi = o.id) as s';

    debug(sql);

    const results = await pgClient.query(
      sql, [idBranch],
    );
    // cas ou il n'y a pas de patches actifs en base
    if (results.rows[0].json_build_object.features === null) {
      results.rows[0].json_build_object.features = [];
    }
    return results.rows[0].json_build_object;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function getUnactivePatches(pgClient, idBranch) {
  try {
    debug(`~~getActivePatches (idBranch: ${idBranch})`);

    const sql = "SELECT json_build_object('type', 'FeatureCollection', "
    + "'features', json_agg(ST_AsGeoJSON(s.*)::json)) FROM "
    + '(SELECT t.*, o.name as cliche, o.color FROM '
    + '(SELECT p.*, ARRAY_AGG(ARRAY[s.x, s.y, s.z]) as slabs '
    + 'FROM patches p LEFT JOIN slabs s ON p.id = s.id_patch WHERE p.id_branch = $1 '
    + 'AND p.active=False '
    + 'GROUP BY p.id ORDER BY p.num) as t, opi o '
    + 'WHERE t.id_opi = o.id) as s';

    debug(sql);

    const results = await pgClient.query(
      sql, [idBranch],
    );
    // cas ou il n'y a pas de patches actifs en base
    if (results.rows[0].json_build_object.features === null) {
      results.rows[0].json_build_object.features = [];
    }
    return results.rows[0].json_build_object;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function getOPIFromColor(pgClient, idBranch, color) {
  try {
    debug(`~~getOPIFromColor (idBranch: ${idBranch})`);
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
    debug('Error: ', error);
    throw error;
  }
}

async function getOpiId(pgClient, name) {
  try {
    debug(`~~getOpiId (name: ${name})`);

    const sql = `SELECT id FROM opi WHERE name = '${name}'`;

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results.rows[0].id;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function insertPatch(pgClient, idBranch, patch, opiId) {
  try {
    debug(`~~insertPatch (idBranch: ${idBranch})`);

    const sql = format('INSERT INTO patches (num, geom, id_branch, id_opi) values (%s, ST_GeomFromGeoJSON(\'%s\'), %s, %s) RETURNING id as id_patch',
      patch.properties.num,
      JSON.stringify(patch.geometry),
      idBranch,
      opiId);

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results.rows[0].id_patch;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function deactivatePatch(pgClient, idPatch) {
  try {
    debug(`~~deactivatePatch (idPatch: ${idPatch})`);

    const sql = format('UPDATE patches SET active=False WHERE id=%s', idPatch);

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function reactivatePatch(pgClient, idPatch) {
  try {
    debug(`~~deactivatePatch (idPatch: ${idPatch})`);

    const sql = format('UPDATE patches SET active=True WHERE id=%s', idPatch);

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function deletePatches(pgClient, idBranch) {
  try {
    debug(`~~deactivatePatch (idBranch: ${idBranch})`);

    const sql = format('DELETE FROM patches WHERE id_branch=%s', idBranch);

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function getSlabs(pgClient, idPatch) {
  try {
    debug(`~~getSlabs (idPatch: ${idPatch})`);

    const sql = format('SELECT id, x, y, z FROM slabs WHERE id_patch=%s', idPatch);

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results.rows;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function insertSlabs(pgClient, idPatch, slabs) {
  try {
    debug(`~~insertSlabs (idPatch: ${idPatch})`);

    const values = [];
    slabs.forEach((slab) => {
      values.push([idPatch, slab.x, slab.y, slab.z]);
    });

    const sql = format('INSERT INTO slabs (id_patch, x, y , z) values (%s)', values.join('),('));

    debug(sql);

    const results = await pgClient.query(
      sql,
    );

    return results.rows;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

async function getProcesses(pgClient) {
  try {
    debug('~~getProcesses');

    const sql = format('SELECT * FROM processes');
    debug(sql);

    const results = await pgClient.query(
      sql,
    );
    return results.rows;
  } catch (error) {
    debug('Error: ', error);
    throw error;
  }
}

module.exports = {
  getCaches,
  insertCache,
  deleteCache,
  insertListOpi,
  getCache,
  getCachePath,
  getBranches,
  getIdCacheFromPath,
  insertBranch,
  deleteBranch,
  getActivePatches,
  getUnactivePatches,
  getOPIFromColor,
  getOpiId,
  insertPatch,
  deactivatePatch,
  reactivatePatch,
  deletePatches,
  getSlabs,
  insertSlabs,
  getProcesses,
};
