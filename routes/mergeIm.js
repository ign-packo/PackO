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
    im1, im2, output,
  } = params;

  console.log('Parameters: ', params);

  console.log('start merge');
  const start = Date.now();
  const ds1 = gdal.open(im1);
  const ds2 = gdal.open(im2);
  gdal.warp(output, null, [ds1, ds2], ['-of', 'COG', '-co', 'COMPRESS=JPEG', '-co', 'QUALITY=90']);
  ds1.close();
  ds2.close();
  const end = Date.now();
  console.log(`Complete: ${end - start} ms`);

  res.status(200).send('OK');
}, returnMsg);

module.exports = router;
