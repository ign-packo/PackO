const path = require('path');
const debug = require('debug')('cog_path');

function getSlabPath(X, Y, Z, overviews) {
  debug('~~~getSlabPath');
  debug(X, Y, Z);
  // On commence par trouver le niveau de zoom de la dalle correspondante
  const { pathDepth } = overviews;

  const strX = Math.trunc(X).toString(36).padStart(pathDepth + 1, 0).toUpperCase();
  const strY = Math.trunc(Y).toString(36).padStart(pathDepth + 1, 0).toUpperCase();
  debug(strX, strY);
  let url = Z.toString(10).toUpperCase();
  for (let i = 0; i < pathDepth; i += 1) {
    url = path.join(url, strX[i] + strY[i]);
  }
  debug(url);
  return {
    dirPath: url,
    filename: strX[pathDepth] + strY[pathDepth],
  };
}

function getTilePath(X, Y, Z, overviews) {
  debug('~~~getTilePath');
  debug(X, Y, Z);
  // On commence par trouver le niveau de zoom de la dalle correspondante
  const nbTiles = overviews.slabSize.width;
  const levelMax = overviews.level.max;
  const level = Number(Z);
  const nbLvlInCOG = Math.floor(Math.log2(nbTiles)) + 1;
  const levelCOG = levelMax - Math.floor((levelMax - level) / nbLvlInCOG) * nbLvlInCOG;
  // const levelCOG = Math.floor((level + 4 - (levelMax % nbLvlInCOG)) / nbLvlInCOG) * nbLvlInCOG
  //                   + (levelMax % nbLvlInCOG);

  debug(levelMax, levelCOG);

  // facteur de sous-ech par rapport à la pleine resolution
  // typiquement entre 1 et 16
  const factor = 2 ** (levelCOG - Z);
  // le nombre de sous-ech dispo dans un COG est lié
  // au nombre de bloc dans l'image
  // si on a 16 blocs en pleine resolution
  // il y aura 4 sous niveaux de sous-ech:
  // (8 blocs, 4 blocs, 2 bloc, 1 bloc)
  // on a donc nbTiles (qui est une puissance de 2)
  // correspond au facteur max
  // if (factor > nbTiles) {
  //   const error = new Error();
  //   error.msg = {
  //     status: 'zoom non dispo',
  //     errors: [{
  //       localisation: 'getPath',
  //       msg: 'zoom non dispo',
  //     }],
  //   };
  //   throw error;
  // }

  const slabX = (X * factor) / nbTiles;
  const slabY = (Y * factor) / nbTiles;
  const tileX = ((X * factor) % nbTiles) / factor;
  const tileY = ((Y * factor) % nbTiles) / factor;

  const slab = getSlabPath(slabX, slabY, levelCOG, overviews);
  slab.x = tileX;
  slab.y = tileY;
  slab.z = levelCOG - Z;
  return slab;
}

exports.getTilePath = getTilePath;
exports.getSlabPath = getSlabPath;
