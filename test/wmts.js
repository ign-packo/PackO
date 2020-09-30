const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const server = require('..');

describe('Wmts', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('GET /wmts?SERVICE=OTHER&REQUEST=GetCapabilities', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/wmts')
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

  describe('GET /wmts?SERVICE=WMTS&REQUEST=Other', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/wmts')
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

   describe('GetFeatureInfo', () => {
       describe('query: LAYER=other', () => {
        it('should return an error', (done) => {
          chai.request(server)
            .get('/wmts')
            .query({ REQUEST: 'GetFeatureInfo', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, INFOFORMAT: 'application/gml+xml; version=3.1', LAYER: 'other', STYLE: 'normal' })
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
            .get('/wmts')
            .query({ REQUEST: 'GetFeatureInfo', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, INFOFORMAT: 'application/gml+xml; version=3.1', LAYER: 'ortho', STYLE: 'other' })
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
            .get('/wmts')
            .query({ REQUEST: 'GetFeatureInfo', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'OTHER', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, INFOFORMAT: 'application/gml+xml; version=3.1', LAYER: 'ortho', STYLE: 'normal' })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('status').equal("'OTHER': unsupported TILEMATRIXSET value");
              done();
            });
        });
      });



    });

  describe('GetCapabilities', () => {
    it('should return the Capabilities.xml', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({ REQUEST: 'GetCapabilities', SERVICE: 'WMTS', VERSION: '1.0.0' })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/xml');

          done();
        });
    });
  });

  describe('GetTile', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/autre', LAYER: 'ortho', STYLE: 'normal',
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
        .get('/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/png', LAYER: 'ortho', STYLE: 'normal',
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
        .get('/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/jpeg', LAYER: 'ortho', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });
  });

  describe('GetFeatureInfo', () => {
    it('should return an xml', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({
          REQUEST: 'GetFeatureInfo', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93', TILEMATRIX: 21, TILEROW: 409395, TILECOL: 18027, I: 10, J: 10, INFOFORMAT: 'application/gml xml; version=3.1', LAYER: 'ortho', STYLE: 'normal',
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('text/html');

          done();
        });
    });
  });
});
