const chai = require('chai');
chai.use(require('chai-http'));
// chai.use(require('chai-json-schema'));

const should = chai.should();
const app = require('..');

describe('Files', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('GET /files/{filetype}', () => {
    describe('filetype = graph', () => {
      it('should return a json file', (done) => {
        chai.request(app)
          .get('/json/overviews')
          .end((err, res) => {
            should.not.exist(err);
            res.should.be.a('object');
            res.should.have.status(200);
            res.body.should.be.a('object');
            res.body.should.have.property('identifier').equal('LAMB93_5cm');
            res.body.should.have.property('dataSet');

            done();
          });
      });
    });
    describe('filetype = test', () => {
      it('should return an error', (done) => {
        chai.request(app)
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
