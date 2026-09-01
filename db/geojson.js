const debug = require('debug')('gjson');
const fs = require('fs');
const path = require('path');

async function writeGeojson(filePath, geojson) {
  debug(' ~~writeGeojson');
  try {
    fs.mkdirSync(path.dirname(filePath));
  } catch (error) {
    if (error.code !== 'EEXIST') debug(error);
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(geojson, null, 2), 'utf8');
    debug(`  File '${filePath}' written`);
  } catch (error) {
    debug(error);
  }
}

function paramGeoJsonOz(idBranch, idPatch, cachePath, paramGeojson, properties, coordinates) {
  debug(' ~~paramGeoJsonOz');
  // write patch geojson
  const filePath = `${cachePath}/tmp_test_js/patch_idBr${idBranch}_idP${idPatch}.geojson`;

  const geoJsonOz = paramGeojson;
  geoJsonOz.name = `${idBranch}_${idPatch}`;
  geoJsonOz.features = [{
    geometry: { type: 'MultiLineString', coordinates: [coordinates] },
    properties,
  }];

  return [filePath, geoJsonOz];
}

module.exports = {
  paramGeoJsonOz,
  writeGeojson,
};
