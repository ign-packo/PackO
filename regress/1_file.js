const chai = require('chai');
chai.use(require('chai-http'));
// chai.use(require('chai-json-schema'));

const should = chai.should();
const app = require('..');

const cachePath = 'cache_test/cache_test_RGB';

describe('Files', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('GET /files/{filetype}', () => {
    describe('filetype = overviews', () => {
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
      it('should return an error (Missing file)', (done) => {
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
      it('should return an error (Missing folder)', (done) => {
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
    describe('filetype = other and no cachePath', () => {
      it('should return an error (Missing folder)', (done) => {
        chai.request(app)
          .get('/json/other')
          .query({})
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(2);
            resJson[0].should.have.property('status').equal("Le paramètre 'typefile' n'est pas valide.");
            resJson[1].should.have.property('status').equal("Le paramètre 'cachePath' est requis.");
            done();
          });
      });
    });
  });
});
