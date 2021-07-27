const { matchedData } = require('express-validator');
const debug = require('debug')('branch');

async function validBranch(req, res, next) {
  const params = matchedData(req);
  const { idBranch } = params;
  try {
    const results = await req.client.query('SELECT b.name, b.id,'
      + 'p.active, p.id, p.red, p.green, p.blue, p.image, p.num,'
      + 'p.geom from branches b, patches p where b.id = $1; ', [idBranch]);
    req.selectedBranch = results;
  } catch (error) {
    req.error = {
      msg: error.toString(),
      code: 500,
      function: 'validBranch',
    };
    debug('Erreur dans validBranch');
  }
  next();
}

async function getBranches(req, res, next) {
  try {
    const results = await req.client.query('SELECT name, id FROM branches');
    req.result = { json: results.rows, code: 200 };
  } catch (error) {
    req.error = {
      msg: error.toString(),
      code: 500,
      function: 'getBranches',
    };
  }
  next();
}

async function insertBranch(req, res, next) {
  const params = matchedData(req);
  const { name } = params;
  debug('~~~post branch~~~');
  try {
    const results = await req.client.query('INSERT INTO branches (name) values ($1) RETURNING id, name', [name]);
    req.result = { json: results.rows, code: 200 };
  } catch (error) {
    req.error = {
      msg: error.toString(),
      code: 500,
      function: 'getBranches',
    };
  }
  next();
}

module.exports = {
  validBranch,
  getBranches,
  insertBranch,
};
