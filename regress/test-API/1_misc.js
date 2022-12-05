const chai = require('chai');
chai.use(require('chai-http'));
// chai.use(require('chai-json-schema'));

const should = chai.should();
const app = require('../..');

describe('Miscellanous', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('GET /version', () => {
    it('should return an object with git version', (done) => {
      chai.request(app)
        .get('/version')
        .end((err, res) => {
          should.not.exist(err);
          res.should.be.a('object');
          res.should.have.status(200);
          res.body.should.be.a('object');
          done();
        });
    });
  });
});
