const router = require('express').Router();
const { query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const cache = require('../middlewares/cache');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

router.post('/cache',[
    query('name')
      .exists().withMessage(createErrMsg.missingParameter('name')),
  ],
    validateParams,
    pgClient.open,
    cache.insertCache,
    pgClient.close,
    returnMsg);

module.exports = router;