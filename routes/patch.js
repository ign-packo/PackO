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

// Encapsulation des informations du requestBody dans une nouvelle clé 'keyName' ("body" par defaut)
function encapBody(req, _res, next) {
  let keyName = 'body';
  if (this.keyName) { keyName = this.keyName; }
  if (JSON.stringify(req.body) !== '{}') {
    const requestBodyKeys = Object.keys(req.body);
    req.body[keyName] = JSON.parse(JSON.stringify(req.body));
    for (let i = 0; i < requestBodyKeys.length; i += 1) {
      delete req.body[requestBodyKeys[i]];
    }
  }
  next();
}

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
  body('geoJSON.features.*.properties.colorRef')
    .exists().withMessage(createErrMsg.missingParameter('properties.colorRef'))
    .custom(validator.isColor)
    .withMessage(createErrMsg.invalidParameter('properties.colorRef')),
  body('geoJSON.features.*.properties.opiRefName')
    .exists().withMessage(createErrMsg.missingParameter('properties.opiRefName'))
    .matches(/^[a-zA-Z0-9-_]+$/i)
    .withMessage(createErrMsg.invalidParameter('properties.opiRefName')),
  /* body('geoJSON.features.*.properties.colorSec')
    .exists().withMessage(createErrMsg.missingParameter('properties.colorSec'))
    .custom(validator.isColor)
    .withMessage(createErrMsg.invalidParameter('properties.colorSec')),
  body('geoJSON.features.*.properties.opiSecName')
    .exists().withMessage(createErrMsg.missingParameter('properties.opiSecName'))
    .matches(/^[a-zA-Z0-9-_]+$/i)
    .withMessage(createErrMsg.invalidParameter('properties.opiSecName')), */
  body('geoJSON.features.*.properties.patchIsAuto')
    .exists().withMessage(createErrMsg.missingParameter('properties.patchIsAuto'))
    .custom(validator.isBool)
    .withMessage(createErrMsg.invalidParameter('properties.patchIsAuto')),
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
  patch.getPatches,
  pgClient.close,
  returnMsg);

router.post('/:idBranch/patch',
  encapBody.bind({ keyName: 'geoJSON' }),
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
  branch.getCachePath,
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
  branch.getCachePath,
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
  branch.getCachePath,
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
  branch.getCachePath,
  cache.getOverviews,
  patch.clear,
  pgClient.close,
  returnMsg);

module.exports = router;
