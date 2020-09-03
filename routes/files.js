const debug = require('debug')('files');
const router = require('express').Router();
const { matchedData, param } = require('express-validator');
const path = require('path');
const fs = require('fs');

const validateParams = require('../paramValidation/validateParams');

router.get('/json/:typefile', [
  param('typefile')
    .exists().withMessage(' le type de fichier est requis')
    .isIn(['ortho', 'graph', 'opi'])
    .withMessage("le fichier demandé n'existe pas"),
], validateParams,
(req, res) => {
  debug('~~~getJson~~~');
  const params = matchedData(req);
  const { typefile } = params;

  const filePath = path.join('itowns', `${typefile}.json`);

  try {
    if (!fs.existsSync(filePath)) {
      const err = new Error();
      err.code = 404;
      err.msg = {
        status: "Le fichier demandé n'existe pas",
        errors: [{
          localisation: 'GET /json/',
          param: `${typefile}`,
          value: `${typefile}`,
          msg: "Le fichier demandé n'existe pas",
        }],
      };
      throw err;
    }
  } catch (err) {
    res.status(err.code).send(err.msg);
  }

  res.status(200).download(filePath);
});

module.exports = router;
