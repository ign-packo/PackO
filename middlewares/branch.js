const { matchedData } = require('express-validator');

function validBranch(req, res, next) {
  const params = matchedData(req);
  const { idBranch } = params;
  const selectedBranches = req.app.branches.filter((item) => item.id === Number(idBranch));
  if (selectedBranches.length === 0) {
    return res.status(400).json({
      errors: 'branch does not exist',
    });
  }
  [req.selectedBranch] = selectedBranches;
  return next();
}

module.exports = {
  validBranch,
};
