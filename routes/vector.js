const router = require('express').Router();
const {
  param, query, body, oneOf,
} = require('express-validator');
const GJV = require('geojson-validation');
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
];

router.get('/:idBranch/vectors',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  vector.getVectors,
  pgClient.close,
  returnMsg);

router.get('/:idBranch/vector',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idBranch')),
  validateParams,
  vector.getVectors.bind({ column: 'name' }),
  query('name')
    .exists().withMessage(createErrMsg.missingParameter('name'))
    .custom((value, { req }) => req.result.getVectors.includes(value))
    .withMessage(createErrMsg.invalidParameter('name')),
  validateParams,
  vector.getVector,
  pgClient.close,
  returnMsg);

router.post('/:idBranch/vector', encapBody.bind({ keyName: 'json' }),
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
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
  vector.postVector,
  pgClient.close,
  returnMsg);

router.get('/vector',
  pgClient.open,
  vector.getVectors.bind({ column: 'id' }),
  query('idVector')
    .exists().withMessage(createErrMsg.missingParameter('idVector'))
    .custom((value, { req }) => req.result.getVectors.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idVector')),
  validateParams,
  vector.getVector,
  pgClient.close,
  returnMsg);

router.delete('/vector',
  pgClient.open,
  vector.getVectors.bind({ column: 'id' }),
  query('idVector')
    .exists().withMessage(createErrMsg.missingParameter('idVector'))
    .custom((value, { req }) => req.result.getVectors.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idVector')),
  validateParams,
  vector.deleteVector,
  pgClient.close,
  returnMsg);

router.put('/vector/:idFeature',
  pgClient.open,
  vector.getFeatures.bind({ column: 'id' }),
  param('idFeature')
    .exists().withMessage(createErrMsg.missingParameter('idFeature'))
    .custom((value, { req }) => req.result.getFeatures.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idFeature')),
  oneOf([
    query('status')
      .exists().withMessage(createErrMsg.missingParameter('status')),
    query('comment')
      .exists().withMessage(createErrMsg.missingParameter('comment')),
  ]),
  validateParams,
  vector.updateAlert,
  pgClient.close,
  returnMsg);

router.put('/:idRemarksVector/feature',
  pgClient.open,
  vector.getVectors.bind({ column: 'id', selection: { column: 'name', value: 'Remarques' } }),
  param('idRemarksVector')
    .exists().withMessage(createErrMsg.missingParameter('idRemarksVector'))
    .custom((value, { req }) => req.result.getVectors.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idRemarksVector')),
  query('x')
    .exists().withMessage(createErrMsg.missingParameter('x')),
  query('y')
    .exists().withMessage(createErrMsg.missingParameter('y')),
  query('comment')
    .exists().withMessage(createErrMsg.missingParameter('comment')),
  validateParams,
  vector.addRemark,
  pgClient.close,
  returnMsg);

router.delete('/:idRemarksVector/feature',
  pgClient.open,
  vector.getVectors.bind({ column: 'id', selection: { column: 'name', value: 'Remarques' } }),
  param('idRemarksVector')
    .exists().withMessage(createErrMsg.missingParameter('idRemarksVector'))
    .custom((value, { req }) => req.result.getVectors.includes(Number(value)))
    .withMessage(createErrMsg.invalidParameter('idRemarksVector')),
  query('id')
    .exists().withMessage(createErrMsg.missingParameter('id')),
  validateParams,
  vector.delRemark,
  pgClient.close,
  returnMsg);

module.exports = router;
