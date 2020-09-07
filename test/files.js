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
    describe('filetype = ortho', () => {
      it('should return a json file', (done) => {
        chai.request(server)
          .get('/json/ortho')
          .end((err, res) => {
            should.not.exist(err);
            res.should.be.a('object');
            res.should.have.status(200);
            res.body.should.be.a('object');
            res.body.should.have.property('id').equal('ortho');

            done();
          });
      });
    });
    describe('filetype = opi', () => {
      it('should return a json file', (done) => {
        chai.request(server)
          .get('/json/opi')
          .end((err, res) => {
            should.not.exist(err);
            res.should.be.a('object');
            res.should.have.status(200);
            res.body.should.be.a('object');
            res.body.should.have.property('id').equal('opi');

            done();
          });
      });
    });
  });
});
