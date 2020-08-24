const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('..');
// const mocha = require('mocha');

const should = chai.should();
chai.use(chaiHttp);

describe('Wmts', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('Wrong service', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({ REQUEST: 'GetCapabilities', SERVICE: 'WRONG', VERSION: '1.0.0' })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(400);
          done();
        });
    });
  });

  describe('Wrong request', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({ REQUEST: 'WRONG', SERVICE: 'WMTS', VERSION: '1.0.0' })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(400);
          done();
        });
    });
  });

  describe('Get Capabilities', () => {
    it('should return an xml', (done) => {
      // setTimeout(done, 10000);
      chai.request(server)
        .get('/wmts')
        .query({ REQUEST: 'GetCapabilities', SERVICE: 'WMTS', VERSION: '1.0.0' })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          // res.body.should.be.an('array');
          done();
        });
    }).timeout(20000);
  });

  describe('Get Tile', () => {
    it('should return an image', (done) => {
      // setTimeout(done, 10000);
      chai.request(server)
        .get('/wmts')
        .query({
          REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/png', LAYER: 'ortho',
        })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          // res.body.should.be.an('array');
          done();
        });
    });
  });

  describe('Get FeatureInfo', () => {
    it('should return a valid json', (done) => {
      chai.request(server)
        .get('/wmts')
        .query({
          REQUEST: 'GetFeatureInfo', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, I: 0, J: 0,
        })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          const json = JSON.parse(res.text);
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
          json.should.be.jsonSchema(schema);
          json.cliche.should.to.equal('unknown');
          done();
        });
    });
  });
});
