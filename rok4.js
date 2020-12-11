const path = require('path');
const debug = require('debug')('rok4');

function getTileRoot(X, Y, Z, pathDepth) {
  debug(X, Y, Z, pathDepth);
  const strX = Math.trunc(X).toString(36).padStart(pathDepth, 0).toUpperCase();
  const strY = Math.trunc(Y).toString(36).padStart(pathDepth, 0).toUpperCase();
  let url = Z.toString(10).toUpperCase();
  for (let i = 0; i < (pathDepth - 1); i += 1) {
    url = path.join(url, strX[i] + strY[i]);
  }
  url = path.join(url, strX[pathDepth - 1] + strY[pathDepth - 1]);
  debug(url);
  return url;
}

exports.getTileRoot = getTileRoot;
