const debug = require('debug')('graph');
// const debugPatch = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { matchedData, query } = require('express-validator');
// const jimp = require('jimp');
const cog = require('../cog_path.js');
const gdalProcessing = require('../gdal_processing.js');

// const GJV = require('geojson-validation');
const validateParams = require('../paramValidation/validateParams');
// const validator = require('../paramValidation/validator');
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/graph', [
  query('x')
    .exists().withMessage(createErrMsg.missingParameter('x'))
    .matches(/^\d+(.\d+)?$/i)
    .withMessage(createErrMsg.invalidParameter('x')),
  query('y')
    .exists().withMessage(createErrMsg.missingParameter('y'))
    .matches(/^\d+(.\d+)?$/i)
    .withMessage(createErrMsg.invalidParameter('y')),
], validateParams,
(req, res) => {
  debug('~~~GetGraph');
  const { overviews } = req.app;
  const params = matchedData(req);
  const { x } = params;
  const { y } = params;

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
    const url = path.join(global.dir_cache, 'graph', cogPath.dirPath, `${cogPath.filename}.tif`);
    debug(url);
    if (!fs.existsSync(url)) {
      res.status(201).send('{"color":[0,0,0], "cliche":"out of bounds"}');
    } else {
      gdalProcessing.getPixel(url, cogPath.x, cogPath.y, cogPath.z, I, J, overviews.tileSize.width, 'graph').then((out) => {
        debug(req.app.cache_mtd);
        /* eslint-disable no-param-reassign */
        if (out.color.some((item) => item !== 0)) {
          if ((out.color[0] in req.app.cache_mtd)
            && (out.color[1] in req.app.cache_mtd[out.color[0]])
            && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
            out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
            debug(JSON.stringify(out));
            res.status(200).send(JSON.stringify(out));
          } else {
            out.cliche = 'not found';
            res.status(202).send(out);
          }
        } else {
          res.status(201).send('{"color":[0,0,0], "cliche":"out of graph"}');
        }
        /* eslint-enable no-param-reassign */
      });
    }
  } catch (error) {
    res.status(201).send('{"color":[0,0,0], "cliche":"out of bounds"}');
  }
});

module.exports = router;
