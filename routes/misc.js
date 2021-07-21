const debug = require('debug')('misc');
const router = require('express').Router();
const { gitDescribeSync } = require('git-describe');

const gitVersion = gitDescribeSync(__dirname).raw;
debug(`Git version: ${gitVersion}`);

router.get('/version', (req, res) => {
  debug('~~~getVersion~~~');
  res.status(200).send({ version_git: gitVersion });
});

module.exports = { misc: router, gitVersion };
