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
  debug('>>GET json/:typefile');
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
      err.json = {
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
      err.json = {
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
    req.result = {
      filePath,
      code: 200,
    };
  } catch (error) {
    debug('Error ', error);
    req.error = error;
  }
  debug('  next>>');
  next();
},
returnMsg);

module.exports = router;
