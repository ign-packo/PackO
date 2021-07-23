const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const server = require('..');

let testBranchId = -1;

describe('Wmts', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('create a test branch', () => {
    it('should return a branchId', (done) => {
      chai.request(server)
        .post('/branch')
        .query({ name: 'test wmts' })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('id');
          testBranchId = resJson.id;
          done();
        });
    });
  });

  describe('GET /0/wmts?SERVICE=OTHER&REQUEST=GetCapabilities', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({ REQUEST: 'GetCapabilities', SERVICE: 'OTHER', VERSION: '1.0.0' })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(400);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('status').equal("'OTHER': unsupported SERVICE value");
          done();
        });
    });
  });

  describe('GET /0/wmts?SERVICE=WMTS&REQUEST=Other', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({ REQUEST: 'Other', SERVICE: 'WMTS', VERSION: '1.0.0' })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(400);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('status').equal("'Other': unsupported REQUEST value");
          done();
        });
    });
  });

  // GetCapabilities
  describe('GetCapabilities', () => {
    it('should return the Capabilities.xml', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({ REQUEST: 'GetCapabilities', SERVICE: 'WMTS', VERSION: '1.0.0' })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/xml');

          done();
        });
    });
  });

  // GetTile
  describe('GetTile', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/autre', LAYER: 'ortho', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(400);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('status').equal("'image/autre': unsupported FORMAT value");
          done();
        });
    });

    it('should return a png image', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/png', LAYER: 'ortho', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });

    it('should return a jpeg image', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/jpeg', LAYER: 'ortho', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });

    it("should return the OPI '19FD5606Ax00020_16371' as png", (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 21, TILEROW: 34402, TILECOL: 18027, FORMAT: 'image/png', LAYER: 'opi', Name: '19FD5606Ax00020_16371', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });

    it('should return the default OPI as png', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 21, TILEROW: 34402, TILECOL: 18027, FORMAT: 'image/png', LAYER: 'opi', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });

    it('should return the default graph on a non-modified tile', (done) => {
      chai.request(server)
        .get(`/${testBranchId}/wmts`)
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 21, TILEROW: 34402, TILECOL: 18027, FORMAT: 'image/png', LAYER: 'graph', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });

    it('should failed as invalid branch', (done) => {
      chai.request(server)
        .get('/10/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/png', LAYER: 'opi', Name: '19FD5606Ax00020_16371', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(400);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('errors').equal('branch does not exist');
          done();
        });
    });
  });

  // GetFeatureInfo
  describe('GetFeatureInfo', () => {
    describe('query: LAYER=other', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .get('/0/wmts')
          .query({
            SERVICE: 'WMTS',
            REQUEST: 'GetFeatureInfo',
            VERSION: '1.0.0',
            LAYER: 'other',
            STYLE: 'normal',
            INFOFORMAT: 'application/gml+xml; version=3.1',
            TILEMATRIXSET: 'LAMB93_5cm',
            TILEMATRIX: 21,
            TILEROW: 34395,
            TILECOL: 18027,
            I: 139,
            J: 102,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('status').equal("'other': unsupported LAYER value");
            done();
          });
      });
    });
    describe('query: STYLE=other', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .get('/0/wmts')
          .query({
            SERVICE: 'WMTS',
            REQUEST: 'GetFeatureInfo',
            VERSION: '1.0.0',
            LAYER: 'ortho',
            STYLE: 'other',
            INFOFORMAT: 'application/gml+xml; version=3.1',
            TILEMATRIXSET: 'LAMB93_5cm',
            TILEMATRIX: 21,
            TILEROW: 34395,
            TILECOL: 18027,
            I: 139,
            J: 102,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('status').equal("'other': unsupported STYLE value");
            done();
          });
      });
    });
    describe('query: TILEMATRIXSET=OTHER', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .get('/0/wmts')
          .query({
            SERVICE: 'WMTS',
            REQUEST: 'GetFeatureInfo',
            VERSION: '1.0.0',
            LAYER: 'ortho',
            STYLE: 'normal',
            INFOFORMAT: 'application/gml+xml; version=3.1',
            TILEMATRIXSET: 'Other_Xcm',
            TILEMATRIX: 21,
            TILEROW: 34395,
            TILECOL: 18027,
            I: 139,
            J: 102,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('status').equal("'Other_Xcm': unsupported TILEMATRIXSET value");
            done();
          });
      });
    });
    it('should return an xml', (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          SERVICE: 'WMTS',
          REQUEST: 'GetFeatureInfo',
          VERSION: '1.0.0',
          LAYER: 'ortho',
          STYLE: 'normal',
          INFOFORMAT: 'application/gml+xml; version=3.1',
          TILEMATRIXSET: 'LAMB93_5cm',
          TILEMATRIX: 21,
          TILEROW: 34402,
          TILECOL: 18027,
          I: 139,
          J: 102,
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('text/html');

          done();
        });
    });
    it("should return a warning: 'missing'", (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          SERVICE: 'WMTS',
          REQUEST: 'GetFeatureInfo',
          VERSION: '1.0.0',
          LAYER: 'ortho',
          STYLE: 'normal',
          INFOFORMAT: 'application/gml+xml; version=3.1',
          TILEMATRIXSET: 'LAMB93_5cm',
          TILEMATRIX: 21,
          TILEROW: 34402,
          TILECOL: 18027,
          I: 44,
          J: 215,
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          res.type.should.be.a('string').equal('text/html');
          done();
        });
    });
    it("should return an error: 'out of bounds'", (done) => {
      chai.request(server)
        .get('/0/wmts')
        .query({
          SERVICE: 'WMTS',
          REQUEST: 'GetFeatureInfo',
          VERSION: '1.0.0',
          LAYER: 'ortho',
          STYLE: 'normal',
          INFOFORMAT: 'application/gml+xml; version=3.1',
          TILEMATRIXSET: 'LAMB93_5cm',
          TILEMATRIX: 21,
          TILEROW: 34395,
          TILECOL: 180270,
          I: 139,
          J: 102,
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(400);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('status').equal('out of bounds');

          done();
        });
    });
  });
});
