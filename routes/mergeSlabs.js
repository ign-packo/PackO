const debug = require('debug')('mergeSlabs');
const router = require('express').Router();
const gdal = require('gdal-async');
const { matchedData, query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const returnMsg = require('../middlewares/returnMsg');

router.get('/mergeSlabs', [
  query('slabs')
    .exists().withMessage(createErrMsg.missingParameter('slabs')),
  query('options')
    .exists().withMessage(createErrMsg.missingParameter('options')),
  query('output')
    .exists().withMessage(createErrMsg.missingParameter('output')),
], validateParams, (req, res, next) => {
  debug('~~~mergeSlabs~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const {
    slabs, options, output,
  } = params;

  console.log('Parameters: ', params);

  console.log('start merge');
  const start = Date.now();
  const listDs = [];
  slabs.forEach((img) => {
    const ds = gdal.open(img);
    listDs.push(ds);
  });
  const listOptions = ['-of', 'COG'];
  if (options.length > 0) {
    options.forEach((option) => {
      listOptions.push('-co', option);
    });
  }
  gdal.warp(output, null, listDs, listOptions);
  listDs.forEach((ds) => {
    ds.close();
  });
  const end = Date.now();
  console.log(`Complete: ${end - start} ms`);

  res.status(200).send('OK');
}, returnMsg);

module.exports = router;
