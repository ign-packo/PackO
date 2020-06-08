const router = require('express').Router();
const fs = require('fs');
const { matchedData } = require('express-validator/filter');

const {
  query, body,
} = require('express-validator/check');

router.get('/wmts', [
  query('SERVICE'),
  query('VERSION'),
  query('REQUEST'),
  query('LAYER'),
  query('TILEMATRIX'),
  query('TILEROW'),
  query('TILECOL')
],(req, res) => {
    const params = matchedData(req);
    const SERVICE = params.SERVICE;
    const VERSION = params.VERSION;
    const REQUEST = params.REQUEST;
    const LAYER = params.LAYER;
    // const STYLE = params.STYLE;
    // const FORMAT = params.FORMAT;
    // const TILEMATRIXSET = params.TILEMATRIXSET;
    const TILEMATRIX = params.TILEMATRIX;
    const TILEROW = params.TILEROW;
    const TILECOL = params.TILECOL;

    console.log(SERVICE, VERSION, REQUEST);
    if (REQUEST == 'GetCapabilities'){
        res.status(200).sendFile('Capabilities.xml', { root: __dirname+'/../../' });
    }
    else if (REQUEST == 'GetTile'){
        console.log(LAYER,TILEMATRIX, TILEROW, TILECOL);
        // const url = 'cache/'+LAYER+'.jpg'
        const url = 'cache/'+TILEMATRIX+'/'+TILEROW+'/'+TILECOL+'/'+LAYER+'.jpg'
        console.log(url);
        try {
            if (fs.existsSync(url)) {
                console.log('found');
                res.sendFile(url, { root: __dirname+'/../..' });
            }
            else {
                console.log('not found');
                res.sendFile('ortho.jpg', { root: __dirname+'/../../cache/' });
            }
        } catch(err) {
            console.error(err);
            res.status(500).send(err);
        }
    }
    else
        res.status(500).send('request not supported');
  });

module.exports = router;
