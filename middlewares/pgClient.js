const debug = require('debug')('pgClient');
const { Client } = require('pg');

/*
 * middleware pour la création et la libération des connexions postgresql
 */

async function openTransaction() {
  debug('open pg connection...');
  const client = new Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
  });
  await client.connect();
  await client.query('BEGIN');
  debug('transaction ouverte');
  return client;
}

async function closeTransaction(client, error) {
  debug('close pg connection...');
  if (error) {
    debug('rollback');
    await client.query('ROLLBACK');
  } else {
    debug('commit');
    await client.query('COMMIT');
  }
  client.end();
}

async function open(req, res, next) {
  try {
    req.client = await openTransaction();
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
  try {
    closeTransaction(req.client, req.error);
  } catch (error) {
    req.error = {
      msg: error.toString(),
      code: 500,
      function: 'pgClient close commit',
    };
  }
  next();
}

module.exports = {
  openTransaction,
  closeTransaction,
  open,
  close,
};
