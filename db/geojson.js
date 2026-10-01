const debug = require('debug')('gjson');
const fs = require('fs');

async function writeGeojson(filePath, geojson) {
  debug(' ~~writeGeojson');

  try {
    fs.writeFileSync(filePath, JSON.stringify(geojson, null, 2), 'utf8');
    debug(`  File '${filePath}' written`);
  } catch (error) {
    debug(error);
  }
  return filePath;
}

function paramGeoJsonOz(idBranch, idPatch, cachePath, paramGeojson, feature) {
  debug(' ~~paramGeoJsonOz');
  // create dir if it does not exist
  const dir = `${cachePath}/tmp_test_js`;
  try {
    fs.mkdirSync(dir);
  } catch (error) {
    if (error.code !== 'EEXIST') debug(error);
  }

  // write patch geojson
  const filePath = `${dir}/patch_idBr${idBranch}_idP${idPatch}.geojson`;

  const geoJsonOz = paramGeojson;
  geoJsonOz.name = `${idBranch}_${idPatch}`;
  geoJsonOz.features = [JSON.parse(JSON.stringify(feature))];

  if (geoJsonOz.features[0].properties.is_auto) {
    geoJsonOz.features[0].geometry.type = 'MultiLineString';
  }
  geoJsonOz.features[0].geometry.coordinates = [geoJsonOz.features[0].geometry.coordinates];

  return writeGeojson(filePath, geoJsonOz);
}

module.exports = {
  paramGeoJsonOz,
};
