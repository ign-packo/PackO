const debug = require('debug')('vector');
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const {
  matchedData, param, query, body,
} = require('express-validator');
const GJV = require('geojson-validation');
const branch = require('../middlewares/branch');
const validateParams = require('../paramValidation/validateParams');
const createErrMsg = require('../paramValidation/createErrMsg');

// Dossier contenant les differents fichiers
const parentDir = `${global.dir_cache}`;

const vectorToSave = [
  body('json.data')
    .exists().withMessage(createErrMsg.missingParameter('data'))
    .custom(GJV.isGeoJSONObject)
    .withMessage(createErrMsg.invalidBody('objet GeoJSON'))
    .custom(GJV.isFeatureCollection)
    .withMessage(createErrMsg.invalidBody('featureCollection')),
  body('json.data.type')
    .exists().withMessage(createErrMsg.missingParameter('type'))
    .isIn(['FeatureCollection'])
    .withMessage(createErrMsg.invalidParameter('type')),
  // body('json.data.crs')
  //   .exists().withMessage(createErrMsg.missingParameter('crs'))
  //   .custom(validator.isCrs)
  //   .withMessage(createErrMsg.invalidParameter('crs')),
  body('json.data.features.*.geometry')
    .custom(GJV.isPolygon).withMessage(createErrMsg.InvalidEntite('geometry', 'polygon')),
  // body('geoJSON.features.*.properties.color')
  //   .exists().withMessage(createErrMsg.missingParameter('properties.color'))
  //   .custom(validator.isColor)
  //   .withMessage(createErrMsg.invalidParameter('properties.color')),
  // body('geoJSON.features.*.properties.cliche')
  //   .exists().withMessage(createErrMsg.missingParameter('properties.cliche'))
  //   .matches(/^[a-zA-Z0-9-_]+$/i)
  //   .withMessage(createErrMsg.invalidParameter('properties.cliche')),
];

router.get('/vectors',
  (req, res) => {
    debug('~~~GET vectors');

    const filePath = path.join(parentDir, 'vector', 'vectors.json');

    debug(filePath);

    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '{"0":[]}');
      }
      debug(' => download');
      res.status(200).download(filePath);
    } catch (err) {
      debug(' => Erreur');
      res.status(err.code).send(err.msg);
    }
  });

router.get('/:idBranch/vectors', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~GET idBranch/vectors');
  const params = matchedData(req);
  const { idBranch } = params;

  const filePath = path.join(parentDir, 'vector', `vectors_${idBranch}.json`);

  debug(filePath);

  try {
    if (!fs.existsSync(filePath)) {
      // const err = new Error();
      // err.code = 404;
      // err.msg = {
      //   status: createErrMsg.missingFile(`vector_${idBranch}.json`),
      //   errors: [{
      //     localisation: 'GET /{idBranch}/vectors',
      //     param: 'idBranch',
      //     value: `${idBranch}`,
      //     msg: createErrMsg.missingFile(`vector_${idBranch}.json`),
      //   }],
      // };
      // throw err;

      fs.writeFileSync(filePath, '[]');
    }
    debug(' => download');
    res.status(200).download(filePath);
  } catch (err) {
    debug(' => Erreur');
    res.status(err.code).send(err.msg);
  }
});

router.get('/:idBranch/vector/:idVector', [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
  param('idVector')
    .exists().withMessage(createErrMsg.missingParameter('idVector'))
    .isInt({ min: 1 })
    .withMessage(createErrMsg.invalidParameter('idVector')),
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~GET vector/idVector');
  const params = matchedData(req);
  const { idBranch, idVector } = params;

  const filePath = path.join(parentDir, 'vector', idBranch.toString(), `data_${idVector}.geojson`);

  debug(filePath);

  try {
    if (!fs.existsSync(filePath)) {
      const err = new Error();
      err.code = 404;
      err.msg = {
        status: createErrMsg.missingFile(`vector_${idBranch}.json`),
        errors: [{
          localisation: 'GET /{idBranch}/vectors',
          param: 'idBranch',
          value: `${idBranch}`,
          msg: createErrMsg.missingFile(`vector_${idBranch}.json`),
        }],
      };
      throw err;
    }
    debug(' => download');
    res.status(200).download(filePath);
  } catch (err) {
    debug(' => Erreur');
    res.status(err.code).send(err.msg);
  }
});

// Encapsulation des informations du requestBody dans une nouvelle clé 'keyName' ("body" par defaut)
function encapBody(req, res, next) {
  let keyName = 'body';
  if (this.keyName) { keyName = this.keyName; }
  if (JSON.stringify(req.body) !== '{}') {
    const requestBodyKeys = Object.keys(req.body);
    req.body[keyName] = JSON.parse(JSON.stringify(req.body));
    for (let i = 0; i < requestBodyKeys.length; i += 1) {
      delete req.body[requestBodyKeys[i]];
    }
  }
  next();
}

router.post('/:idBranch/vector', encapBody.bind({ keyName: 'json' }), [
  param('idBranch')
    .exists().withMessage(createErrMsg.missingParameter('idBranch'))
    .isInt({ min: 0 })
    .withMessage(createErrMsg.invalidParameter('idBranch')),
  query('idVector')
    .exists().withMessage(createErrMsg.missingParameter('idVector'))
    .isInt({ min: 1 })
    .withMessage(createErrMsg.invalidParameter('idVector')),
  body('json')
    .exists().withMessage(createErrMsg.missingBody),
  body('json'.metadonnees)
    .exists().withMessage(createErrMsg.missingParameter('metadonnees')),
  ...vectorToSave,
],
validateParams,
branch.validBranch,
(req, res) => {
  debug('~~~POST vector');
  const params = matchedData(req);
  const { idBranch, idVector } = params;

  // const filePath = path.join(parentDir, 'vector', `vectors_${idBranch}.json`);
  const filePath = path.join(parentDir, 'vector', 'vectors.json');
  const filePath2 = path.join(parentDir, 'vector', idBranch.toString(), `data_${idVector}.geojson`);

  debug(filePath);

  try {
    // fs.writeFile(filePath, JSON.stringify(params.json.metadonnees), 'utf8', (err) => {
    //   if (err) {
    //     console.log('An error occured while writing JSON Object to File.');
    //     return console.log(err);
    //   }

    //   console.log('JSON file has been saved.');
    //   return 'DONE';
    // });
    if (!fs.existsSync(path.join(parentDir, 'vector', idBranch.toString()))) {
      fs.mkdirSync(path.join(parentDir, 'vector', idBranch.toString()));
    }
    fs.writeFileSync(filePath, JSON.stringify(params.json.metadonnees), null, 4);
    fs.writeFileSync(filePath2, JSON.stringify(params.json.data), null, 4);

    // if (!fs.existsSync(filePath)) {
    //   const err = new Error();
    //   err.code = 404;
    //   err.msg = {
    //     status: createErrMsg.missingFile(`vector_${idBranch}.json`),
    //     errors: [{
    //       localisation: 'GET /{idBranch}/vectors',
    //       param: 'idBranch',
    //       value: `${idBranch}`,
    //       msg: createErrMsg.missingFile(`vector_${idBranch}.json`),
    //     }],
    //   };
    //   throw err;
    // }

    debug(' => download');
    res.status(200).send(`'vectors_${idBranch}.json' updated`);
  } catch (err) {
    debug(' => Erreur');
    res.status(err.code).send(err.msg);
  }
});

module.exports = router;
