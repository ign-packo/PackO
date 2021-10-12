const debug = require('debug')('validateParams');
const { validationResult } = require('express-validator');

module.exports = function validateParams(req, res, next) {
  if (req.error) {
    next();
    return;
  }
  debug('~~~validateParams~~~');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.error = {
      json: errors.array().map((error) => ({
        status: error.msg,
        error,
      })),
      code: 400,
    };
  }
  debug('~~~next~~~');
  next();
};
