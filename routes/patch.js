const router = require('express').Router();
const { body, param } = require('express-validator');
const GJV = require('geojson-validation');
const branch = require('../middlewares/branch');
const validator = require('../paramValidation/validator');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
<<<<<<< HEAD
const cog = require('../cog_path');
const gdalProcessing = require('../gdal_processing');
=======
const pgClient = require('../middlewares/pgClient');
const patch = require('../middlewares/patch');
const returnMsg = require('../middlewares/returnMsg');
>>>>>>> a05288d... feat(API): add Postgres DB store branches

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

router.get('/:idBranch/patches', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
pgClient.open,
branch.validBranch,
patch.getSelectedBranchPatches,
patch.getPatches,
pgClient.close,
returnMsg);

router.post('/:idBranch/patch',
  patch.encapBody.bind({ keyName: 'geoJSON' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .isInt({ min: 0 })
      .withMessage(createErrMsg.invalidParameter('idBranch')),
    ...geoJsonAPatcher,
  ],
  validateParams,
  pgClient.open,
  branch.validBranch,
  patch.getSelectedBranchPatches,
  patch.patch,
  pgClient.close,
  returnMsg);

router.put('/:idBranch/patch/undo', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
pgClient.open,
branch.validBranch,
patch.getSelectedBranchPatches,
patch.undo,
pgClient.close,
returnMsg);

router.put('/:idBranch/patch/redo', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
pgClient.open,
branch.validBranch,
patch.getSelectedBranchPatches,
patch.redo,
pgClient.close,
returnMsg);

router.put('/:idBranch/patches/clear', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
pgClient.open,
branch.validBranch,
patch.getSelectedBranchPatches,
patch.clear,
pgClient.close,
returnMsg);

module.exports = router;
