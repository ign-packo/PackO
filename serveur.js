const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');

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

const wmts = require('./routes/wmts.js');
const graph = require('./routes/graph.js');
const file = require('./routes/file.js');
const patch = require('./routes/patch.js');

try {
  // desactive la mise en cache des images par le navigateur - OK Chrome/Chromium et Firefox
  // effet : maj autom apres saisie - OK Chrome/Chromium, Pas OK Firefox
  app.use(nocache());

  const PORT = argv.port ? argv.port : 8081;
  const SERVER = argv.server ? argv.server : os.hostname();
  app.urlApi = `http://${SERVER}:${PORT}`;
  //  const PLATFORM = os.platform();

  // on charge les mtd du cache
  app.cache_mtd = JSON.parse(fs.readFileSync(path.join(global.dir_cache, 'cache_mtd.json')));
  app.overviews = JSON.parse(fs.readFileSync(path.join(global.dir_cache, 'overviews.json')));

  try {
    app.activePatchs = JSON.parse(fs.readFileSync(`${global.dir_cache}/activePatchs.json`));
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
    fs.writeFileSync(`${global.dir_cache}/activePatchs.json`, JSON.stringify(app.activePatchs));
  }

  try {
    app.unactivePatchs = JSON.parse(fs.readFileSync(`${global.dir_cache}/unactivePatchs.json`));
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
    fs.writeFileSync(`${global.dir_cache}/unactivePatchs.json`, JSON.stringify(app.unactivePatchs));
  }

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
  swaggerDocument.info.version = '0.1.0';
  swaggerDocument.servers[0].url = app.urlApi;

  app.use('/', wmts);
  app.use('/', graph);
  app.use('/', file);
  app.use('/', patch);

  module.exports = app.listen(PORT, () => {
    debug.log(`URL de l'api : ${app.urlApi} \nURL de la documentation swagger : ${app.urlApi}/doc`);
  });
} catch (err) {
  debug.log(err);
}
