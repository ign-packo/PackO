const debug = require('debug')('pgClient');
const { Pool } = require('pg');
const db = require('../db/db');

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/*
 * middleware pour la création et la libération des connexions postgresql
 */

async function open(req, res, next) {
  debug('open pg connection...');
  try {
    req.client = await pool.connect();
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
  req.client.release();
  next();
}

module.exports = {
  open,
  close,
};
