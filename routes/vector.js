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
    .if(body('json.data').exists())
    .custom(GJV.isGeoJSONObject)
    .withMessage(createErrMsg.invalidBody('objet GeoJSON'))
    .if(body('json.data').exists())
    .custom(GJV.isFeatureCollection)
    .withMessage(createErrMsg.invalidBody('featureCollection')),
  body('json.data.type')
    .if(body('json.data').exists())
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
      // .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  vector.getVectors,
  pgClient.close,
  returnMsg);

router.get('/vector',
  pgClient.open,
  vector.getVectors.bind({ column: 'id' }),
  query('idVector')
    .exists().withMessage(createErrMsg.missingParameter('idVector'))
    .custom((value, { req }) => req.result.json.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idVector')),
  validateParams,
  vector.getVector,
  pgClient.close,
  returnMsg);

router.post('/:idBranch/vector', encapBody.bind({ keyName: 'json' }),
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      // .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
    body('json')
      .exists().withMessage(createErrMsg.missingBody),
    body('json.metadonnees')
      .exists().withMessage(createErrMsg.missingParameter('metadonnees')),
    body('json.metadonnees.name')
      .if(body('json.metadonnees').exists())
      .exists().withMessage(createErrMsg.missingParameter('metadonnees.name')),
    body('json.metadonnees.crs')
      .if(body('json.metadonnees').exists())
      .exists().withMessage(createErrMsg.missingParameter('metadonnees.crs')),
    body('json.metadonnees.style')
      .if(body('json.metadonnees').exists())
      .exists().withMessage(createErrMsg.missingParameter('metadonnees.style')),
    ...vectorToSave,
  ],
  validateParams,
  cache.getCachePath,
  vector.postVector,
  pgClient.close,
  returnMsg);

router.delete('/vector',
  pgClient.open,
  vector.getVectors.bind({ column: 'id' }),
  query('idVector')
    .exists().withMessage(createErrMsg.missingParameter('idVector'))
    .custom((value, { req }) => req.result.json.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idVector')),
  validateParams,
  vector.deleteVector,
  pgClient.close,
  returnMsg);

module.exports = router;
