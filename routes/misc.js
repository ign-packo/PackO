const debug = require('debug')('misc');
const router = require('express').Router();
const { gitDescribe } = require('git-describe');

gitDescribe(__dirname, (err, gitInfo) => {
  if (err) {
    debug(err);
  }
  debug(`Git version: ${gitInfo.raw}`);
  global.swaggerDocument.info.version = gitInfo.raw;
});

router.get('/version', (req, res) => {
  debug('~~~getVersion~~~');
  res.status(200).send({ version_git: global.swaggerDocument.info.version });
});

module.exports = router;
