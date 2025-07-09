const debug = require('debug')('gjson');
const fs = require('fs');

async function writeGeojson(path, idBranch, idPatch, crsCode, geom,
  opiRefName, opiSecName, opiRefColor, opiSecColor, isAuto) {
  debug(' ~~ write geojson file');
  const data = {
    type: 'FeatureCollection',
    name: `${idBranch}_${idPatch}`,
    crs: {
      type: 'name',
      properties: { name: `urn:ogc:def:crs:EPSG::${crsCode}` },
    },
    features: [
      {
        type: 'Feature',
        properties: {
          opiName: opiRefName,
          color: opiRefColor,
          opiNameSec: opiSecName,
          colorSec: opiSecColor,
          auto: isAuto,
        },
        geometry: geom,
      },
    ],
  };

  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
    debug(`  File '${path}' written`);
  } catch (error) {
    debug(error);
  }
}

module.exports = {
  writeGeojson,
};
