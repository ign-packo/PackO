const debug = require('debug')('db');
const format = require('pg-format');

async function beginTransaction(pgClient) {
  debug('BEGIN');
  await pgClient.query('BEGIN');
}

async function endTransaction(pgClient, succeed) {
  if (succeed) {
    debug('COMMIT');
    await pgClient.query('COMMIT');
  } else {
    debug('ROLLBACK');
    await pgClient.query('ROLLBACK');
  }
}

async function getCaches(pgClient) {
  debug('    ~~getCaches');
  const results = await pgClient.query(
    'SELECT id, name, path FROM caches ORDER BY id ASC',
  );
  return results.rows;
}

async function insertCache(pgClient, name, path) {
  debug(`    ~~insertCache (name: ${name}, path: ${path})`);
  const results = await pgClient.query(
    'INSERT INTO caches (name, path) values ($1, $2) RETURNING id, name, path',
    [name, path],
  );
  if (results.rowCount === 1) return results.rows[0];
  throw new Error('failed to insert');
}

async function deleteCache(pgClient, idCache) {
  debug(`    ~~deleteCache (idCache: ${idCache})`);
  const results = await pgClient.query(
    'DELETE FROM caches WHERE id=$1 RETURNING name',
    [idCache],
  );
  if (results.rowCount === 1) return results.rows[0].name;
  throw new Error('failed to delete');
}

async function insertListOpi(pgClient, idCache, listOpi) {
  debug(`    ~~insertListOpi (listOpi: ${listOpi})`);

  const values = [];
  Object.entries(listOpi).forEach((entry) => {
    const [name, color] = entry;
    values.push([idCache, name, `{${color[0]}, ${color[1]}, ${color[2]}}`]);
  });
  const sqlRequest = format('INSERT INTO opi (id_cache, name, color) VALUES %L', values);
  const results = await pgClient.query(sqlRequest);
  return results.rowCount;
}

async function getCache(pgClient, idBranch) {
  debug(`~~getCache (idBranch: ${idBranch})`);
  const results = await pgClient.query(
    'SELECT c.id, c.path FROM branches b, caches c WHERE b.id_cache = c.id AND b.id = $1',
    [idBranch],
  );
  if (results.rowCount === 1) return results.rows[0];
  throw new Error('idBranch non valide');
}

async function getCachePath(pgClient, idBranch) {
  debug(`    ~~getCachePath (idBranch: ${idBranch})`);
  const results = await pgClient.query(
    'SELECT c.path FROM branches b, caches c WHERE b.id_cache = c.id AND b.id = $1',
    [idBranch],
  );
  if (results.rowCount === 1) return results.rows[0].path;
  throw new Error('idBranch non valide');
}

async function getBranches(pgClient, idCache) {
  debug(`    ~~getBranches (idCache: ${idCache})`);
  let results;
  if (idCache) {
    results = await pgClient.query(
      'SELECT name, id FROM branches WHERE id_cache=$1 ORDER BY id ASC',
      [idCache],
    );
  } else {
    results = await pgClient.query(
      'SELECT name, id FROM branches',
    );
  }
  return results.rows;
}

async function insertBranch(pgClient, name, idCache) {
  debug(`    ~~insertBranch (name: ${name})`);
  const results = await pgClient.query(
    'INSERT INTO branches (name, id_cache) values ($1, $2) RETURNING id',
    [name, idCache],
  );
  if (results.rowCount === 1) return results.rows[0].id;
  throw new Error('failed to insert branch');
}

async function deleteBranch(pgClient, idBranch) {
  debug(`    ~~deleteBranch (idBranch: ${idBranch})`);
  const results = await pgClient.query(
    "DELETE FROM branches WHERE id=$1 AND name<>'orig' RETURNING name",
    [idBranch],
  );
  return results.rows.length > 0 ? results.rows[0].name : null;
}

async function getActivePatches(pgClient, idBranch) {
  debug(`    ~~getActivePatches (idBranch: ${idBranch})`);

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
}

async function getUnactivePatches(pgClient, idBranch) {
  debug(`    ~~getUnactivePatches (idBranch: ${idBranch})`);

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
}

async function getOPIFromColor(pgClient, idBranch, color) {
  debug(`    ~~getOPIFromColor (idBranch: ${idBranch})`);
  const results = await pgClient.query(
    'SELECT o.name, o.date, o.color, o.id FROM opi o, branches b WHERE b.id_cache = o.id_cache AND b.id = $1 AND o.color=$2',
    [idBranch, color],
  );
  debug(results.rows);
  if (results.rowCount !== 1) {
    throw new Error(`on a trouvé ${results.rowCount} opi pour la couleur '${color}'`);
  }
  return results.rows[0];
}

async function getOPIFromName(pgClient, idBranch, name) {
  debug(`    ~~getOpiId (name: ${name})`);
  const results = await pgClient.query(
    'SELECT o.name, o.date, o.color, o.id FROM opi o, branches b WHERE b.id_cache = o.id_cache AND b.id = $1 AND o.name=$2',
    [idBranch, name],
  );
  debug(results.rows);
  if (results.rowCount !== 1) {
    throw new Error(`on a trouvé ${results.rowCount} opi pour le nom '${name}'`);
  }
  return results.rows[0];
}

async function insertPatch(pgClient, idBranch, geometry, opiId) {
  debug(`    ~~insertPatch (idBranch: ${idBranch})`);

  const sql = format('INSERT INTO patches (geom, id_branch, id_opi) values (ST_GeomFromGeoJSON(%L), %s, %s) RETURNING id as id_patch, num',
    JSON.stringify(geometry),
    idBranch,
    opiId);
  debug(sql);

  const results = await pgClient.query(sql);
  if (results.rowCount !== 1) {
    throw new Error('failed to insert patch');
  }
  return results.rows[0];
}

async function deactivatePatch(pgClient, idPatch) {
  debug(`    ~~deactivatePatch (idPatch: ${idPatch})`);

  const sql = format('UPDATE patches SET active=False WHERE id=%s', idPatch);
  debug(sql);

  const results = await pgClient.query(
    sql,
  );

  return results;
}

async function reactivatePatch(pgClient, idPatch) {
  debug(`    ~~reactivatePatch (idPatch: ${idPatch})`);

  const sql = format('UPDATE patches SET active=True WHERE id=%s', idPatch);
  debug(sql);

  const results = await pgClient.query(
    sql,
  );

  return results;
}

async function deletePatches(pgClient, idBranch) {
  debug(`    ~~deletePatches (idBranch: ${idBranch})`);

  const sql = format('DELETE FROM patches WHERE id_branch=%s', idBranch);
  debug(sql);

  const results = await pgClient.query(
    sql,
  );

  return results;
}

async function getSlabs(pgClient, idPatch) {
  debug(`    ~~getSlabs (idPatch: ${idPatch})`);

  const sql = format('SELECT id, x, y, z FROM slabs WHERE id_patch=%s', idPatch);
  debug(sql);

  const results = await pgClient.query(
    sql,
  );

  return results.rows;
}

async function insertSlabs(pgClient, idPatch, slabs) {
  debug(`    ~~insertSlabs (idPatch: ${idPatch})`);

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
}

async function getLayers(pgClient, idBranch) {
  debug(`    ~~getLayers (idBranch: ${idBranch})`);
  const sql = format(
    'SELECT layers.id, layers.name, num, crs, style_itowns, opacity, visibility FROM layers, styles WHERE layers.id_style=styles.id %s',
    idBranch !== undefined ? `AND id_Branch=${idBranch}` : '',
  );
  debug('      ', sql);

  const results = await pgClient.query(
    sql,
  );

  return results.rows;
}

async function getLayer(pgClient, idVector) {
  debug(`    ~~getLayer (idVector: ${idVector})`);
  // const sql = format(
  //   "SELECT json_build_object("
  //   + "'type', 'FeatureCollection', 'features', json_agg(ST_AsGeoJSON(t.*)::json)"
  //   + ") as geojson "
  //   + 'FROM'
  //   + '(SELECT f.* FROM features f'
  //   + ' WHERE f.id_layer=%s ORDER BY f.id) as t',
  //   idVector,
  // );
  const sql = format(
    "SELECT json_build_object('type', 'FeatureCollection', 'features', json_agg(ST_AsGeoJSON(t.*)::json)) as geojson "
    + 'FROM'
    + ' (SELECT f.*, COALESCE(fc.status, false) as status, fc.comment FROM features f'
    + ' LEFT JOIN feature_ctrs fc ON f.id=fc.id_feature'
    + ' WHERE f.id_layer=%s ORDER BY f.id) as t',
    idVector,
  );
  debug('      ', sql);

  const results = await pgClient.query(sql);

  // // cas ou il n'y a pas de patches actifs en base
  // if (results.rows[0].json_build_object.features === null) {
  //   results.rows[0].json_build_object.features = [];
  // }
  if (results.rowCount !== 1) {
    throw new Error(`layer ${idVector} non trouvé`);
  }
  return results.rows[0].geojson;
}

async function insertLayer(pgClient, idBranch, geojson, metadonnees) {
  debug(`    ~~insertLayer (idBranch: ${idBranch})`);
  // metadonnees.opacity = 1;
  // metadonnees.visibility = true;
  let results;
  /// ////////////////////
  // TODO gestion des STYLES

  const sqlInsertStyle = format('INSERT INTO styles (name, opacity, visibility, style_itowns) '
                              + 'VALUES (%L, %s, %L, %L) '
                              + 'returning id as id_style',
  `${metadonnees.name}_${idBranch}`,
  1,
  true,
  metadonnees.style);

  debug('      ', sqlInsertStyle);
  results = await pgClient.query(sqlInsertStyle);

  // end STYLE
  /// /////////////////

  const sqlInsertLayer = format('INSERT INTO layers (name, crs, id_branch, id_style) '
    + 'VALUES (%L, %L, %s, %s) '
    + 'RETURNING id as id_layer',
  metadonnees.name,
  metadonnees.crs,
  idBranch,
  results.rows[0].id_style);

  debug('      ', sqlInsertLayer);
  results = await pgClient.query(sqlInsertLayer);

  const idNewLayer = results.rows[0].id_layer;

  const values = [];
  geojson.features.forEach((feature) => {
    values.push(`ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(feature.geometry)}'), ${metadonnees.crs.split(':')[1]}), '${JSON.stringify(feature.properties)}', '${idNewLayer}'`);
  });

  const sqlInsertFeatures = format('INSERT INTO features (geom, properties, id_layer) '
  + 'VALUES (%s) '
  + 'RETURNING id as id_feature',
  values.join('),('));

  debug('      ', sqlInsertFeatures);
  results = await pgClient.query(sqlInsertFeatures);

  return {
    id: idNewLayer,
    features: results.rows,
  };
}

async function deleteLayer(pgClient, idVector) {
  debug(`~~deleteLayer (idVector: ${idVector})`);
  const sqlDelLayer = format(
    'DELETE FROM layers USING branches '
  + 'WHERE layers.id_branch=branches.id AND layers.id=%s '
  + 'RETURNING layers.name, id_branch, branches.name as branch_name',
    idVector,
  );
  debug(sqlDelLayer);
  const results = await pgClient.query(sqlDelLayer);

  /// ////////////////////
  // TODO gestion des STYLES

  const sqlDelStyle = format('DELETE FROM styles WHERE name=%L RETURNING name',
    `${results.rows[0].name}_${results.rows[0].id_branch}`);
  debug(sqlDelStyle);
  await pgClient.query(sqlDelStyle);

  // end STYLE
  /// /////////////////

  if (results.rowCount !== 1) {
    throw new Error(`failed to delete layer ${idVector}`);
  }
  return results.rows[0];
}

async function getProcesses(pgClient) {
  debug('~~getProcesses');

  const sql = format('SELECT * FROM processes');
  debug(sql);

  const results = await pgClient.query(
    sql,
  );
  return results.rows;
}

async function createProcess(pgClient, description) {
  debug('~~createProcess');

  const sql = format('INSERT INTO processes (start_date, description) VALUES (NOW(), %L) RETURNING id', description);
  debug(sql);
  const results = await pgClient.query(
    sql,
  );
  if (results.rowCount !== 1) {
    throw new Error('failed to create process');
  }
  return results.rows[0].id;
}

async function finishProcess(pgClient, status, idProcess, result) {
  debug('~~finishProcess');

  const sql = format('UPDATE processes SET end_date=NOW(), status=%L, result=%L WHERE id=%L', status, result, idProcess);
  debug(sql);

  await pgClient.query(
    sql,
  );
}

async function updateAlert(pgClient, idFeature, status, comment) {
  debug(`~~updateAlert (idFeature: ${idFeature})`);
  let column;
  let value;
  if (status !== undefined) {
    column = 'status';
    value = status;
  } else {
    column = 'comment';
    value = `'${comment}'`;
  }
  const sqlInsertFeatureCtr = format(
    `INSERT INTO feature_ctrs (${column}, id_feature) `
    + 'VALUES (%s, %s) '
    + 'ON CONFLICT (id_feature) DO '
    + 'UPDATE '
    + `SET ${column}=%s `
    + 'RETURNING id as feature_ctrs_id',
    value,
    idFeature,
    value,
  );
  debug(sqlInsertFeatureCtr);
  const results = await pgClient.query(sqlInsertFeatureCtr);

  return results.rows[0];
}

module.exports = {
  beginTransaction,
  endTransaction,
  getCaches,
  getCache,
  insertCache,
  deleteCache,
  insertListOpi,
  getCachePath,
  getBranches,
  // getIdCacheFromPath,
  insertBranch,
  deleteBranch,
  getActivePatches,
  getUnactivePatches,
  getOPIFromColor,
  getOPIFromName,
  insertPatch,
  deactivatePatch,
  reactivatePatch,
  deletePatches,
  getSlabs,
  insertSlabs,
  getLayers,
  getLayer,
  insertLayer,
  deleteLayer,
  getProcesses,
  createProcess,
  finishProcess,
  updateAlert,
};
