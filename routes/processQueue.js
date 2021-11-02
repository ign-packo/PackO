const { param } = require('express-validator');
const router = require('express').Router();
const createErrMsg = require('../paramValidation/createErrMsg');
const pgClient = require('../middlewares/pgClient');
const returnMsg = require('../middlewares/returnMsg');
const processQueue = require('../middlewares/processQueue');
const validateParams = require('../paramValidation/validateParams');

router.get('/processes',
  pgClient.open,
  processQueue.getProcesses,
  pgClient.close,
  returnMsg);

router.get('/process/:idProcess',
  pgClient.open,
  processQueue.getProcesses.bind({ column: 'id' }),
  [
    param('idProcess')
      .custom((value, { req }) => value in req.processes)
      .withMessage(createErrMsg.invalidParameter('idProcess')),
  ],
  validateParams,
  processQueue.getProcess,
  pgClient.close,
  returnMsg);

module.exports = router;
