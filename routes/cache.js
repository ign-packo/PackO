const router = require('express').Router();
const { query, body } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const cache = require('../middlewares/cache');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

const overviews = [
  body('overviews')
    .exists().withMessage(createErrMsg.missingBody),
  body('overviews.identifier')
    .exists().withMessage(createErrMsg.missingParameter('identifier')),
  body('overviews.list_OPI')
    .exists().withMessage(createErrMsg.missingParameter('list_OPI')),
  body('overviews.crs')
    .exists().withMessage(createErrMsg.missingParameter('crs')),
  body('overviews.crs.type')
    .exists().withMessage(createErrMsg.missingParameter('crs.type')),
  body('overviews.crs.code')
    .exists().withMessage(createErrMsg.missingParameter('crs.code')),
  body('overviews.crs.boundingBox')
    .exists().withMessage(createErrMsg.missingParameter('crs.boundingBox')),
  body('overviews.crs.boundingBox.xmin')
    .exists().withMessage(createErrMsg.missingParameter('crs.boundingBox.xmin')),
  body('overviews.crs.boundingBox.xmax')
    .exists().withMessage(createErrMsg.missingParameter('crs.boundingBox.xmax')),
  body('overviews.crs.boundingBox.ymin')
    .exists().withMessage(createErrMsg.missingParameter('crs.boundingBox.ymin')),
  body('overviews.crs.boundingBox.ymax')
    .exists().withMessage(createErrMsg.missingParameter('crs.boundingBox.ymax')),
  body('overviews.crs.proj4Definition')
    .exists().withMessage(createErrMsg.missingParameter('crs.proj4Definition')),
  body('overviews.resolution')
    .exists().withMessage(createErrMsg.missingParameter('resolution')),
  body('overviews.level')
    .exists().withMessage(createErrMsg.missingParameter('level')),
  // body('overviews.level.min')
  //   .exists().withMessage(createErrMsg.missingParameter('level.min')),
  body('overviews.level.max')
    .exists().withMessage(createErrMsg.missingParameter('level.max')),
  body('overviews.tileSize')
    .exists().withMessage(createErrMsg.missingParameter('tileSize')),
  body('overviews.tileSize.width')
    .exists().withMessage(createErrMsg.missingParameter('tileSize.width')),
  body('overviews.tileSize.height')
    .exists().withMessage(createErrMsg.missingParameter('tileSize.height')),
  body('overviews.slabSize')
    .exists().withMessage(createErrMsg.missingParameter('slabSize')),
  body('overviews.slabSize.width')
    .exists().withMessage(createErrMsg.missingParameter('slabSize.width')),
  body('overviews.slabSize.height')
    .exists().withMessage(createErrMsg.missingParameter('slabSize.height')),
  body('overviews.dataSet')
    .exists().withMessage(createErrMsg.missingParameter('dataSet')),
  body('overviews.dataSet.boundingBox')
    .exists().withMessage(createErrMsg.missingParameter('dataSet.boundingBox')),
  body('overviews.dataSet.boundingBox.LowerCorner')
    .exists().withMessage(createErrMsg.missingParameter('dataSet.boundingBox.LowerCorner')),
  body('overviews.dataSet.boundingBox.UpperCorner')
    .exists().withMessage(createErrMsg.missingParameter('dataSet.boundingBox.UpperCorner')),
  body('overviews.dataSet.limits')
    .exists().withMessage(createErrMsg.missingParameter('dataSet.limits')),
];

router.get('/caches',
  pgClient.open,
  cache.getCaches,
  pgClient.close,
  returnMsg);

router.post('/cache',
  cache.encapBody.bind({ keyName: 'overviews' }),
  [
    query('name')
      .exists().withMessage(createErrMsg.missingParameter('name')),
    query('path')
      .exists().withMessage(createErrMsg.missingParameter('path')),
    ...overviews,
  ],
  validateParams,
  pgClient.open,
  cache.postCache,
  pgClient.close,
  returnMsg);

router.delete('/cache',
  pgClient.open,
  cache.getCaches.bind({ column: 'id' }),
  [
    query('idCache')
      .exists().withMessage(createErrMsg.missingParameter('idCache'))
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idCache')),
  ],
  validateParams,
  cache.deleteCache,
  pgClient.close,
  returnMsg);

module.exports = router;
