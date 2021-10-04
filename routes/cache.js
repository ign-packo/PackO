const router = require('express').Router();
const { query, body } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const cache = require('../middlewares/cache');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

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
    body('overviews')
      .exists().withMessage(createErrMsg.missingBody),
    body('overviews.list_OPI')
      .exists().withMessage(createErrMsg.missingParameter('list_OPI')),
  ],
  validateParams,
  pgClient.open,
  cache.insertCache,
  pgClient.close,
  returnMsg);

router.delete('/cache',
  [
    query('idCache')
      .exists().withMessage(createErrMsg.missingParameter('idCache'))
      .isInt({ min: 0 })
      .withMessage(createErrMsg.invalidParameter('idCache')),
  ],
  validateParams,
  pgClient.open,
  cache.deleteCache,
  pgClient.close,
  returnMsg);

module.exports = router;
