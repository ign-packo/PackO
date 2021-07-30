const router = require('express').Router();
const { query, param } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

const pgClient = require('../middlewares/pgClient');
const branch = require('../middlewares/branch');
const patch = require('../middlewares/patch');
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

router.delete('/branch/:idBranch', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('id'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('id')),
],
validateParams,
pgClient.open,
branch.validBranch,
patch.getSelectedBranchPatches,
patch.clear,
branch.deleteBranch,
pgClient.close,
returnMsg);

module.exports = router;
