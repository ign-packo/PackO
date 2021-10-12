const debug = require('debug')('file');
const router = require('express').Router();
const { matchedData, param, query } = require('express-validator');
const pathMod = require('path');
const fs = require('fs');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const returnMsg = require('../middlewares/returnMsg');

router.get('/json/:typefile', [
  param('typefile')
    // .exists().withMessage(createErrMsg.missingParameter('typefile'))
    .isIn(['overviews', 'test'])
    .withMessage(createErrMsg.invalidParameter('typefile')),
  query('cachePath')
    .exists().withMessage(createErrMsg.missingParameter('cachePath')),
], validateParams,
async (req, res, next) => {
  debug('~~~getJson~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { typefile, cachePath } = params;
  try {
    if (!fs.existsSync(cachePath)) {
      const err = new Error();
      err.code = 404;
      err.msg = {
        status: createErrMsg.missingDir(cachePath),
        errors: [{
          localisation: 'GET /json/{filetype}',
          param: 'cachePath',
          value: cachePath,
          msg: createErrMsg.missingDir(typefile),
        }],
      };
      throw err;
    }
    // debug('ICI', cachePath)
    // await fs.promises.access(cachePath);
    // debug('LA', cachePath)

    const filePath = pathMod.join(cachePath, `${typefile}.json`);

    if (!fs.existsSync(filePath)) {
      const err = new Error();
      err.code = 404;
      err.msg = {
        status: createErrMsg.missingFile(`${typefile}.json`),
        errors: [{
          localisation: 'GET /json/{filetype}',
          param: 'filetype',
          value: `${typefile}`,
          msg: createErrMsg.missingFile(`${typefile}.json`),
        }],
      };
      throw err;
    }
    debug(' => download');
    res.status(200).download(filePath);
  } catch (err) {
    debug(' => Erreur');
    res.status(err.code).send(err.msg);
  }
},
returnMsg);

module.exports = router;
