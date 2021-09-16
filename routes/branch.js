const router = require('express').Router();
const { query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const branch = require('../middlewares/branch');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');

router.get('/branches',
  branch.getBranches,
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

module.exports = router;
