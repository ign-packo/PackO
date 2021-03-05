const workerpool = require('workerpool');
const createPatch = require('./createPatch.js');
const processPatch = require('./processPatch.js');

// create a worker and register public functions
workerpool.worker({
  createPatch: createPatch.createPatch,
  processPatch: processPatch.processPatch,
});
