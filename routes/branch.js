const router = require('express').Router();
const { query, param } = require('express-validator');

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
  branch.postBranch,
  pgClient.close,
  returnMsg);

router.delete('/branch',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    query('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  branch.deleteBranch,
  pgClient.close,
  returnMsg);

router.post('/:idBranch/rebase',
  pgClient.open,
  branch.getBranches.bind({ column: 'id' }),
  [
    query('name')
      .exists().withMessage(createErrMsg.missingParameter('name')),
    query('idBase')
      .exists().withMessage(createErrMsg.missingParameter('idBase'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBase')),
    param('idBranch')
      .exists().withMessage(createErrMsg.missingParameter('idBranch'))
      .custom((value, { req }) => req.result.getBranches.includes(Number(value)))
      .withMessage(createErrMsg.invalidParameter('idBranch')),
  ],
  validateParams,
  branch.getCachePath,
  cache.getOverviews,
  branch.rebase,
  returnMsg);

module.exports = router;
