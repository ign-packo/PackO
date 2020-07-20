const debug = require('debug')('validateParams');
const { validationResult } = require('express-validator');

module.exports = function validateParams(req, res, next) {
  debug('~~~validateParams~~~');
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return res.status(400).json({
      status: result.array({ onlyFirstError: true })[0].msg,
      errors: result.array({ onlyFirstError: true }),
    });
  }
  debug('~~~next~~~');
  return next();
};
