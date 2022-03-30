const router = require('express').Router();
const { query, param } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const cache = require('../middlewares/cache');
const branch = require('../middlewares/branch');
const wmts = require('../middlewares/wmts');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

// 06-121r3_OGC_Web_Services_Common_Specification_version_1.1.0_with_Corrigendum
// section 11.5.2
// The capitalization of parameter names when KVP encoded shall be case insensitive,
// meaning that parameter names may have mixed case or not.
router.use((req, _res, next) => {
  Object.keys(req.query).forEach((key) => {
    req.query[key.toUpperCase()] = req.query[key];
  });
  next();
});

router.get('/:idBranch/wmts',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
    query('SERVICE')
      .exists().withMessage(createErrMsg.missingParameter('SERVICE'))
      .isIn(['WMTS', 'WMS'])
      .withMessage((SERVICE) => (`'${SERVICE}': unsupported SERVICE value`)),
    query('REQUEST')
      .exists().withMessage(createErrMsg.missingParameter('REQUEST'))
      .isIn(['GetCapabilities', 'GetTile', 'GetFeatureInfo'])
      .withMessage((REQUEST) => (`'${REQUEST}': unsupported REQUEST value`)),
    query('VERSION')
      .if(query('SERVICE').isIn(['WMTS']))
      .if(query('REQUEST').isIn(['GetCapabilities']))
      .exists()
      .withMessage(createErrMsg.missingParameter('VERSION'))
      .matches(/^\d+(.\d+)*$/i)
      .withMessage(createErrMsg.invalidParameter('VERSION'))
      .if(query('SERVICE').isIn(['WMS', 'WMTS']))
      .if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
      .exists()
      .withMessage(createErrMsg.missingParameter('VERSION'))
      .matches(/^\d+(.\d+)*$/i)
      .withMessage(createErrMsg.invalidParameter('VERSION')),
    query('LAYER').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('LAYER'))
      .isIn(['ortho', 'graph', 'opi'])
      .withMessage((LAYER) => (`'${LAYER}': unsupported LAYER value`)),
    query('Name').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo'])).if(query('LAYER').isIn(['opi']))
      .exists()
      .withMessage(createErrMsg.missingParameter('Name'))
      .optional(),
    query('STYLE').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('STYLE'))
      .isIn(['normal'])
      .withMessage((STYLE) => (`'${STYLE}': unsupported STYLE value`)),
    query('FORMAT').if(query('REQUEST').isIn(['GetTile'])).exists().withMessage(createErrMsg.missingParameter('FORMAT'))
      .isIn(['image/png', 'image/jpeg'])
      .withMessage((FORMAT) => (`'${FORMAT}': unsupported FORMAT value`)),
    query('INFOFORMAT').if(query('REQUEST').isIn(['GetFeatureInfo'])).exists().withMessage(createErrMsg.missingParameter('INFOFORMAT')),
  ],
  validateParams,
  cache.getCachePath,
  cache.getOverviews,
  [
    query('TILEMATRIXSET').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('TILEMATRIXSET'))
      .custom((TILEMATRIXSET, { req }) => TILEMATRIXSET === req.overviews.identifier)
      .withMessage((TILEMATRIXSET) => (`'${TILEMATRIXSET}': unsupported TILEMATRIXSET value`)),
    query('TILEMATRIX').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('TILEMATRIX'))
      // .isInt({ min: 0 })
      .custom((TILEMATRIX, { req }) => (TILEMATRIX >= Number(req.overviews.dataSet.level.min)
        && TILEMATRIX <= Number(req.overviews.dataSet.level.max)))
      .withMessage(createErrMsg.invalidParameter('TILEMATRIX')),
    query('TILEROW').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('TILEROW'))
      .isInt({ min: 0 })
      .withMessage(createErrMsg.invalidParameter('TILEROW')),
    query('TILECOL').if(query('REQUEST').isIn(['GetTile', 'GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('TILECOL'))
      .isInt({ min: 0 })
      .withMessage(createErrMsg.invalidParameter('TILECOL')),
    query('I').if(query('REQUEST').isIn(['GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('I'))
      .isInt({ min: 0 })
      .withMessage(createErrMsg.invalidParameter('I')),
    query('J').if(query('REQUEST').isIn(['GetFeatureInfo']))
      .exists().withMessage(createErrMsg.missingParameter('J'))
      .isInt({ min: 0 })
      .withMessage(createErrMsg.invalidParameter('J')),
  ],
  validateParams,
  // cache.getCachePath,
  // cache.getOverviews,
  wmts.wmts,
  pgClient.close,
  returnMsg);

module.exports = router;
