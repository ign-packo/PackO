const router = require('express').Router();
const { matchedData } = require('express-validator/filter');
// const debug = require('debug')('job');

const {
  query, body,
} = require('express-validator/check');

// const validateParams = require('../../middlewares/validateParams');
// const createErrorMsg = require('../../middlewares/createErrorMsg');
// const jobs = require('../../middlewares/jobs');
// const pgClient = require('../../middlewares/db/pgClient');
// const returnMsg = require('../../middlewares/returnMsg');

router.get('/wmts', [
  query('SERVICE'),
  query('VERSION'),
  query('REQUEST')
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
        const url = 'cache/'+TILEMATRIX+'/'+TILEROW+'/'+TILECOL+'/'+LAYER+'.jpg'
        console.log(url);
        try {
            if (fs.existsSync(url)) {
                console.log('found');
                res.sendFile(url, { root: __dirname+'/../' });
            }
        } catch(err) {
            console.error(err)
        }
        console.log('not found');
    }
    else
        res.status(500).send('request not supported');
    // // Finds the validation errors in this request and wraps them in an object with handy functions
    // const errors = validationResult(req);
    // if (!errors.isEmpty()) {
    //   return res.status(422).json({ errors: errors.array() });
    // }
    // const url = 'cache/'+String(req.query.Z)+'/'+String(req.query.Y)+'/'+String(req.query.X)+'/graph.png'
    // console.log(url);
    // try {
    //   if (fs.existsSync(url)) {
    //       console.log('found');
    //       res.sendFile(url, { root: __dirname+'/../' });
    //       return;
    //   }
    // } catch(err) {
    //   console.error(err)
    // }
    // console.log('not found');
    // res.status(500).send('Tile does not exist!');
  });

module.exports = router;