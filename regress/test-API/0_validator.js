const chai = require('chai');
chai.use(require('chai-http'));

chai.should();

const validator = require('../../paramValidation/validator');

describe('Validator', () => {
  describe('isCrs', () => {
    describe("without the key 'type'", () => {
      it("should return 'false'", (done) => {
        const crs = JSON.parse('{"properties": { "name": "urn:ogc:def:crs:EPSG::2154" } }');
        validator.isCrs(crs).should.be.a('boolean').equal(false);
        done();
      });
    });
    describe('type: name', () => {
      it("should return 'true'", (done) => {
        const crs = JSON.parse('{"type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::2154" } }');
        validator.isCrs(crs).should.be.a('boolean').equal(true);
        done();
      });
    });
    describe('type: name, with invalid name', () => {
      it("should return 'false'", (done) => {
        const crs = JSON.parse('{"type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::2154b" } }');
        validator.isCrs(crs).should.be.a('boolean').equal(false);
        done();
      });
    });
    describe('type: EPSG', () => {
      it("should return 'true'", (done) => {
        const crs = JSON.parse('{"type": "EPSG", "properties": { "code": "2154" } }');
        validator.isCrs(crs).should.be.a('boolean').equal(true);
        done();
      });
    });
    describe('type: EPSG, with invalid code', () => {
      it("should return 'false'", (done) => {
        const crs = JSON.parse('{"type": "EPSG", "properties": { "code": "2154b" } }');
        validator.isCrs(crs).should.be.a('boolean').equal(false);
        done();
      });
    });
    describe('type: other', () => {
      it("should return 'false'", (done) => {
        const crs = JSON.parse('{"type": "other", "properties": { "other": "2154" } }');
        validator.isCrs(crs).should.be.a('boolean').equal(false);
        done();
      });
    });
  });

  describe('isColor', () => {
    describe("color = '[234, 125, 589]' (wrong format)", () => {
      it("should return 'false'", (done) => {
        const color = '[234, 125, 589]';
        validator.isColor(color).should.be.a('boolean').equal(false);
        done();
      });
    });
    describe('color = [234, 125, 589] (value > 255)', () => {
      it("should return 'false'", (done) => {
        const color = [234, 125, 589];
        validator.isColor(color).should.be.a('boolean').equal(false);
        done();
      });
    });
    describe('color = [234, 125] (missing a value)', () => {
      it("should return 'false'", (done) => {
        const color = [234, 125];
        validator.isColor(color).should.be.a('boolean').equal(false);
        done();
      });
    });
    describe("color = ['234', 0, 185]", () => {
      it("should return 'true'", (done) => {
        const color = ['234', 0, 185];
        validator.isColor(color).should.be.a('boolean').equal(true);
        done();
      });
    });
  });
});
