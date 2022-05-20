const debug = require('debug')('graph');
const fs = require('fs');
const path = require('path');
const { matchedData } = require('express-validator');
const cog = require('../cog_path');
const gdalProcessing = require('../gdal_processing');
const db = require('../db/db');

function getGraph(req, _res, next) {
  if (req.error) {
    debug(req.error);
    next();
    return;
  }
  debug('~~~GetGraph');
  const { overviews } = req;
  const params = matchedData(req);
  const { x } = params;
  const { y } = params;
  const { idBranch } = params;

  const xOrigin = overviews.crs.boundingBox.xmin;
  const yOrigin = overviews.crs.boundingBox.ymax;
  // const Rmax = overviews.resolution;
  const lvlMax = overviews.dataSet.level.max;

  const resol = overviews.resolution * 2 ** (overviews.level.max - lvlMax);

  // il faut trouver la tuile
  const Px = (x - xOrigin) / resol;
  const Py = (yOrigin - y) / resol;
  const Tx = Math.floor(Px / overviews.tileSize.width);
  const Ty = Math.floor(Py / overviews.tileSize.height);
  const I = Math.floor(Px - Tx * overviews.tileSize.width);
  const J = Math.floor(Py - Ty * overviews.tileSize.height);
  try {
    const cogPath = cog.getTilePath(Tx, Ty, lvlMax, overviews);
    // const url = path.join(global.dir_cache, 'graph', cogPath.dirPath, `${cogPath.filename}.tif`);
    // on commence par cherche la version de la branche
    let url = path.join(req.dir_cache, 'graph', cogPath.dirPath, `${idBranch}_${cogPath.filename}.tif`);
    // si jamais la version de la branch n'existe pas, il faut prendre la version d'origine
    if (!fs.existsSync(url)) {
      url = path.join(req.dir_cache, 'graph', cogPath.dirPath, `${cogPath.filename}.tif`);
    }
    debug(url);
    if (!fs.existsSync(url)) {
      req.result = { json: { color: [0, 0, 0], opiName: 'out of bounds' }, code: 201 };
      next();
      return;
    }
    gdalProcessing.getColor(url, cogPath.x, cogPath.y, cogPath.z, I, J, overviews.tileSize.width, 'graph')
      .then(async (color) => {
        if (color.some((item) => item !== 0)) {
          try {
            const opi = await db.getOPIFromColor(req.client, idBranch, color);
            req.result = {
              json: {
                color, opiName: opi.name, date: opi.date, time: opi.time_ut,
              },
              code: 200,
            };
          } catch (error) {
            req.result = { json: { color, opiName: 'not found' }, code: 202 };
          }
        } else {
          req.result = { json: { color: [0, 0, 0], opiName: 'out of graph' }, code: 201 };
        }
        next();
      });
  } catch (error) {
    debug(error);
    req.result = { json: { color: [0, 0, 0], opiName: 'out of bounds' }, code: 201 };
    next();
  }
}

module.exports = {
  getGraph,
};
