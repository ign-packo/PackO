const router = require('express').Router();
const { query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const branch = require('../middlewares/branch');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

router.get('/branches',
  pgClient.open,
  branch.getBranches,
  pgClient.close,
  returnMsg);

router.post('/branch', [
  query('name')
    .exists().withMessage(createErrMsg.missingParameter('name')),
],
validateParams,
pgClient.open,
branch.insertBranch,
pgClient.close,
returnMsg);

router.delete('/branch', [
  query('branchId')
    .exists().withMessage(createErrMsg.missingParameter('branchId')),
],
validateParams,
pgClient.open,
branch.deleteBranch,
pgClient.close,
returnMsg);

module.exports = router;
