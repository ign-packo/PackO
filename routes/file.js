const debug = require('debug')('file');
const router = require('express').Router();
const { matchedData, param } = require('express-validator');
const path = require('path');
const fs = require('fs');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/json/:typefile', [
  param('typefile')
    .exists().withMessage(createErrMsg.missingParameter('typefile'))
    .isIn(['overviews', 'activePatches', 'test'])
    .withMessage(createErrMsg.invalidParameter('typefile')),
], validateParams,
(req, res) => {
  debug('~~~getJson~~~');
  const params = matchedData(req);
  const { typefile } = params;
  const parentDir = {
    overviews: global.dir_cache,
    activePatches: path.join(global.dir_cache, 'patch'),
  };
  const filePath = path.join(`${parentDir[typefile]}`, `${typefile}.json`);
  try {
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
});

module.exports = router;
