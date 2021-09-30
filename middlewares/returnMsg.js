const debug = require('debug')('returnMsg');

module.exports = function returnMsg(req, res) {
  debug('>>returnMsg');
  if (req.error) {
    debug(' => req.error');
    res.status(req.error.code ? req.error.code : 500)
      .json(req.error.json ? req.error.json : req.error);
  } else if (req.result.json) {
    debug(' => req.result.json:');
    debug(req.result.json);
    res.status(req.result.code).json(req.result.json);
  } else if (req.result.xml) {
    debug(' => req.result.xml');
    res.type('application/xml');
    res.status(req.result.code).send(req.result.xml);
  } else if (req.result.img) {
    debug(' => req.result.img');
    res.status(req.result.code).send(req.result.img);
  } else if (req.result.filePath) {
    debug(` => req.result.filePath: ${req.result.filePath}`);
    res.status(req.result.code).download(req.result.filePath);
  }
};
