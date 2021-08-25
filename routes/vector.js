// const fs = require('fs');
// const path = require('path');
const debug = require('debug')('vector');
const router = require('express').Router();
const { matchedData, param } = require('express-validator');

const serveur = require('../serveur');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

router.get('/:idBranch/vectors', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch'))
    .isIn(Object.keys(serveur.branches))
    .withMessage('branch does not exist'),
], validateParams,
(req, res) => {
  debug('~~~GET vectors');
  const { idBranch } = matchedData(req);

  const testbranch = req.app.branches.filter((item) => item.id === Number(idBranch));
  res.status(200).send(JSON.stringify(testbranch));
});

module.exports = router;
