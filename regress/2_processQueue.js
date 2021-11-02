const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();

const app = require('../serveur');

describe('Process', () => {
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
});
