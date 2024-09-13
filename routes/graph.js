const router = require('express').Router();
const { query, param } = require('express-validator');
const cache = require('../middlewares/cache');
const branch = require('../middlewares/branch');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const graph = require('../middlewares/graph');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

router.get('/:idBranch/graph',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
    query('x')
      .exists().withMessage(createErrMsg.missingParameter('x'))
      .matches(/^\d+(.\d+)?$/i)
      .withMessage(createErrMsg.invalidParameter('x')),
    query('y')
      .exists().withMessage(createErrMsg.missingParameter('y'))
      .matches(/^\d+(.\d+)?$/i)
      .withMessage(createErrMsg.invalidParameter('y')),
  ],
  validateParams,
  branch.getCachePath,
  cache.getOverviews,
  branch.lockShared,
  graph.getGraph,
  pgClient.close,
  returnMsg);

module.exports = router;
