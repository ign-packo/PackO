const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('..');

const should = chai.should();
chai.use(chaiHttp);

describe('Graph', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('Get graph', () => {
    it('should return an Id', (done) => {
      chai.request(server)
        .get('/graph')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          done();
        });
    });
  });

  describe('Post graph/patch', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/graph/patch')
        .query({ cliche: -1 })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(404);
          // res.body.status.should.equal("Le paramètre 'id_session' est invalide.");
          done();
        });
    });
  });
});
