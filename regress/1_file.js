const chai = require('chai');
chai.use(require('chai-http'));
// chai.use(require('chai-json-schema'));

const should = chai.should();
const app = require('..');

const cachePath = 'cache_test';

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
          .query({ cachePath })
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
    describe('filetype = test (test.json is not a file)', () => {
      it('should return an error', (done) => {
        chai.request(app)
          .get('/json/test')
          .query({ cachePath })
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
    describe('filetype = overviews and cachePath = testPath (non valide)', () => {
      it('should return an error', (done) => {
        chai.request(app)
          .get('/json/overviews')
          .query({ cachePath: 'testPath' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.be.a('object');
            res.should.have.status(404);
            res.body.should.be.a('object');
            res.body.should.have.property('status').equal("Le dossier demandé (testPath) n'existe pas");

            done();
          });
      });
    });
  });
});
