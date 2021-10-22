const debug = require('debug')('processes');
const { matchedData } = require('express-validator');
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
    if (this.column) {
      req.processes = {};
      processes.forEach((P) => {
        req.processes[P[this.column]] = P;
      });
    } else {
      req.result = { json: processes, code: 200 };
    }
  } catch (error) {
    debug(error);
    req.error = error;
  }
  next();
}

async function getProcess(req, _res, next) {
  debug('~~~getProcesses~~~');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idProcess } = params;
  req.result = { json: req.processes[idProcess], code: 200 };
  next();
}

module.exports = {
  getProcesses,
  getProcess,
};
