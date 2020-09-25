const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const debugServer = require('debug')('serveur');
const debug = require('debug');
const path = require('path');

const { argv } = require('yargs');

const nocache = require('nocache');

const app = express();

global.dir_cache = argv.cache ? argv.cache : 'cache';
debug.log(`using cache directory: ${global.dir_cache}`);

// const { debug_list_of_fonts } = require('pureimage/src/text');
const wmts = require('./routes/wmts.js');
const graph = require('./routes/graph.js');
const files = require('./routes/files.js');
const patchs = require('./routes/patchs.js');
// const { debug_list_of_fonts } = require('pureimage/src/text');

try {
  // desactive la mise en cache des images par le navigateur - OK Chrome/Chromium et Firefox
  // effet : maj autom apres saisie - OK Chrome/Chromium, Pas OK Firefox
  app.use(nocache());

  const PORT = argv.port ? argv.port : 8081;

  // on charge les mtd du cache
  app.cache_mtd = JSON.parse(fs.readFileSync(path.join(global.dir_cache, 'cache_mtd.json')));
  app.overviews = JSON.parse(fs.readFileSync(path.join(global.dir_cache, 'overviews.json')));

  app.tileSet = JSON.parse(fs.readFileSync(`${global.dir_cache}/tileSet.json`));

  try {
    app.activePatchs = JSON.parse(fs.readFileSync(`${global.dir_cache}/activePatchs.geojson`));
  } catch (err) {
    app.activePatchs = {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: {
        type: 'name',
        properties: {
          name: 'urn:ogc:def:crs:EPSG::2154',
        },
      },
      features: [],
    };
    fs.writeFileSync(`${global.dir_cache}/activePatchs.geojson`, JSON.stringify(app.activePatchs));
  }

  try {
    app.unactivePatchs = JSON.parse(fs.readFileSync(`${global.dir_cache}/unactivePatchs.geojson`));
  } catch (err) {
    app.unactivePatchs = {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: {
        type: 'name',
        properties: {
          name: 'urn:ogc:def:crs:EPSG::2154',
        },
      },
      features: [],
    };
    fs.writeFileSync(`${global.dir_cache}/unactivePatchs.geojson`, JSON.stringify(app.unactivePatchs));
  }
  // on trouve l'Id du prochain patch (max des Id + 1)
  app.currentPatchId = 0;
  for (let i = 0; i < app.activePatchs.features.length; i += 1) {
    const id = app.activePatchs.features[i].properties.patchId + 1;
    if (app.currentPatchId < id) app.currentPatchId = id;
  }
  for (let i = 0; i < app.unactivePatchs.features.length; i += 1) {
    const id = app.unactivePatchs.features[i].properties.patchId + 1;
    if (app.currentPatchId < id) app.currentPatchId = id;
  }
  debug.log('app.currentPatchId : ');
  debug.log(app.currentPatchId);

  app.use(cors());
  app.use(bodyParser.json());

  app.use((req, res, next) => {
    debugServer(req.method, ' ', req.path, ' ', req.query.REQUEST || '');
    debugServer(req.query);
    // debugServer(`received at ${Date.now()}`);
    next();
  });

  const options = {
    customCss: '.swagger-ui .topbar { display: none }',
  };

  const swaggerDocument = YAML.load('./doc/swagger.yml');

  app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

  app.use('/', wmts);
  app.use('/', graph);
  app.use('/', files);
  app.use('/', patchs);

  app.urlApi = `http://localhost:${PORT}`;

  module.exports = app.listen(PORT, () => {
    debug.log(`URL de l'api : ${app.urlApi} \nURL de la documentation swagger : ${app.urlApi}/doc`);
  });
} catch (err) {
  debug.log(err);
}
