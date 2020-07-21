module.exports = function isCrs(crs) {
  if (!crs.type) return false;
  if (crs.type === 'name') {
    if (crs.properties && crs.properties.name && crs.properties.name.toString().match(/^urn:ogc:def:crs:EPSG::\d{4}$/i)) {
      return true;
    }
  }
  if (crs.type === 'EPSG') {
    if (crs.properties && crs.properties.code && crs.properties.code.toString().match(/^\d{4}$/i)) {
      return true;
    }
  }
  return false;
};
