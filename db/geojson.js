const debug = require('debug')('gjson');
const fs = require('fs');

async function writeGeojson(idBranch, idPatch, cachePath, geojson, feature) {
  debug(' ~~writeGeojson');
  // create dir if it does not exist
  const dir = `${cachePath}/tmp_test_js`;
  try {
    fs.mkdirSync(dir);
  } catch (error) {
    if (error.code !== 'EEXIST') debug(error);
  }

  // write patch geojson
  const filePath = `${dir}/patch_idBr${idBranch}_idP${idPatch}.geojson`;

  const geojsonOz = JSON.parse(JSON.stringify(geojson));

  geojsonOz.name = `${idBranch}_${idPatch}`;
  geojsonOz.features = [JSON.parse(JSON.stringify(feature))];

  if (geojsonOz.features[0].properties.is_auto) {
    geojsonOz.features[0].geometry.type = 'MultiLineString';
  }
  geojsonOz.features[0].geometry.coordinates = [geojsonOz.features[0].geometry.coordinates];

  try {
    fs.writeFileSync(filePath, JSON.stringify(geojsonOz, null, 2), 'utf8');
    debug(`  File '${filePath}' written`);
  } catch (error) {
    debug(error);
  }
  return filePath;
}

module.exports = {
  writeGeojson,
};
