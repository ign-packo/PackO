const debug = require('debug')('wmts');
const router = require('express').Router();
const fs = require('fs');
const { matchedData } = require('express-validator/filter');
const { spawn } = require('child_process');

const {
  query, /* body, */
} = require('express-validator/check');

router.get('/wmts', [
  query('SERVICE'),
  query('VERSION'),
  query('REQUEST'),
  query('LAYER'),
  query('TILEMATRIX'),
  query('TILEROW'),
  query('TILECOL'),
  query('FORMAT'),
  query('I'),
  query('J'),
], (req, res) => {
  const params = matchedData(req);
  const { SERVICE } = params;
  const { VERSION } = params;
  const { REQUEST } = params;
  const { LAYER } = params;
  // const STYLE = params.STYLE;
  const { FORMAT } = params;
  // const TILEMATRIXSET = params.TILEMATRIXSET;
  const { TILEMATRIX } = params;
  const { TILEROW } = params;
  const { TILECOL } = params;
  const { I } = params;
  const { J } = params;

  debug(SERVICE, VERSION, REQUEST);
  let ext = '.jpg';
  if (FORMAT === 'image/png') {
    ext = '.png';
  }

  if (SERVICE !== 'WMTS') {
    res.status(500).send(`service ${SERVICE} not supported`);
  } else if (VERSION !== '1.0.0') {
    res.status(500).send(`version ${VERSION} not supported`);
  } else if (REQUEST === 'GetCapabilities') {
    const python = spawn('python3', ['scripts/GetCapabilities.py']);
    // collect data from script
    let dataToSend = '';
    python.stdout.on('data', (data) => {
      dataToSend += data.toString();
    });
    // in close event we are sure that stream from child process is closed
    python.on('close', (code) => {
      debug(`child process close all stdio with code ${code}`);
      res.status(200).send(dataToSend);
    });
  } else if (REQUEST === 'GetTile') {
    debug(LAYER, TILEMATRIX, TILEROW, TILECOL);
    const url = `cache/${TILEMATRIX}/${TILEROW}/${TILECOL}/${LAYER}${ext}`;
    debug('request : ', url);
    try {
      if (fs.existsSync(url)) {
        // console.log('found');
        res.sendFile(url, { root: `${__dirname}/../..` });
      } else {
        // console.log('not found');
        res.sendFile('ortho.jpg', { root: `${__dirname}/../../cache` });
      }
    } catch (err) {
      res.status(500).send(err);
    }
  } else if (REQUEST === 'GetFeatureInfo') {
    debug(LAYER, TILEMATRIX, TILEROW, TILECOL, I, J);
    const python = spawn('python3', ['scripts/GetFeatureInfo.py', '-Z', TILEMATRIX, '-Y', TILEROW, '-X', TILECOL, '-i', I, '-j', J, '-l', `${LAYER}${ext}`]);
    // collect data from script
    let json = '';
    python.stdout.on('data', (data) => {
      json += data.toString();
    });
    // in close event we are sure that stream from child process is closed
    python.on('close', (code) => {
      debug(`child process close all stdio with code ${code}`);
      const out = JSON.parse(json);
      debug(out);
      // To Do: verifier que la couleur est bien dans la table
      out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
      // send data to browser
      res.status(200).send(JSON.stringify(out));
    });
  } else { res.status(500).send('request not supported'); }
});

module.exports = router;
