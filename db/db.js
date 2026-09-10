const debug = require('debug')('db');
const format = require('pg-format');
// const fs = require('fs');
// const gjson = require('./geojson');

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
    const [name, opi] = entry;
    values.push([idCache,
      name,
      `{${opi.color[0]}, ${opi.color[1]}, ${opi.color[2]}}`,
      opi.date,
      opi.time_ut,
      opi.with_rgb,
      opi.with_ir]);
  });
  const sqlRequest = format('INSERT INTO opi (id_cache, name, color, date, time_ut, with_rgb, with_ir) VALUES %L', values);
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

async function getActivePatches(pgClient, idBranch, nbPatches) {
  debug(`    ~~getActivePatches (idBranch: ${idBranch}, nbPatches: ${nbPatches})`);
  // Mise en place de l'ordre des patches par défaut
  let order = 'ASC';
  // Filtrage des n derniers patches
  let limit = '';
  if (nbPatches > 0) {
    limit = `LIMIT ${nbPatches}`;
    order = 'DESC';
  }

  const query = "SELECT json_build_object('type', 'FeatureCollection', 'crs', "
    + "json_build_object( 'type', 'name', 'properties', "
    + "json_build_object('name', 'urn:ogc:def:crs:' || REPLACE((SELECT c.crs "
    + 'FROM branches b '
    + 'JOIN caches c ON b.id_cache = c.id '
    + "WHERE b.id = $1), ':', '::'))), "
    + `'features', json_agg(ST_AsGeoJSON(s.*)::json ORDER BY s.id_block ${order}, s.num ${order}) `
    + 'FILTER (WHERE s.id IS NOT NULL)) '
    + 'FROM ( '
    + ' SELECT '
    + '  t.*, '
    + '  o.name AS "opiName", '
    + '  o.color, '
    + '  o2.name AS "opiNameSec", '
    + '  o2.color AS "colorSec" '
    + ' FROM ( '
    + '  SELECT '
    + '   p.*, blk.num AS num_block, '
    + '   ARRAY_AGG(ARRAY[s.x, s.y, s.z]) AS slabs '
    + '  FROM patches p '
    + '  JOIN blocks blk ON p.id_block = blk.id '
    + '  LEFT JOIN slabs s ON p.id = s.id_patch '
    + '  WHERE blk.id_branch = $1'
    + '  AND blk.active = TRUE '
    + '  GROUP BY p.id, blk.num '
    + `  ORDER BY p.id_block DESC, p.num DESC ${limit}`
    + ' ) AS t '
    + ' JOIN opi o ON t.id_opi = o.id '
    + ' LEFT JOIN opi o2 ON t.id_opisec = o2.id AND t.is_auto ) AS s';

  debug(query);
  const results = await pgClient.query(query, [idBranch]);

  // cas ou il n'y a pas de patches actifs en base
  if (results.rows[0].json_build_object.features === null) {
    results.rows[0].json_build_object.features = [];
  }
  return results.rows[0].json_build_object;
}

async function getUnactivePatches(pgClient, idBranch) {
  debug(`    ~~getUnactivePatches (idBranch: ${idBranch})`);

  const query = "SELECT json_build_object('type', 'FeatureCollection', "
    + "'features', json_agg(ST_AsGeoJSON(s.*)::json ORDER BY s.num DESC) "
    + 'FILTER (WHERE s.id IS NOT NULL)) '
    + 'FROM ( '
    + ' SELECT '
    + '  t.*, '
    + '  o.name AS "opiName", '
    + '  o.color, '
    + '  o2.name AS "opiNameSec", '
    + '  o2.color AS "colorSec" '
    + ' FROM ( '
    + '  SELECT '
    + '   p.*, blk.num AS num_block, '
    + '   ARRAY_AGG(ARRAY[s.x, s.y, s.z]) AS slabs '
    + '  FROM patches p '
    + '  JOIN blocks blk ON p.id_block = blk.id '
    + '  LEFT JOIN slabs s ON p.id = s.id_patch '
    + '  WHERE blk.id_branch = $1'
    + '  AND blk.active = FALSE '
    + '  GROUP BY p.id, blk.num '
    + '  ORDER BY p.num DESC '
    + ' ) AS t '
    + ' JOIN opi o ON t.id_opi = o.id '
    + ' LEFT JOIN opi o2 ON t.id_opisec = o2.id AND t.is_auto ) AS s';

  debug(query);

  const results = await pgClient.query(
    query, [idBranch],
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
    'SELECT o.name, to_char(o.date,\'YYYY-mm-dd\') as date, o.time_ut, o.color, o.id, o.with_rgb, o.with_ir FROM opi o, branches b WHERE b.id_cache = o.id_cache AND b.id = $1 AND o.color=$2',
    [idBranch, color],
  );
  debug(results.rows);
  if (results.rowCount !== 1) {
    throw new Error(`on a trouvé ${results.rowCount} opi pour la couleur '${color}'`);
  }
  return results.rows[0];
}

async function getOPIFromNames(pgClient, idBranch, names) {
  debug(`    ~~getOPIFromNames (names: ${names})`);
  const results = await pgClient.query(
    'SELECT o.name, to_char(o.date,\'YYYY-mm-dd\') as date, o.time_ut, o.color, o.id, o.with_rgb, o.with_ir FROM opi o, branches b WHERE b.id_cache = o.id_cache AND b.id = $1 AND o.name = ANY($2)',
    [idBranch, names],
  );
  debug(results.rows);
  if (results.rowCount !== names.length) {
    throw new Error(`on a trouvé ${results.rowCount} opi pour ${names.length} noms demandés`);
  }
  return results.rows;
}

// async function getOPIFromId(pgClient, idOpi) {
//   debug(`    ~~getOPIFromId (idOpi: ${idOpi})`);
//   const results = await pgClient.query(
//     'SELECT name, to_char(date,\'YYYY-mm-dd\'), time_ut, color,'
//     + 'with_rgb, with_ir FROM opi WHERE id=$1',
//     [idOpi],
//   );
//   if (results.rowCount !== 1) {
//     throw new Error(`on a trouvé ${results.rowCount} opi pour le idOpi '${idOpi}'`);
//   }
//   return results.rows[0];
// }

async function getCacheCrsFromIdBranch(pgClient, idBranch) {
  debug(`    ~~getCacheCrs (idBranch: ${idBranch})`);
  const results = await pgClient.query('SELECT crs FROM caches WHERE id=(SELECT id_cache FROM branches WHERE id=$1)', [idBranch]);
  if (results.rowCount !== 1) {
    throw new Error(`on a trouvé ${results.rowCount} crs pour le idBranch '${idBranch}'`);
  }
  return results.rows[0];
}

async function insertPatch(pgClient, idBlock, geometry, idOpi, isAuto) {
  debug(`    ~~insertPatch (idBranch: ${idBlock})`);
  const sql = format('INSERT INTO patches (geom, id_block, id_opi, id_opisec, is_auto) VALUES (ST_GeomFromGeoJSON(%L), %L) RETURNING id as id_patch, num',
    JSON.stringify(geometry),
    [idBlock,
      idOpi.ref,
      isAuto ? idOpi.sec : null,
      isAuto]);
  debug(sql);

  const results = await pgClient.query(sql);
  if (results.rowCount !== 1) {
    throw new Error('failed to insert patch');
  }

  return results.rows[0];
}

async function insertMultiPatchesBlock(pgClient, idBranch) {
  debug(`    ~~insertMultiPatchesBlock (idBranch: ${idBranch})`);

  const query = 'INSERT INTO blocks (id_branch) VALUES ($1) RETURNING id as id_block, num';
  const results = await pgClient.query(query, [idBranch]);
  if (results.rowCount !== 1) {
    throw new Error('failed to insert block');
  }

  return results.rows[0];
}

async function deactiveBlock(pgClient, idBlock) {
  debug(`   ~~deactiveBlock (idBlock : ${idBlock})`);
  const queryBlock = 'UPDATE blocks SET active=False WHERE id=$1';
  const result = await pgClient.query(queryBlock, [idBlock]);

  return result;
}

async function reactiveBlock(pgClient, idBlock) {
  debug(`   ~~reactiveBlock (idBlock : ${idBlock})`);
  const queryBlock = 'UPDATE blocks SET active=True WHERE id=$1';
  const result = await pgClient.query(queryBlock, [idBlock]);

  return result;
}

async function deleteMultiPatchesBlocks(pgClient, idBranch) {
  debug(`    ~~deletePatches (idBranch: ${idBranch})`);

  const queryBlock = 'DELETE FROM blocks WHERE id_branch=$1';
  debug(queryBlock);

  const result = await pgClient.query(queryBlock, [idBranch]);

  return result;
}

async function getSlabs(pgClient, listIdsPatch) {
  debug(`    ~~getSlabs (listIdsPatch: ${listIdsPatch})`);

  const querySlabs = 'SELECT id, id_patch, x, y, z FROM slabs WHERE id_patch = ANY($1) ORDER BY array_position($1, id_patch)';
  debug(querySlabs);

  const results = await pgClient.query(
    querySlabs, [listIdsPatch],
  );

  return results.rows;
}

async function insertSlabs(pgClient, idPatch, slabs) {
  debug(`    ~~insertSlabs (idPatch: ${idPatch})`);

  const values = [];
  slabs.forEach((slab) => {
    values.push([idPatch, slab.x, slab.y, slab.z]);
  });

  const sql = format('INSERT INTO slabs (id_patch, x, y, z) values (%s)', values.join('),('));
  debug(sql);

  const results = await pgClient.query(
    sql,
  );

  return results.rows;
}

async function getLayers(pgClient, idBranch) {
  debug(`    ~~getLayers (idBranch: ${idBranch})`);
  const sql = format(
    'SELECT layers.id, layers.name, num, crs, style_itowns, opacity, visibility '
    + 'FROM layers, styles WHERE layers.id_style=styles.id %s',
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
    'WITH fj AS ( SELECT * FROM features_json WHERE features_json.id_layer = (%s)) '
    + "SELECT json_build_object('type', 'FeatureCollection', 'name', l.name, 'crs', json_build_object('type', substring(l.crs from '(.+):.'), 'properties', json_build_object('code', substring(l.crs from '.:(.+)'))), 'features', fj.features) as geojson "
    + 'FROM fj, layers l '
    + 'WHERE fj.id_layer=l.id',
    typeof idVector !== 'object' ? idVector : `SELECT id FROM  layers WHERE id_branch=${idVector.idBranch} AND name='${idVector.name}'`,
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
    values.push(`ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(feature.geometry)}'), ${metadonnees.crs.split(':')[1]}), '${JSON.stringify(properties).replace(/'/g, "''")}', '${idNewLayer}'`);
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
      comment: JSON.parse(feature.properties).comment.replace(/'/g, "''"),
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
    value = `'${comment.replace(/'/g, "''")}'`;
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
      + 'RETURNING id as id_feature, id_layer',
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
  getOPIFromNames,
  getCrsFromIdBranch: getCacheCrsFromIdBranch,
  insertPatch,
  insertMultiPatchesBlock,
  deactiveBlock,
  reactiveBlock,
  deleteMultiPatchesBlocks,
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
