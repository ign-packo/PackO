const debug = require('debug')('process');
const db = require('../db/db');

async function getProcesses(req, _res, next) {
  debug('~~~getProcesses~~~');
  if (req.error) {
    next();
    return;
  }
  let processes;
  try {
    processes = await db.getProcesses(req.client);
    req.result = { json: processes, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  next();
}

module.exports = {
  getProcesses,
};
