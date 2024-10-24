const debug = require('debug')('mergeIm');
const router = require('express').Router();
const gdal = require('gdal-async');
const { matchedData, query } = require('express-validator');

const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');
const returnMsg = require('../middlewares/returnMsg');

router.get('/mergeImages', [
  query('im1')
    .exists().withMessage(createErrMsg.missingParameter('im1')),
  query('im2')
    .exists().withMessage(createErrMsg.missingParameter('im2')),
  query('options')
    .exists().withMessage(createErrMsg.missingParameter('options')),
  query('output')
    .exists().withMessage(createErrMsg.missingParameter('output')),
], validateParams, (req, res, next) => {
  debug('~~~mergeIm~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const {
    im1, im2, options, output,
  } = params;

  console.log('Parameters: ', params);

  console.log('start merge');
  const start = Date.now();
  const ds1 = gdal.open(im1);
  const ds2 = gdal.open(im2);
  let listOptions = ['-of', 'COG'];
  if (options.length > 0) {
    options.forEach((option) => {
      listOptions.push('-co', option);
    });
  }
  gdal.warp(output, null, [ds1, ds2], listOptions);
  ds1.close();
  ds2.close();
  const end = Date.now();
  console.log(`Complete: ${end - start} ms`);

  res.status(200).send('OK');
}, returnMsg);

module.exports = router;
