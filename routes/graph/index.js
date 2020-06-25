const debug = require('debug')('graph');
const router = require('express').Router();
// const fs = require('fs');
const { matchedData } = require('express-validator/filter');
const { spawn } = require('child_process');

const {
  query, /* body, */
} = require('express-validator/check');
// const { strict } = require('assert');

router.post('/graph/patch', (req, res) => {
  debug('GeoJson: ', JSON.stringify(req.body));
  // res.status(400).send('Failed');
  const cacheDir = 'cache';
  const python = spawn('python3', ['scripts/Patch.py', '-C', cacheDir]);
  // Send GeoJson to the python process
  python.stdin.write(JSON.stringify(req.body));
  python.stdin.end();
  // collect data from script
  let json = '';
  python.stderr.on('data', (data) => {
    json += data.toString();
  });
  python.stdout.on('data', (data) => {
    json += data.toString();
  });
  // in close event we are sure that stream from child process is closed
  python.on('close', (code) => {
    debug(`child process close all stdio with code ${code}`);
    debug(json);
    // send data to browser
    res.status(200).send(JSON.stringify(json));
  });

});

router.get('/graph', [
  query('x'),
  query('y'),
], (req, res) => {
  const params = matchedData(req);
  const { x } = params;
  const { y } = params;

  debug(x, y);
  const X = 0;
  const Y = 12000000;
  const R = 178.571428571429 * 0.00028;
  const cacheDir = 'cache/21';
  const python = spawn('python3', ['scripts/GetColor.py', '-X', X, '-Y', Y, '-R', R, '-C', cacheDir, '-x', x, '-y', y]);
  // collect data from script
  let json = '';
  python.stderr.on('data', (data) => {
    json += data.toString();
  });
  python.stdout.on('data', (data) => {
    json += data.toString();
  });
  // in close event we are sure that stream from child process is closed
  python.on('close', (code) => {
    debug(`child process close all stdio with code ${code}`);
    debug(json);
    const out = JSON.parse(json);
    if ((out.color[0] in req.app.cache_mtd)
        && (out.color[1] in req.app.cache_mtd[out.color[0]])
        && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
      out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
    } else {
      out.cliche = 'unkown';
    }
    // send data to browser
    res.status(200).send(JSON.stringify(out));
  });
  // res.status(200).sendFile('toto.xml', { root: __dirname+'/../../' });
});

module.exports = router;
