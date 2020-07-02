const debug = require('debug')('graph');
const router = require('express').Router();
// const fs = require('fs');
const { matchedData } = require('express-validator/filter');
const { spawn } = require('child_process');
const jimp = require('jimp');


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
    if (code !== 0) res.status(500).send(json);
    else res.status(200).send(JSON.stringify(json));
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

  // il faut trouver la tuile
  const Px = (x-X)/R;
  const Py = (Y-y)/R;
  const Tx = Math.floor(Px/256)
  const Ty = Math.floor(Py/256)
  const I = Math.floor(Px-Tx*256)
  const J = Math.floor(Py-Ty*256)
  const url = `cache/21/${Ty}/${Tx}/graph.png`;
  jimp.read(url, (err, image) => {
    if (err){
      res.status(500).send(err);
    }
    else{
      const index = image.getPixelIndex(I,J);
      debug("index: ",index);
      debug(image.bitmap.data[index], image.bitmap.data[index+1], image.bitmap.data[index+2]);
      const out = {'color':[image.bitmap.data[index], image.bitmap.data[index+1], image.bitmap.data[index+2]]}
      if ((out.color[0] in req.app.cache_mtd)
          && (out.color[1] in req.app.cache_mtd[out.color[0]])
          && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
        out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
      } else {
        out.cliche = 'unkown';
      }
      debug(JSON.stringify(out)); 
      res.status(200).send(JSON.stringify(out));  
    }
  });
});

module.exports = router;
