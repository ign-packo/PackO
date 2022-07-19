const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();

const app = require('../../serveur');

describe('routes/processQueue.js', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('GET /processes', () => {
    describe('query all processes', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .get('/processes')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            done();
          });
      });
    });
  });

  describe('GET /process/:idProcess', () => {
    describe('query a process', () => {
      it('idProcess = 9999 => should failed', (done) => {
        chai.request(app)
          .get('/process/9999')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idProcess' n'est pas valide.");
            done();
          });
      });
      it('idProcess valide => not tested yet', (done) => {
        done();
      });
    });
  });
});
