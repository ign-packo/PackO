const debug = require('debug')('process');
const { matchedData, param } = require('express-validator');
const router = require('express').Router();
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/processes', (req, res) => {
  debug('~~~get processes~~~');
  res.status(200).send(JSON.stringify(req.app.processes));
});

router.get('/process/:idProcess', [
  param('idProcess')
    .exists().withMessage(createErrMsg.missingParameter('id'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('id')),
],
(req, res) => {
  const params = matchedData(req);
  const id = Number(params.idProcess);
  debug('~~~get process~~~');
  debug('Id du traitement : ', id);
  req.app.processes.forEach((process) => {
    if (process.id === id) {
      res.status(200).send(JSON.stringify(process));
    }
  });
  res.status(406).send('unkown process');
});

module.exports = router;
