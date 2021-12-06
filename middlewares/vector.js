const debug = require('debug')('vector');

const { matchedData } = require('express-validator');

const db = require('../db/db');

async function getVectors(req, _res, next) {
  debug('>>GET vectors');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;
  try {
    const vectors = await db.getLayers(req.client, idBranch);
    if (this.column) {
      req.result = { json: vectors.map((vector) => vector[this.column]), code: 200 };
    } else {
      req.result = { json: vectors, code: 200 };
    }
  } catch (error) {
    debug(error);
    req.error = error;
    // req.error = {
    //   msg: error,
    //   code: 406,
    //   function: 'getVectors',
    // };
  }
  debug('  next>>');
  next();
}

async function getVector(req, _res, next) {
  debug('>>GET vector');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idVector } = params;
  try {
    const vector = await db.getLayer(req.client, idVector);

    req.result = { json: vector, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
    // req.error = {
    //   msg: error,
    //   code: 406,
    //   function: 'getVector',
    // };
  }
  debug('  next>>');
  next();
}

async function postVector(req, _res, next) {
  debug('>>POST vector');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idBranch } = params;

  // debug(params.json.data)
  // debug(params.json.data.features.length)

  // params.json.data.features.forEach(feature => {
  //   debug("---")
  //   debug(feature.properties)
  //   debug(feature.geometry)
  // });

  try {
    const NewVector = await db.insertLayer(req.client,
      idBranch,
      params.json.data,
      params.json.metadonnees);

    req.result = {
      json: {
        msg: `vector '${params.json.metadonnees.name}' (${NewVector.features.length} feature(s)) ajouté.`,
        id: NewVector.id,
      },
      code: 200,
    };
  } catch (error) {
    debug(error);
    // to adapte later on
    if (error.constraint === 'styles_name') {
      req.error = {
        json: {
          msg: 'A vector with this name already exists.',
          function: 'insertVector',
        },
        code: 406,
      };
    } else {
      req.error = error;
    }
    // req.error = {
    //   msg: error,
    //   code: 406,
    //   function: 'postVector',
    // };
  }
  debug('  next>>');
  next();
}

async function deleteVector(req, _res, next) {
  debug('>>DELETE vector');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idVector } = params;

  try {
    const vector = await db.deleteLayer(req.client, idVector);
    req.result = { json: `vecteur '${vector.name}' détruit (sur la branche '${vector.branch_name}')`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function updateAlert(req, _res, next) {
  debug('>>UPDATE alert');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);
  const { idFeature, status, comment } = params;

  try {
    await db.updateAlert(req.client, idFeature, status, comment);
    req.result = { json: `alerte '${idFeature}' mis a jour.`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function addAnnotationLayer(req, _res, next) {
  debug('>>PUT annotation Layer');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);

  const { idBranch, name, crs } = params;

  const randomColor = Math.round(Math.random() * 0xffffff);

  const style = {
    fill: {
      color: `#${randomColor.toString(16)}`,
      opacity: 0.7,
    },
    stroke: {
      color: `#${randomColor.toString(16)}`,
    },
    point: {
      color: `#${randomColor.toString(16)}`,
      radius: 5,
    },
  };

  try {
    const vector = await db.insertLayer(req.client, idBranch, null, { name, crs, style }, true);
    req.result = { json: `annotation '${vector.name}' ajouté (sur la branche '${vector.branch_name}')`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function addAnnotation(req, _res, next) {
  debug('>>PUT annotation');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);

  const {
    idAnnotationLayer, x, y, comment,
  } = params;

  const geometry = {
    type: 'Point',
    coordinates: [x, y],
  };

  try {
    const annotation = await db.insertFeature(req.client, idAnnotationLayer, geometry, comment);

    await db.updateAlert(req.client, annotation.id_feature, undefined, comment);
    req.result = { json: `annotation '${annotation.id_feature}' ajoutée`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

module.exports = {
  getVectors,
  getVector,
  postVector,
  deleteVector,
  updateAlert,
  addAnnotationLayer,
  addAnnotation,
};
