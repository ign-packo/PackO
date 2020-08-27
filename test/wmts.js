const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('..');
// const mocha = require('mocha');

const should = chai.should();
chai.use(chaiHttp);

const schema = {
  title: 'test',
  type: 'object',
  required: ['color', 'cliche'],
  properties: {
    color: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'integer',
      },
    },
    cliche: {
      type: 'string',
    },
  },
};

describe('Wmts', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('GET /wmts?SERVICE=WRONG&REQUEST=GetCapabilities', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({ REQUEST: 'GetCapabilities', SERVICE: 'WRONG', VERSION: '1.0.0' })
        .end((err, res) => {
          // should.equal(err, null);
          res.should.have.status(400);
          done();
        });
    });
  });

  describe('GET /wmts?SERVICE=WMTS&REQUEST=Wrong', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({ REQUEST: 'Wrong', SERVICE: 'WMTS', VERSION: '1.0.0' })
        .end((err, res) => {
          // should.equal(err, null);
          res.should.have.status(400);
          done();
        });
    });
  });

  describe('GetCapabilities', () => {
    it('should return the Capabilities.xml', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({ REQUEST: 'GetCapabilities', SERVICE: 'WMTS', VERSION: '1.0.0' })
        .end((err, res) => {
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
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/autre', LAYER: 'ortho',
        })
        .end((err, res) => {
          res.should.have.status(400);
          done();
        });
    });

    it('should return an image png', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/png', LAYER: 'ortho',
        })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });

    it('should return an image jpeg', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/jpeg', LAYER: 'ortho',
        })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          res.type.should.be.a('string').equal('application/octet-stream');

          done();
        });
    });
  });

  describe('GetFeatureInfo', () => {
    it("should return a Json contening 'color' and 'cliche' (different de 'unknown')", (done) => {
      chai.request(server)
        .get('/wmts')
        .query({
          REQUEST: 'GetFeatureInfo', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIX: 21, TILEROW: 409395, TILECOL: 18027, I: 10, J: 10,
        })
        .end((err, res) => {
          // should.equal(err, null);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);

          resJson.should.be.jsonSchema(schema);
          resJson.should.have.property('cliche').not.equal('unknown');
          done();
        });
    });
  });
});
