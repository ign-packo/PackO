const GJV = require('geojson-validation');

function object(value) {
  if (GJV.isGeoJSONObject(value)) return true;
  return false;
}

function geometry(value) {
  if (GJV.isGeometryObject(value)) return true;
  return false;
}

function polygon(value) {
  if (GJV.isPolygon(value)) return true;
  return false;
}

function multiPolygon(value) {
  if (GJV.isMultiPolygon(value)) return true;
  return false;
}

function polyOrMultiPolygon(value) {
  if (GJV.isPolygon(value) || GJV.isMultiPolygon(value)) return true;
  return false;
}

function featureCollection(value) {
  if (GJV.isFeatureCollection(value)) {
    return true;
  }
  return false;
}

function polygonCoor(value) {
  if (GJV.isPolygonCoor(value)) {
    return true;
  }
  return false;
}

function multiPolygonCoor(value) { // NOT WORKING ...
  if (GJV.isMultiPolygonCoor(value)) return true;
  return false;
}

module.exports = {
  object,
  geometry,
  featureCollection,
  polygon,
  multiPolygon,
  polyOrMultiPolygon,
  polygonCoor,
  multiPolygonCoor,
};
