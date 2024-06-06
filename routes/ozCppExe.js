const debug = require('debug')('ozCpp');
const router = require('express').Router();
const { matchedData, query } = require('express-validator');
const { execFile } = require('child_process');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const returnMsg = require('../middlewares/returnMsg');

const ozExe = process.env.OZEXE;

router.get('/ozCppExe', [
  query('refOpi')
    .exists().withMessage(createErrMsg.missingParameter('refOpi')),
  query('secOpi')
    .exists().withMessage(createErrMsg.missingParameter('secOpi')),
  query('patch')
    .exists().withMessage(createErrMsg.missingParameter('patch')),
  query('graph')
    .exists().withMessage(createErrMsg.missingParameter('graph')),
  query('weightDiffCost') // value btwn 0 and 1
    .exists().withMessage(createErrMsg.missingParameter('weightDiffCost')),
  query('minCost')
    .exists().withMessage(createErrMsg.missingParameter('minCost')),
  query('tension')
    .exists().withMessage(createErrMsg.missingParameter('tension')),
  query('border')
    .exists().withMessage(createErrMsg.missingParameter('border')),
  query('outDir')
    .exists().withMessage(createErrMsg.missingParameter('outDir')),
], validateParams, (req, res, next) => {
  debug('~~~ozCppExe~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const {
    refOpi, secOpi, patch, graph, weightDiffCost, minCost, tension, border, outDir,
  } = params;

  console.log('Parameters: ', params);

  execFile(ozExe, ['-r', `${refOpi}`, '-s', `${secOpi}`,
    '-p', `${patch}`, '-g', `${graph}`,
    '-w', `${weightDiffCost}`, '-m', `${minCost}`,
    '-t', `${tension}`, '-b', `${border}`,
    '-o', `${outDir}`], (err, stdout) => {
    if (err) {
      console.log(stdout);
      console.log(err);
      res.status(400).send(stdout + err);
    } else {
      console.log(stdout);
      res.status(200).send(`${stdout} OK`);
    }
  });
},
returnMsg);

module.exports = router;
