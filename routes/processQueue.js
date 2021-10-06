const debug = require('debug')('process');
const { param } = require('express-validator');
const router = require('express').Router();
const createErrMsg = require('../paramValidation/createErrMsg');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');
const processQueue = require('../middlewares/processQueue');

router.get('/processes', 
  pgClient.open,
  processQueue.getProcesses,
  pgClient.close,
  returnMsg);


router.get('/process/:idProcess', 
  pgClient.open,
  processQueue.getProcesses,
[
  param('idProcess')
    .exists().withMessage(createErrMsg.missingParameter('id'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('id')),
],
  pgClient.close,
  returnMsg);

module.exports = router;