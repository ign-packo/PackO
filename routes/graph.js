const debug = require('debug')('graph');
// const debugPatch = require('debug')('patch');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { matchedData, query } = require('express-validator');
const jimp = require('jimp');
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

  const url = `${path.join(global.dir_cache, 'graph', rok4.getTileRoot(Tx, Ty, lvlMax, overviews.pathDepth))}.png`;
  debug(url);
  // _graph.png`;
  if (!fs.existsSync(url)) {
    res.status(201).send('{"color":[0,0,0], "cliche":"out of bounds"}');
  } else {
    jimp.read(url, (err, image) => {
      if (err) {
        const erreur = new Error();
        erreur.msg = {
          status: err,
          errors: [{
            localisation: 'Jimp.read()',
            msg: err,
          }],
        };
        res.status(500).send(erreur);
      } else {
        const index = image.getPixelIndex(I, J);
        debug(image.bitmap.data[index], image.bitmap.data[index + 1], image.bitmap.data[index + 2]);
        const out = {
          color: [
            image.bitmap.data[index],
            image.bitmap.data[index + 1],
            image.bitmap.data[index + 2]],
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
      }
    });
  }
});

module.exports = router;
