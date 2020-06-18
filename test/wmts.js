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
});
