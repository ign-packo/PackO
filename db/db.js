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

async function insertCache(pgClient, name, path, crs) {
  debug(`    ~~insertCache (name: ${name}, path: ${path}, crs: ${crs})`);
  const results = await pgClient.query(
    'INSERT INTO caches (name, path, crs) values ($1, $2, $3) RETURNING id, name, path',
    [name, path, crs],
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
  if (typeof idVector !== 'object') {
    debug(`    ~~getLayer (idVector: ${idVector})`);
  } else {
    debug(`    ~~getLayer (idBranch: ${idVector.idBranch}, name: ${idVector.name})`);
  }
  const sql = format(
    "SELECT json_build_object('type', 'FeatureCollection', 'name', name, 'crs', json_build_object('type', substring(crs from '(.+):.'), 'properties', json_build_object('code', substring(crs from '.:(.+)'))), 'features', features) as geojson "
    + 'FROM features_json f, layers l'
    + ' WHERE f.id_layer=l.id'
    + ' AND %s',
    typeof idVector !== 'object' ? `f.id_layer=${idVector}` : `l.id_branch=${idVector.idBranch} AND l.name='${idVector.name}'`,
  );

  debug('      ', sql);

  const results = await pgClient.query(sql);

  if (results.rowCount !== 1) {
    throw new Error(`layer ${idVector} non trouvé`);
  }
  // cas ou il n'y a pas de feature en base
  if (results.rows[0].geojson.features === null) {
    results.rows[0].geojson.features = [];
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
    const properties = JSON.parse(JSON.stringify(feature.properties));
    // delete properties.comment;
    values.push(`ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(feature.geometry)}'), ${metadonnees.crs.split(':')[1]}), '${JSON.stringify(properties)}', '${idNewLayer}'`);
  });

  const sqlInsertFeatures = format('INSERT INTO features (geom, properties, id_layer) '
  + 'VALUES (%s) '
  + 'RETURNING id as id_feature, properties',
  values.join('),('));

  debug('      ', sqlInsertFeatures);
  results = await pgClient.query(sqlInsertFeatures);

  if (Object.keys(geojson.features[0].properties).includes('comment')) {
    const temp = results.rows.map((feature) => ({
      id_feature: feature.id_feature,
      comment: JSON.parse(feature.properties).comment,
    }));

    const sqlInsertFeaturesCtrs = format('INSERT INTO feature_ctrs (comment, id_feature) '
    + 'SELECT * '
    + "FROM json_to_recordset('[%s]') as tmp_feature_ctrs(comment text, id_feature int) "
    + 'RETURNING id as id_featurectr',
    temp);

    debug('      ', sqlInsertFeaturesCtrs);
    await pgClient.query(sqlInsertFeaturesCtrs);
  }

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

async function getFeatures(pgClient, idLayer) {
  debug('    ~~getFeatures');
  let results;
  if (idLayer) {
    results = await pgClient.query(
      'SELECT id FROM features WHERE id_layer=$1 ORDER BY id ASC',
      [idLayer],
    );
  } else {
    results = await pgClient.query(
      'SELECT id, id_layer FROM features',
    );
  }
  return results.rows;
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
    + 'RETURNING id as id_feature_ctrs, id_feature',
    value,
    idFeature,
    value,
  );
  debug(sqlInsertFeatureCtr);
  const results = await pgClient.query(sqlInsertFeatureCtr);

  return results.rows[0];
}

async function insertFeature(pgClient, idLayer, geometry) {
  debug(`~~insertFeature (idLayer: ${idLayer})`);

  const sqlInsertFeature = format(
    'INSERT INTO features (geom, id_layer) '
      + "SELECT ST_SetSRID(ST_GeomFromGeoJSON('%s'), substring(layers.crs from '.:(.+)')::int), layers.id "
      + 'FROM layers WHERE layers.id=%s '
      + 'RETURNING id as id_feature',
    JSON.stringify(geometry),
    idLayer,
  );

  debug('      ', sqlInsertFeature);
  const results = await pgClient.query(sqlInsertFeature);

  return results.rows[0];
}

async function deleteFeature(pgClient, idFeature) {
  debug(`~~deleteFeature (idFeature: ${idFeature})`);

  const sqlDeleteFeature = format(
    'DELETE FROM features '
      + 'WHERE id = %s '
      + 'RETURNING id as id_feature',
    idFeature,
  );

  debug('      ', sqlDeleteFeature);
  const results = await pgClient.query(sqlDeleteFeature);

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
  getFeatures,
  updateAlert,
  insertFeature,
  deleteFeature,
};
