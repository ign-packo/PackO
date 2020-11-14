const path = require('path');
const fs = require('fs');
const debug = require('debug')('rok4');

const TAGS = {
  256: 'ImageWidth',
  257: 'ImageHeight',
  258: 'BitsPerSample',
  259: 'Compression',
  262: 'PhotometricInterpretation',
  273: 'StripOffsets',
  277: 'SamplesPerPixel',
  278: 'RowsPerStrip',
  279: 'StripByteCounts',
  322: 'TileWidth',
  323: 'TileLength',
  324: 'TileOffsets',
  325: 'TileByteCounts',
  339: 'SampleFormat',
};

function getNbBytes(dataType) {
  switch (dataType) {
    case 7:
    case 1:
    case 6:
      return 1;
    case 2:
      return null;
    case 3:
    case 8:
      return 2;
    case 4:
    case 9:
    case 11:
      return 4;
    case 5:
    case 10:
    case 12:
      return 8;
    default:
      return null;
  }
}

// Lecture d'un Tag Tiff
function readTag(buffer, offset) {
  const tag = {};
  tag.tagID = buffer.readUInt16(offset);
  tag.dataType = buffer.readUInt16(offset + 2);
  tag.dataCount = buffer.readUInt32(offset + 4);
  tag.dataOffset = buffer.readUInt32(offset + 8);
  const nbBytes = getNbBytes(tag.dataType);
  if ((nbBytes * tag.dataCount) <= 4) tag.dataOffset = offset + 8;
  tag.values = [];
  switch (tag.dataType) {
    case 7:
    case 1:
    // Byte
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readUInt8(tag.dataOffset + i * nbBytes));
      }
      break;
    case 2:
      // Null terminated string
      // values = buffer.readUInt8(offset + 8);
      break;
    case 3:
      // Short
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readUInt16(tag.dataOffset + i * nbBytes));
      }
      break;
    case 4:
      // Long
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readUInt32(tag.dataOffset + i * nbBytes));
      }
      break;
    case 5:
      // Rational
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push([
          buffer.readUInt32(tag.dataOffset + i * nbBytes),
          buffer.readUInt32(tag.dataOffset + i * nbBytes + 4)]);
      }
      break;
    case 6:
      // Signed Byte
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readInt8(tag.dataOffset + i * nbBytes));
      }
      break;
    case 8:
      // Signed Short
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readInt16(tag.dataOffset + i * nbBytes));
      }
      break;
    case 9:
      // Signed Long
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readInt32(tag.dataOffset + i * nbBytes));
      }
      break;
    case 10:
      // Signed Rational
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push([buffer.readInt32(tag.dataOffset), buffer.readInt32(tag.dataOffset + 4)]);
      }
      break;
    case 11:
      // Float
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readFloat(tag.dataOffset + i * nbBytes));
      }
      break;
    case 12:
      // Double
      for (let i = 0; i < tag.dataCount; i += 1) {
        tag.values.push(buffer.readDouble(tag.dataOffset + i * nbBytes));
      }
      break;
    default:
  }
  return tag;
}

function createTag(tag, buffer, offset) {
  const pos = offset;
  pos.in = buffer.writeUInt16(tag.tagID, pos.in);
  pos.in = buffer.writeUInt16(tag.dataType, pos.in);
  pos.in = buffer.writeUInt32(tag.dataCount, pos.in);
  const nbBytes = getNbBytes(tag.dataType);
  let p = pos.in;
  if ((nbBytes * tag.dataCount) > 4) {
    pos.in = buffer.writeUInt32(pos.out, pos.in);
    p = pos.out;
  }
  switch (tag.dataType) {
    case 7:
    case 1:
    // Byte
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeUInt8(tag.values[i], p);
      }
      break;
    case 2:
      // Null terminated string
      // values = buffer.readUInt8(offset + 8);
      break;
    case 3:
      // Short
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeUInt16(tag.values[i], p);
      }
      break;
    case 4:
      // Long
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeUInt32(tag.values[i], p);
      }
      break;
    case 5:
      // Rational
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeUInt32(tag.values[i][0], p);
        p = buffer.writeUInt32(tag.values[i][1], p);
      }
      break;
    case 6:
      // Signed Byte
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeInt8(tag.values[i], p);
      }
      break;
    case 8:
      // Signed Short
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeInt16(tag.values[i], p);
      }
      break;
    case 9:
      // Signed Long
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeInt32(tag.values[i], p);
      }
      break;
    case 10:
      // Signed Rational
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeInt32(tag.values[i][0], p);
        p = buffer.writeInt32(tag.values[i][1], p);
      }
      break;
    case 11:
      // Float
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeFloat(tag.values[i], p);
      }
      break;
    case 12:
      // Double
      for (let i = 0; i < tag.dataCount; i += 1) {
        p = buffer.writeDouble(tag.values[i], p);
      }
      break;
    default:
  }
  if ((nbBytes * tag.dataCount) > 4) {
    pos.out = p;
  } else {
    pos.in += 4;
  }
  return pos;
}

// Lecture d'un IFD Tiff
function readIFD(buffer, offset) {
  const ifd = {};
  ifd.numDirEntries = buffer.readUInt16(offset);
  ifd.nextIFDOffset = buffer.readUInt32(offset + 2 + ifd.numDirEntries * 12);
  for (let i = 0; i < ifd.numDirEntries; i += 1) {
    const tag = readTag(buffer, offset + 2 + i * 12);
    ifd[tag.tagID] = tag;
  }
  return ifd;
}

// Creation d'un IFD Tiff
function createTileIFD(ifd, buffer, tileSize, offset) {
  let pos = offset;
  pos.in = buffer.writeUInt16(11, pos.in);
  // width = tileWidth
  pos = createTag({
    tagID: 256, dataType: 4, dataCount: 1, values: ifd[322].values,
  }, buffer, pos);
  // height = tileHeight
  pos = createTag({
    tagID: 257, dataType: 4, dataCount: 1, values: ifd[323].values,
  }, buffer, pos);
  // BitsPerSample
  pos = createTag(ifd[258], buffer, pos);
  // Compression
  pos = createTag(ifd[259], buffer, pos);
  // PhotometricInterpretation
  pos = createTag(ifd[262], buffer, pos);
  // StripOffsets
  pos = createTag({
    tagID: 273, dataType: 4, dataCount: 1, values: [4096],
  }, buffer, pos);
  // SamplesPerPixel
  pos = createTag(ifd[277], buffer, pos);
  // RowsPerStrip = tileHeight
  pos = createTag({
    tagID: 278, dataType: 4, dataCount: 1, values: ifd[323].values,
  }, buffer, pos);
  // StripByteCounts
  pos = createTag({
    tagID: 279, dataType: 4, dataCount: 1, values: [tileSize],
  }, buffer, pos);
  // SampleFormat
  pos = createTag(ifd[339], buffer, pos);
  pos.in = buffer.writeUInt32(0, pos.in);
  return pos;
}

// Recuperation des infos sur une dalle
function getHeader(url) {
  // ouverture en lecture seule de la dalle
  const dalle = fs.openSync(url);
  // decodage de l'enete Tiff
  const buffer = Buffer.alloc(4096);
  const header = {};
  fs.readSync(dalle, buffer, 0, buffer.byteLength);
  // Byte order
  header.magic = buffer.toString('utf8', 0, 2);
  if (header.magic === 'II') {
    buffer.readUInt16 = buffer.readUInt16LE;
    buffer.readInt16 = buffer.readInt16LE;
    buffer.readUInt32 = buffer.readUInt32LE;
    buffer.readInt32 = buffer.readUInt32LE;
    buffer.readFloat = buffer.readFloatLE;
    buffer.readDouble = buffer.readDoubleLE;
  } else {
    buffer.readUInt16 = buffer.readUInt16BE;
    buffer.readInt16 = buffer.readInt16BE;
    buffer.readUInt32 = buffer.readUInt32BE;
    buffer.readInt32 = buffer.readUInt32BE;
    buffer.readFloat = buffer.readFloatBE;
    buffer.readDouble = buffer.readDoubleBE;
  }
  header.tiffFormat = buffer.readUInt16(2);
  header.ifds = [];
  let ifdOffset = buffer.readUInt16(4);
  while (ifdOffset !== 0) {
    const ifd = readIFD(buffer, ifdOffset);
    header.ifds.push(ifd);
    ifdOffset = ifd.nextIFDOffset;
  }
  // on ferme le fichier de la dalle
  fs.closeSync(dalle);
  return header;
}

function createTileHeader(header, tileSize) {
  const buffer = Buffer.alloc(4096, 0);
  if (header.magic === 'II') {
    buffer.writeUInt16 = buffer.writeUInt16LE;
    buffer.writeInt16 = buffer.writeInt16LE;
    buffer.writeUInt32 = buffer.writeUInt32LE;
    buffer.writeInt32 = buffer.writeUInt32LE;
    buffer.writeFloat = buffer.writeFloatLE;
    buffer.writeDouble = buffer.writeDoubleLE;
  } else {
    buffer.writeUInt16 = buffer.writeUInt16BE;
    buffer.writeInt16 = buffer.writeInt16BE;
    buffer.writeUInt32 = buffer.writeUInt32BE;
    buffer.writeInt32 = buffer.writeUInt32BE;
    buffer.writeFloat = buffer.writeFloatBE;
    buffer.writeDouble = buffer.writeDoubleBE;
  }
  let pos = buffer.write(header.magic);
  pos = buffer.writeUInt16(header.tiffFormat, pos);
  pos = buffer.writeUInt16(16, pos);
  pos = 16;
  createTileIFD(header.ifds[0], buffer, tileSize, { in: pos, out: 2048 });
  return buffer;
}

// Recuperation d'une tuile au format rok4
function getTile(tile, nbTiles, prof, rootDir, suffixe) {
  // identification de la dalle
  const X = Math.trunc(tile.x / nbTiles).toString(36).padStart(prof, 0).toUpperCase();
  const Y = Math.trunc(tile.y / nbTiles).toString(36).padStart(prof, 0).toUpperCase();
  let url = path.join(rootDir, tile.z);
  for (let i = 0; i < prof; i += 1) {
    url = path.join(url, X[i] + Y[i]);
  }
  url += suffixe;
  // ouverture en lecture seule de la dalle
  const dalle = fs.openSync(url);
  // decodage des offets/ByteCounts
  const N = nbTiles * nbTiles;
  const offsets = new Uint32Array(2 * N);
  fs.readSync(dalle, offsets, 0, offsets.byteLength, 2048);
  // recupération de l'index de tuile dans la dalle
  const iTile = (tile.y % nbTiles) * nbTiles + (tile.x % nbTiles);
  // lecture de la tuile
  const buffer = Buffer.alloc(offsets[N + iTile]);
  fs.readSync(dalle, buffer, 0, buffer.byteLength, offsets[iTile]);
  // on ferme le fichier de la dalle
  fs.closeSync(dalle);
  return buffer;
}

// Mise à jour d'une tuile au format rok4
function setTile(tile, nbTiles, prof, rootDir, suffixe, buffer) {
  // identification de la dalle
  const X = Math.trunc(tile.x / nbTiles).toString(36).padStart(prof, 0).toUpperCase();
  const Y = Math.trunc(tile.y / nbTiles).toString(36).padStart(prof, 0).toUpperCase();
  let url = path.join(rootDir, tile.z);
  for (let i = 0; i < prof; i += 1) {
    url = path.join(url, X[i] + Y[i]);
  }
  url += suffixe;
  let bufferDalle;
  const N = nbTiles * nbTiles;
  if (fs.existsSync(url)) {
    debug('Mise a jour de la dalle ', url);
    // ouverture en lecture seule de la dalle
    const dalle = fs.openSync(url);
    // lecture complete du fichier
    bufferDalle = fs.readFileSync(dalle);
    // fermeture de la dalle
    fs.closeSync(dalle);
  } else {
    debug('Création d\'une nouvelle dalle ', url);
    // Nouvelle Dalle, on cree un buffer vide
    // to do: créer une entête Tiff Valide
    bufferDalle = Buffer.alloc(2048 + 8 * N, 0);
  }
  // decodage des offets/ByteCounts
  const offsets = new Uint32Array(
    bufferDalle.buffer,
    2048,
    2 * N,
  );
  // recupération de l'index de tuile dans la dalle
  const iTile = (tile.y % nbTiles) * nbTiles + (tile.x % nbTiles);
  // création d'un offets mis à jour
  const oldBufferByteCount = offsets[N + iTile];
  const newOffsets = Uint32Array.from(offsets);
  for (let n = (iTile + 1); n < N; n += 1) {
    newOffsets[n] += buffer.byteLength - oldBufferByteCount;
  }
  newOffsets[N + iTile] = buffer.byteLength;
  // creation d'une nouvelle dalle
  // si besoin, on cree le dossier
  fs.mkdirSync(path.dirname(url), { recursive: true });
  const newDalle = fs.openSync(url, 'w');
  // ecriture du header
  fs.writeSync(newDalle, bufferDalle, 0, 2048);
  // ecriture des offets
  fs.writeSync(newDalle, newOffsets, 0, newOffsets.byteLength);
  // ecriture des premieres tuiles si necessaire
  if (iTile > 0) {
    fs.writeSync(newDalle,
      bufferDalle,
      2048 + offsets.byteLength,
      offsets[iTile - 1] + offsets[N + iTile - 1]);
  }
  // ecriture de la nouvelle tuile
  fs.writeSync(newDalle, buffer, 0, buffer.byteLength);
  // ecriture des dernières tuiles si necessaire
  if ((iTile + 1) < N) {
    fs.writeSync(newDalle,
      bufferDalle,
      offsets[iTile + 1],
      bufferDalle.byteLength - offsets[iTile + 1]);
  }
  // on ferme le fichier de la dalle
  fs.closeSync(newDalle);
}

function test() {
  // Ecriture de la tuile
  const buffer1 = Buffer.alloc(300, 15);
  const tile1 = { x: 414, y: 3134, z: 12 };
  setTile(tile1, 16, 3, '.', '.tif', buffer1);
  const buffer2 = Buffer.alloc(200, 7);
  const tile2 = { x: 415, y: 3134, z: 12 };
  setTile(tile2, 16, 3, '.', '.tif', buffer2);
  const buffer3 = Buffer.alloc(400, 255);
  const tile3 = { x: 415, y: 3135, z: 12 };
  setTile(tile3, 16, 3, '.', '.tif', buffer3);

  // Lecture d'un tuile
  const buffer1Verif = getTile(tile1, 16, 3, '.', '.tif');
  const buffer2Verif = getTile(tile2, 16, 3, '.', '.tif');
  const buffer3Verif = getTile(tile3, 16, 3, '.', '.tif');
  return buffer1.equals(buffer1Verif)
    && buffer2.equals(buffer2Verif)
    && buffer3.equals(buffer3Verif);
}

function tiffInfo(url) {
  const header = getHeader(url);
  Object.keys(TAGS).forEach((tagId) => {
    if (header.ifds[0][tagId]) debug(TAGS[tagId], ' -- ', header.ifds[0][tagId].values);
  });
}

function extractAllTiles(urlIn, urlOut) {
  const header = getHeader(urlIn);
  for (let i = 0; i < header.ifds[0][324].values.length; i += 1) {
    // create d'un fichier Tiff pour la tuile
    const tileUrl = `${urlOut}_${i}.tif`;
    const tile = fs.openSync(tileUrl, 'w');
    // on ecrit le header
    const tileHeader = createTileHeader(header, header.ifds[0][325].values[i]);
    const pos = fs.writeSync(tile, tileHeader, 0, tileHeader.byteLength);
    // on charge la tuile
    const dalle = fs.openSync(urlIn);
    const buffer = Buffer.alloc(header.ifds[0][325].values[i]);
    fs.readSync(dalle, buffer, 0, buffer.byteLength, header.ifds[0][324].values[i]);
    // on ferme le fichier de la dalle
    fs.closeSync(dalle);
    // on ecrit le buffer
    fs.writeSync(tile, buffer, 0, buffer.byteLength, pos);
    // on ferme le fichier de la tuile
    fs.closeSync(tile);
  }
}

tiffInfo('test.tif');
extractAllTiles('test.tif', 'out');

exports.getTile = getTile;
exports.setTile = setTile;
exports.test = test;
