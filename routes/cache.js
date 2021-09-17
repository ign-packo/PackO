const router = require('express').Router();
const { query, body } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const cache = require('../middlewares/cache');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

router.post('/cache',
  cache.encapBody.bind({ keyName: 'overviews' }),
  [
    query('name')
      .exists().withMessage(createErrMsg.missingParameter('name')),
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

module.exports = router;
