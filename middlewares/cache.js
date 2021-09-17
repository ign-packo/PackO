const debug = require('debug')('cache');
const { matchedData } = require('express-validator');

function insertCache(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { name } = params;
  debug(name);
  req.result = { json: {name}, code: 200 };
  next();
}

module.exports = {
  insertCache,
};
