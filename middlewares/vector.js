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
    let vectors = await db.getLayers(req.client, idBranch);
    if (this.column) {
      // req.result = { json: vectors.map((vector) => vector[this.column]), code: 200 };
      if (!req.result) req.result = {};
      if (this.selection) {
        vectors = vectors.filter((vect) => vect[this.selection.column] === this.selection.value);
      }
      req.result.getVectors = vectors
        .map((vector) => vector[this.column]);
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
  const idVector = typeof params.idVector === 'undefined' ? params : params.idVector;
  // let { idVector } = params;
  // if (typeof idVector === 'undefined') {
  //   idVector = params;
  // }
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

async function getFeatures(req, _res, next) {
  debug('>>GET getFeatures');
  if (req.error) {
    next();
    return;
  }
  try {
    const features = await db.getFeatures(req.client);
    if (this.column) {
      // req.result = { getFeatures: features.map((feature) => feature[this.column]), code: 200 };
      if (!req.result) req.result = {};
      req.result.getFeatures = features.map((feature) => feature[this.column]);
    } else {
      req.result = { json: features, code: 200 };
    }
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
    const vector = await db.updateAlert(req.client, idFeature, status, comment);
    req.result = { json: `feature '${vector.id_feature}' mis à jour`, code: 200 };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function addRemark(req, _res, next) {
  debug('>>PUT remark');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);

  const { x, y, comment } = params;
  const idLayer = params.idRemarksVector;

  const geometry = {
    type: 'Point',
    coordinates: [x, y],
  };

  try {
    const remark = await db.insertFeature(req.client, idLayer, geometry, comment);

    await db.updateAlert(req.client, remark.id_feature, undefined, comment);
    req.result = {
      json: {
        msg: `un point a été ajouté aux coordonnées ${x},${y} sur la couche 'Remarques' (id : ${idLayer})`,
        idFeature: remark.id_feature,
      },
      code: 200,
    };
  } catch (error) {
    debug(error);
    req.error = error;
  }
  debug('  next>>');
  next();
}

async function delRemark(req, _res, next) {
  debug('>>DELETE remark');
  if (req.error) {
    next();
    return;
  }
  const params = matchedData(req);

  const { id } = params;

  try {
    const remark = await db.deleteFeature(req.client, id);

    req.result = {
      json: {
        msg: `le point '${remark.id_feature}' a été supprimé de la couche 'Remarques' (id : ${remark.id_layer})`,
        idLayer: remark.id_layer,
      },
      code: 200,
    };
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
  getFeatures,
  updateAlert,
  addRemark,
  delRemark,
};
