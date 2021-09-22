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
const nocache = require('nocache');
const { Client } = require('pg');

const { argv } = require('yargs')
  .version(false)
  .option('cache', {
    alias: 'c',
    describe: "cache directory (default: 'cache')",
  })
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
const db = require('./db/db');

const app = express();

debug.log(`API in '${process.env.NODE_ENV}' mode`);
global.dir_cache = argv.cache ? argv.cache : 'cache_test';
// debug.log(`using cache directory: ${global.dir_cache}`);

const wmts = require('./routes/wmts');
const graph = require('./routes/graph');
const file = require('./routes/file');
const patch = require('./routes/patch');
const { misc, gitVersion } = require('./routes/misc');
const branch = require('./routes/branch');
const cache = require('./routes/cache');

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
    app.branches = JSON.parse(fs.readFileSync(path.join(global.dir_cache, 'branches.json')));
  } catch (err) {
    app.branches = [
      {
        id: 0,
        name: 'master',
        activePatches: {
          type: 'FeatureCollection',
          name: 'annotation',
          crs: {
            type: 'name',
            properties: {
              name: 'urn:ogc:def:crs:EPSG::2154',
            },
          },
          features: [],
        },
        unactivePatches: {
          type: 'FeatureCollection',
          name: 'annotation',
          crs: {
            type: 'name',
            properties: {
              name: 'urn:ogc:def:crs:EPSG::2154',
            },
          },
          features: [],
        },
      },
    ];
    fs.writeFileSync(path.join(global.dir_cache, 'branches.json'), JSON.stringify(app.branches, null, 4));
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

  app.use('/itowns', express.static('itowns'));

  const client = new Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
  });
  client.connect().then(async () => {
    const caches = await db.getCaches(client);
    caches.forEach((cacheMeta) => {
      if (cacheMeta.path === global.dir_cache) {
        global.id_cache = cacheMeta.id;
      }
    });
    if (global.id_cache === undefined) {
      debug.log(`WARNING : ${global.dir_cache} non existant`);
    }
    debug.log(`using cache directory: ${global.dir_cache} -> id: ${global.id_cache}`);

    client.end();
    app.server = app.listen(PORT, () => {
      debug.log(`URL de l'api : ${app.urlApi} \nURL de la documentation swagger : ${app.urlApi}/doc`);
      app.emit('appStarted');
    });

    // db.getIdCacheFromPath(client, global.dir_cache).then((id) => {
    //   global.id_cache = id;
    //   debug.log('id_cache :', global.id_cache);
    //   client.end();
    //   app.server = app.listen(PORT, () => {
    //     debug.log(`URL de l'api : ${app.urlApi}\n
    //                URL de la documentation swagger : ${app.urlApi}/doc`);
    //     app.emit('appStarted');
    //   });
    // });
  });

  module.exports = app;
} catch (err) {
  debug.log(err);
}
