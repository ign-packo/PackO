const express = require('express');
const debug = require('debug');
const os = require('os');

const { argv } = require('yargs')
  .version(false)
  .option('portMonitor', {
    alias: 'p',
    describe: "monitor port (default: '8000')",
  })
  .option('server', {
    alias: 's',
    describe: "monitor server (default: 'localhost')",
  })
  .help()
  .alias('help', 'h');

const app = express();

const PORT = argv.portMonitor ? argv.portMonitor : 8000;
const SERVER = argv.server ? argv.server : os.hostname();
app.urlMonitor = `http://${SERVER}:${PORT}`;

app.use('/itowns', express.static('.'));
debug.log('Monitor STARTED');
debug.log(`URL du monitor : ${app.urlMonitor}`);
app.listen(PORT);
