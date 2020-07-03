const debug = require('debug')('wmts');
const router = require('express').Router();
const { matchedData } = require('express-validator/filter');
const jimp = require('jimp');


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
  if ((SERVICE !== 'WMTS') && (SERVICE !== 'WMS')) {
    res.status(500).send(`service ${SERVICE} not supported`);
  } else if (REQUEST === 'GetCapabilities') {
    res.type('application/xml');
    res.sendFile('Capabilities.xml', { root: `${__dirname}/../../cache` });
  } else if (REQUEST === 'GetTile') {
    debug(LAYER, TILEMATRIX, TILEROW, TILECOL);
    let mime = null;
    if ((!FORMAT) || (FORMAT === 'image/png')) {
      mime = jimp.MIME_PNG; // "image/png"
    } else if (FORMAT === 'image/jpeg') {
      mime = jimp.MIME_JPEG; // "image/jpeg"
    } else {
      res.status(500).send(`format ${FORMAT} not supported`);
      return;
    }
    const url = `cache/${TILEMATRIX}/${TILEROW}/${TILECOL}/${LAYER}.png`;
    jimp.read(url, (err, image) => {
      new Promise((success, failure) => {
        if (err){
          new jimp(256, 256, 0x000000ff, (err, img) => {
            if (err){
              failure(err);
            }
            success(img);
          });
        }
        else{
          success(image);
        }
      }).then( (img) => {
        img.getBuffer(mime, (err2, buffer) => {res.send(buffer);});
      });
      });
  } else if (REQUEST === 'GetFeatureInfo') {
    debug(LAYER, TILEMATRIX, TILEROW, TILECOL, I, J);
    const url = `cache/${TILEMATRIX}/${TILEROW}/${TILECOL}/${LAYER}.png`;
    debug(url);
    jimp.read(url, (err, image) => {
      if (err) {
        res.status(200).send('{"color":[0,0,0], "cliche":"unknown"}');
      } else {
        const index = image.getPixelIndex(parseInt(I, 10), parseInt(J, 10));
        debug('index: ', index);
        debug(image.bitmap.data[index], image.bitmap.data[index + 1], image.bitmap.data[index + 2]);
        const out = {
          color: [image.bitmap.data[index],
            image.bitmap.data[index + 1],
            image.bitmap.data[index + 2]],
        };
        if ((out.color[0] in req.app.cache_mtd)
          && (out.color[1] in req.app.cache_mtd[out.color[0]])
          && (out.color[2] in req.app.cache_mtd[out.color[0]][out.color[1]])) {
          out.cliche = req.app.cache_mtd[out.color[0]][out.color[1]][out.color[2]];
        } else {
          out.cliche = 'unknown';
        }
        res.status(200).send(JSON.stringify(out));
      }
    });
  } else { res.status(500).send('request not supported'); }
});

module.exports = router;
