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

function geoJsonOzObject(idBranch, idPatch, crsObject, feature) {
  debug(' ~~geoJsonOzObject');
  const newFeature = feature;
  if (newFeature.geometry.type === 'LineString') {
    newFeature.geometry.type = 'MultiLineString';
    newFeature.geometry.coordinates = [newFeature.geometry.coordinates];
  }
  // Création d'un objet GeoJSON FeatureCollection
  // (seul type de GeoJSON pris en compte comme saisie)
  return {
    type: 'FeatureCollection',
    crs: crsObject,
    name: `${idBranch}_${idPatch}`,
    features: [newFeature],
  };
}

module.exports = {
  geoJsonOzObject,
  writeGeojson,
};
