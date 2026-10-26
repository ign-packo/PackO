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

function geoJsonOzObject(idBranch, idPatch, geoJsonCrs, properties, coordinates) {
  debug(' ~~geoJsonOzObject');
  // Création d'un objet GeoJSON FeatureCollection
  // (seul type de GeoJSON pris en compte comme saisie)
  return {
    type: 'FeatureCollection',
    crs: geoJsonCrs,
    name: `${idBranch}_${idPatch}`,
    features: [{
      geometry: { type: 'MultiLineString', coordinates: [coordinates] },
      properties,
    }],
  };
}

module.exports = {
  geoJsonOzObject,
  writeGeojson,
};
