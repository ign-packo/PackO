const router = require('express').Router();
const { param, query, body } = require('express-validator');
const GJV = require('geojson-validation');
const cache = require('../middlewares/cache');
const branch = require('../middlewares/branch');
const vector = require('../middlewares/vector');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

// Encapsulation des informations du requestBody dans une nouvelle clé 'keyName' ("body" par defaut)
function encapBody(req, res, next) {
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

const vectorToSave = [
  body('json.data')
    .exists().withMessage(createErrMsg.missingParameter('data'))
    .custom(GJV.isGeoJSONObject)
    .withMessage(createErrMsg.invalidBody('objet GeoJSON'))
    .custom(GJV.isFeatureCollection)
    .withMessage(createErrMsg.invalidBody('featureCollection')),
  body('json.data.type')
    .exists().withMessage(createErrMsg.missingParameter('data.type'))
    .isIn(['FeatureCollection'])
    .withMessage(createErrMsg.invalidParameter('data.type')),
  // body('json.data.crs')
  //   .exists().withMessage(createErrMsg.missingParameter('crs'))
  //   .custom(validator.isCrs)
  //   .withMessage(createErrMsg.invalidParameter('crs')),
  body('json.data.features.*.geometry')
    .custom(GJV.isPolygon).withMessage(createErrMsg.InvalidEntite('data.features.*.geometry', 'polygon')),
  // body('geoJSON.features.*.properties.color')
  //   .exists().withMessage(createErrMsg.missingParameter('properties.color'))
  //   .custom(validator.isColor)
  //   .withMessage(createErrMsg.invalidParameter('properties.color')),
  // body('geoJSON.features.*.properties.cliche')
  //   .exists().withMessage(createErrMsg.missingParameter('properties.cliche'))
  //   .matches(/^[a-zA-Z0-9-_]+$/i)
  //   .withMessage(createErrMsg.invalidParameter('properties.cliche')),
];

router.get('/:idBranch/vectors',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  cache.getCachePath,
  vector.getVectors,
  pgClient.close,
  returnMsg);

router.get('/:idBranch/vector',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .custom((value, { req }) => req.result.json.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idBranch')),
  validateParams,
  vector.getVectors.bind({ column: 'id' }),
  query('idVector')
    .exists().withMessage(createErrMsg.missingParameter('idVector'))
    .custom((value, { req }) => req.result.json.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idVector')),
  validateParams,
  cache.getCachePath,
  vector.getVector,
  pgClient.close,
  returnMsg);

router.post('/:idBranch/vector', encapBody.bind({ keyName: 'json' }),
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
    body('json')
      .exists().withMessage(createErrMsg.missingBody),
    body('json'.metadonnees)
      .exists().withMessage(createErrMsg.missingParameter('metadonnees')),
    ...vectorToSave,
  ],
  validateParams,
  cache.getCachePath,
  vector.postVector,
  pgClient.close,
  returnMsg);

module.exports = router;
