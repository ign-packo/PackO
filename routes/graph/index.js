const router = require('express').Router();
const fs = require('fs');
const { matchedData } = require('express-validator/filter');
const {spawn} = require('child_process');

const {
  query, body,
} = require('express-validator/check');
const { strict } = require('assert');

router.get('/graph', [
  query('x'),
  query('y'),
],(req, res) => {
    const params = matchedData(req);
    const x = params.x;
    const y = params.y;

    console.log(x, y);
    const X = 0;
    const Y = 12000000;
    const R = 2848.1658267857144691 * 0.00028;
    const cacheDir = 'cache3/17'
    const opts = 'scripts/GetColor.py -X '+X+' -Y '+Y+' -R '+R+' -C '+cacheDir+' -x '+x+' -y '+y
    console.log(opts)
    const python = spawn('/anaconda2/envs/udacity/bin/python3', ['scripts/GetColor.py', '-X', X, '-Y', Y, '-R', R, '-C', cacheDir, '-x', x, '-y', y]);
    // collect data from script
    let json = '';
    python.stderr.on('data', function (data) {
      json += data.toString();
    });
    python.stdout.on('data', function (data) {
      json += data.toString();
    });
    // in close event we are sure that stream from child process is closed
    python.on('close', (code) => {
        console.log(`child process close all stdio with code ${code}`);
        // il faut convertir la couleur en Id
        let cliche = JSON.parse(json);
        console.log(cliche);
        // send data to browser
        res.status(200).send(json);
    });
    // res.status(200).sendFile('toto.xml', { root: __dirname+'/../../' });
  });

module.exports = router;
