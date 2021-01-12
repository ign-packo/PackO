const path = require('path');
const debug = require('debug')('rok4');
// const fs = require('fs');
// var jpeg = require('jpeg-js');
// const jimp = require('jimp');
// const { resolve } = require('path');
// const rok4IO = require('bindings')('rok4IO');

function getTileRoot(X, Y, Z, pathDepth, slabSize) {
  debug(X, Y, Z, pathDepth);
  const strX = Math.trunc(X / slabSize.width)
    .toString(36).padStart(pathDepth + 1, 0).toUpperCase();
  const strY = Math.trunc(Y / slabSize.height)
    .toString(36).padStart(pathDepth + 1, 0).toUpperCase();
  debug(strX, strY);
  let url = Z.toString(10).toUpperCase();
  for (let i = 0; i < pathDepth; i += 1) {
    url = path.join(url, strX[i] + strY[i]);
  }
  debug(url);
  url = path.join(url, strX[pathDepth] + strY[pathDepth]);
  debug(url);
  const numTile = (Y % slabSize.height) * slabSize.width + (X % slabSize.width);
  return { url, numTile };
}

// let img = new rok4IO.ImageROK4();
// img.load('/Users/gmaillet/GitLab/Mosar/CppMo_ROK4/test/test_color_rok4_jpg.tif').then((res1) => {
//   debug(res1);
// });
// debug('fin');

exports.getTileRoot = getTileRoot;
