// const fs = require('fs');
const express = require('express');
const cors = require('cors');
// const bodyParser = require('body-parser');
const os = require('os');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const debugServer = require('debug')('serveur');
const debug = require('debug');
// const path = require('path');
const nocache = require('nocache');
// const { Client } = require('pg');

const { argv } = require('yargs')
  .version(false)
  // .option('cache', {
  //   alias: 'c',
  //   describe: "cache directory (default: 'cache')",
  // })
  .option('port', {
    alias: 'p',
    describe: "API port (default: '8081')",
  })
  .option('server', {
    alias: 's',
    describe: "API server (default: 'localhost')",
  })
  .help()
  .alias('help', 'h');
// const db = require('./db/db');

const app = express();

debug.log(`API in '${process.env.NODE_ENV}' mode`);

const wmts = require('./routes/wmts');
const graph = require('./routes/graph');
const file = require('./routes/file');
const patch = require('./routes/patch');
const { misc, gitVersion } = require('./routes/misc');
const branch = require('./routes/branch');
const cache = require('./routes/cache');
const vector = require('./routes/vector');
const processQueue = require('./routes/processQueue');
const ozCpp = require('./routes/ozCppExe');
const mergeSlabs = require('./routes/mergeSlabs');

try {
  // desactive la mise en cache des images par le navigateur - OK Chrome/Chromium et Firefox
  // effet : maj autom apres saisie - OK Chrome/Chromium, Pas OK Firefox
  app.use(nocache());

  const PORT = argv.port ? argv.port : 8081;
  const SERVER = argv.server ? argv.server : os.hostname();
  app.urlApi = `http://${SERVER}:${PORT}`;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

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
  swaggerDocument.servers[0].url = app.urlApi;
  swaggerDocument.info.version = gitVersion;
  app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

  app.use('/', wmts);
  app.use('/', graph);
  app.use('/', file);
  app.use('/', patch);
  app.use('/', misc);
  app.use('/', branch);
  app.use('/', cache);
  app.use('/', vector);
  app.use('/', processQueue);
  app.use('/', ozCpp);
  app.use('/', mergeSlabs);

  app.use('/itowns', express.static('itowns'));

  app.server = app.listen(PORT, () => {
    debug.log(`URL de l'api : ${app.urlApi} \nURL de la documentation swagger : ${app.urlApi}/doc`);
    app.emit('appStarted');
  });

  module.exports = app;
} catch (err) {
  debug.log(err);
}
