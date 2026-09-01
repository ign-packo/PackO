const debug = require('debug')('gjson');
const fs = require('fs');

async function writeGeojson(idStorage, cachePath, geojson, feature) {
  debug(' ~~writeGeojson');
  const { idBranch, idPatch } = idStorage;
  // create dir if it does not exist
  const dir = `${cachePath}/tmp_test_js`;
  try {
    fs.mkdirSync(dir);
  } catch (error) {
    if (error.code !== 'EEXIST') debug(error);
  }

  // write patch geojson
  const filePath = `${dir}/patch_idBr${idBranch}_idP${idPatch}.geojson`;

  const geojsonAna = JSON.parse(JSON.stringify(geojson));

  geojsonAna.name = `${idBranch}_${idPatch}`;
  geojsonAna.features = [JSON.parse(JSON.stringify(feature))];

  const prop = feature.properties;
  if (prop.is_auto) {
    geojsonAna.features[0].geometry.type = 'MultiLineString';
  }
  geojsonAna.features[0].geometry.coordinates = [geojsonAna.features[0].geometry.coordinates];

  try {
    fs.writeFileSync(filePath, JSON.stringify(geojsonAna, null, 2), 'utf8');
    debug(`  File '${filePath}' written`);
  } catch (error) {
    debug(error);
  }
  return filePath;
}

module.exports = {
  writeGeojson,
};
