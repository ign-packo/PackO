const router = require('express').Router();
const { body, param, query } = require('express-validator');
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
  body('geoJSON.features.*.properties')
    .exists().withMessage(createErrMsg.missingParameter('properties')),
  body('geoJSON.features.*.properties.is_auto')
    .exists().withMessage(createErrMsg.missingParameter('is_auto'))
    .isBoolean()
    .withMessage(createErrMsg.invalidParameter('is_auto'))
    .custom((value, { req }) => { req.result.is_auto = value; return true; }),
  body('geoJSON.features.*.geometry')
    .exists().withMessage(createErrMsg.missingParameter('geometry'))
    .custom((value, { req }) => {
      if (req.result.is_auto
        && [!GJV.isLineString(value), !GJV.isPolygon(value)].every(Boolean)) {
        throw new Error(createErrMsg.InvalidEntity('geometry', value.type));
      }
      if (!req.result.is_auto && !GJV.isPolygon(value)) {
        throw new Error(createErrMsg.InvalidEntity('geometry', 'Polygon'));
      }
      return true;
    }),

  body('geoJSON.features.*.properties.opiName')
    .if(body('geoJSON.features.*.properties').exists())
    .exists()
    .withMessage(createErrMsg.missingParameter('properties.opiName'))
    .if(body('geoJSON.features.*.properties.opiName').exists())
    .matches(/^[a-zA-Z0-9-_]+$/i)
    .withMessage(createErrMsg.invalidParameter('properties.opiName')),
  body('geoJSON.features.*.properties.color')
    .if(body('geoJSON.features.*.properties.opiName').exists())
    .exists()
    .withMessage(createErrMsg.missingParameter('properties.color'))
    .if(body('geoJSON.features.*.properties.color').exists())
    .custom(validator.isColor)
    .withMessage(createErrMsg.invalidParameter('properties.color')),

  body('geoJSON.features.*.properties.opiNameSec')
    .if((_, { req }) => req.result.is_auto)
    .if(body('geoJSON.features.*.properties').exists())
    .exists()
    .withMessage(createErrMsg.missingParameter('properties.opiNameSec'))
    .if(body('geoJSON.features.*.properties.opiNameSec').exists())
    .matches(/^[a-zA-Z0-9-_]+$/i)
    .withMessage(createErrMsg.invalidParameter('properties.opiNameSec')),
  body('geoJSON.features.*.properties.colorSec')
    .if((_, { req }) => req.result.is_auto)
    .if(body('geoJSON.features.*.properties.opiNameSec').exists())
    .exists()
    .withMessage(createErrMsg.missingParameter('properties.colorSec'))
    .if(body('geoJSON.features.*.properties.colorSec').exists())
    .custom(validator.isColor)
    .withMessage(createErrMsg.invalidParameter('properties.colorSec')),
];

const getPatches = [
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
    query('nbPatches')
      .if(query('nbPatches').exists())
      .isInt({ min: 1 })
      .withMessage(createErrMsg.invalidParameter('nbPatches')),
  ],
  validateParams,
  patch.getPatches,
  pgClient.close,
  returnMsg,
];

router.get('/:idBranch/patches', getPatches);
router.get('/:idBranch/lastpatches', getPatches);

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
