const router = require('express').Router();
const { query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const branch = require('../middlewares/branch');
const returnMsg = require('../middlewares/returnMsg');

router.get('/branches',
  branch.getBranches,
  returnMsg);

router.post('/branch', [
  query('name')
    .exists().withMessage(createErrMsg.missingParameter('name')),
],
validateParams,
branch.insertBranch,
returnMsg);

module.exports = router;
