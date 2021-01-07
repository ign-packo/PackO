const path = require('path');
const debug = require('debug')('rok4');

function getTileRoot(X, Y, Z, pathDepth) {
  debug(X, Y, Z, pathDepth);
  const strX = Math.trunc(X).toString(36).padStart(pathDepth + 1, 0).toUpperCase();
  const strY = Math.trunc(Y).toString(36).padStart(pathDepth + 1, 0).toUpperCase();
  debug(strX, strY);
  let url = Z.toString(10).toUpperCase();
  for (let i = 0; i < pathDepth; i += 1) {
    url = path.join(url, strX[i] + strY[i]);
  }
  debug(url);
  url = path.join(url, strX[pathDepth] + strY[pathDepth]);
  debug(url);
  return url;
}

exports.getTileRoot = getTileRoot;