const chai = require('chai');
chai.use(require('chai-http'));
// chai.use(require('chai-json-schema'));

const should = chai.should();
const server = require('..');

describe('Files', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('GET /files/{filetype}', () => {
    describe('filetype = graph', () => {
      it('should return a json file', (done) => {
        chai.request(server)
          .get('/json/graph')
          .end((err, res) => {
            should.not.exist(err);
            res.should.be.a('object');
            res.should.have.status(200);
            res.body.should.be.a('object');
            res.body.should.have.property('id').equal('graph');

            done();
          });
      });
    });
    describe('filetype = test', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .get('/json/test')
          .end((err, res) => {
            should.not.exist(err);
            res.should.be.a('object');
            res.should.have.status(404);
            res.body.should.be.a('object');
            res.body.should.have.property('status').equal("Le fichier demandé (test.json) n'existe pas");

            done();
          });
      });
    });
  });
});
