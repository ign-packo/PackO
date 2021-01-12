const debug = require('debug')('graph');
// const debugPatch = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { matchedData, query } = require('express-validator');
// const jimp = require('jimp');
const rok4IO = require('bindings')('rok4IO');
const rok4 = require('../rok4.js');

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

  const tileRoot = rok4.getTileRoot(Tx,
    Ty,
    lvlMax,
    overviews.pathDepth,
    overviews.slabSize);

  const url = path.join(global.dir_cache, 'graph', `${tileRoot.url}.tif`);
  debug(url);
  if (!fs.existsSync(url)) {
    res.status(201).send('{"color":[0,0,0], "cliche":"out of bounds"}');
  } else {
    const slab = new rok4IO.ImageROK4();
    slab.load(url).then(() => {
      slab.getTile(tileRoot.numTile).then((image) => {
        const imageInfo = slab.info();
        const index = J * imageInfo[3] * imageInfo[2] + I * imageInfo[2];
        debug(image[index],
          image[index + 1],
          image[index + 2]);
        const out = {
          color: [
            image[index],
            image[index + 1],
            image[index + 2]],
        };
        debug(req.app.cache_mtd);
        if ((out.color[0] in req.app.cache_mtd)
            && (out.color[1] in req.app.cache_mtd[out.color[0]])
            && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
          out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
        } else {
          out.cliche = 'missing';
        }
        debug(JSON.stringify(out));
        res.status(200).send(JSON.stringify(out));
      });
    });
  }
});

module.exports = router;
