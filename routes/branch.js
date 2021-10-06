const router = require('express').Router();
const { param, query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const cache = require('../middlewares/cache');
const branch = require('../middlewares/branch');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

router.get('/branches',
  pgClient.open,
  cache.getCaches.bind({ column: 'id' }),
  [
    query('idCache')
      .if(query('idCache').exists())
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idCache')),
  ],
  validateParams,
  branch.getBranches,
  pgClient.close,
  returnMsg);

router.post('/branch',
  pgClient.open,
  cache.getCaches.bind({ column: 'id' }),
  [
    query('name')
      .exists().withMessage(createErrMsg.missingParameter('name')),
    query('idCache')
      .exists().withMessage(createErrMsg.missingParameter('idCache'))
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idCache')),
  ],
  validateParams,
  branch.insertBranch,
  pgClient.close,
  returnMsg);

router.delete('/branch',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    query('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.json.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  branch.deleteBranch,
  pgClient.close,
  returnMsg);

router.post('/:idBranch/rebase', [
  query('name')
    .exists().withMessage(createErrMsg.missingParameter('name')),
  query('idBase')
    .exists().withMessage(createErrMsg.missingParameter('idBase'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBase')),
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
pgClient.open,
branch.validBranch,
branch.getOverviews,
branch.rebase,
pgClient.close,
returnMsg);

module.exports = router;
