const debug = require('debug')('pgClient');
const { Client } = require('pg');
const db = require('../db/db');

/*
 * middleware pour la création et la libération des connexions postgresql
 */

async function open(req, res, next) {
  debug('open pg connection...');
  try {
    req.client = new Client({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: process.env.PGPORT,
    });
    await req.client.connect();
    await db.beginTransaction(req.client);
    debug('transaction ouverte');
    next();
  } catch (error) {
    debug(error);
    req.error = {
      msg: error.toString(),
      code: 500,
      function: 'pgClient open',
    };
    res.status(req.error.code).json(req.error);
  }
}

async function close(req, _res, next) {
  debug('close pg connection...');
  try {
    await db.endTransaction(req.client, !(req.error));
  } catch (error) {
    req.error = {
      msg: error.toString(),
      code: 500,
      function: 'pgClient close commit',
    };
  }
  req.client.end();
  next();
}

module.exports = {
  open,
  close,
};
