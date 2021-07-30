const { matchedData } = require('express-validator');
const debug = require('debug')('branch');

async function validBranch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  try {
    const results = await req.client.query('SELECT * '
      + 'FROM branches WHERE id = $1; ', [idBranch]);
    [req.selectedBranch] = results.rows;
    if (req.selectedBranch === undefined) {
      req.error = {
        msg: 'branch does not exist',
        code: 400,
        function: 'validBranch',
      };
    }
  } catch (error) {
    req.error = {
      msg: error,
      code: 400,
      function: 'validBranch',
    };
    debug('Erreur dans validBranch');
  }
  next();
}

async function getBranches(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
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

async function insertBranch(req, _res, next) {
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { name } = params;
  debug('~~~post branch~~~');
  try {
    const results = await req.client.query('INSERT INTO branches (name) values ($1) RETURNING id, name', [name]);
    req.result = { json: results.rows[0], code: 200 };
  } catch (error) {
    req.result = { json: 'A branch with this name already exists', code: 406 };
  }
  next();
}

async function deleteBranch(req, _res, next) {
  const params = matchedData(req);
  const id = Number(params.idBranch);
  debug('~~~delete branch~~~');
  debug('Id de la branche a supprimer : ', id);
  // Le cache a déjà été purgé avec un clear
  // on supprime la branche
  try {
    await req.client.query('DELETE FROM branches WHERE id=$1', [req.selectedBranch.id]);
    req.result = { json: `branch ${req.selectedBranch.id} deleted`, code: 200 };
  } catch (error) {
    req.result = { json: error, code: 406 };
  }
  next();
}

module.exports = {
  validBranch,
  getBranches,
  insertBranch,
  deleteBranch,
};
