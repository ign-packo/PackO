const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const debug = require('debug');

const PORT = 8081;

const app = express();

const wmts = require('./routes/wmts');

app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
  debug.log(req.method, ' ', req.path, ' ', req.body);
  debug.log(`received at ${Date.now()}`);
  next();
});

const options = {
  customCss: '.swagger-ui .topbar { display: none }',
};

const swaggerDocument = YAML.load('./doc/swagger.yml');

app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

app.use('/', wmts);

module.exports = app.listen(PORT, () => {
  debug.log(`URL de l'api : http://localhost:${PORT} \nURL de la documentation swagger : http://localhost:${PORT}/doc`);
});
