const router = require('express').Router();
const { body, param } = require('express-validator');
const GJV = require('geojson-validation');
const cache = require('../middlewares/cache');
const branch = require('../middlewares/branch');
const validator = require('../paramValidation/validator');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const patch = require('../middlewares/patch');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

const geoJsonAPatcher = [
  body('geoJSON')
    .exists().withMessage(createErrMsg.missingBody)
    .custom(GJV.isGeoJSONObject)
    .withMessage(createErrMsg.invalidBody('objet GeoJSON'))
    .custom(GJV.isFeatureCollection)
    .withMessage(createErrMsg.invalidBody('featureCollection')),
  body('geoJSON.type')
    .exists().withMessage(createErrMsg.missingParameter('type'))
    .isIn(['FeatureCollection'])
    .withMessage(createErrMsg.invalidParameter('type')),
  body('geoJSON.crs')
    .exists().withMessage(createErrMsg.missingParameter('crs'))
    .custom(validator.isCrs)
    .withMessage(createErrMsg.invalidParameter('crs')),
  body('geoJSON.features.*.geometry')
    .custom(GJV.isPolygon).withMessage(createErrMsg.InvalidEntite('geometry', 'polygon')),
  body('geoJSON.features.*.properties.color')
    .exists().withMessage(createErrMsg.missingParameter('properties.color'))
    .custom(validator.isColor)
    .withMessage(createErrMsg.invalidParameter('properties.color')),
  body('geoJSON.features.*.properties.cliche')
    .exists().withMessage(createErrMsg.missingParameter('properties.cliche'))
    .matches(/^[a-zA-Z0-9-_]+$/i)
    .withMessage(createErrMsg.invalidParameter('properties.cliche')),
];

router.get('/:idBranch/patches',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  cache.getCachePath,
  patch.getPatches,
  pgClient.close,
  returnMsg);

router.post('/:idBranch/patch',
  patch.encapBody.bind({ keyName: 'geoJSON' }),
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
    ...geoJsonAPatcher,
  ],
  validateParams,
  cache.getCachePath,
  cache.getOverviews,
  patch.postPatch,
  pgClient.close,
  returnMsg);

router.put('/:idBranch/patch/undo',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  cache.getCachePath,
  cache.getOverviews,
  patch.undo,
  pgClient.close,
  returnMsg);

router.put('/:idBranch/patch/redo',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  cache.getCachePath,
  cache.getOverviews,
  patch.redo,
  pgClient.close,
  returnMsg);

router.put('/:idBranch/patches/clear',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  cache.getCachePath,
  cache.getOverviews,
  patch.clear,
  pgClient.close,
  returnMsg);

module.exports = router;
