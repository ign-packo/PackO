const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const app = require('..');

let branchId = null;
const branchName = 'test';

function setIdBranch(id) {
  console.log('setIdBranch : ', id);
  branchId = id;
}

before((done) => {
  app.on('appStarted', function () {
    done();
  });
});

describe('Branch', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('GET /branches', () => {
    describe('query all branches ', () => {
      it('should return a list of branches', (done) => {
        chai.request(app)
          .get('/branches')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            done();
          });
      });
    });
  });

  describe('PUT /branch', () => {
    describe('add a valid branch', () => {
      it('should return a branchId', (done) => {
        chai.request(app)
          .post('/branch')
          .query({ name: branchName })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('id');
            setIdBranch(resJson.id);
            resJson.should.have.property('name').equal('test');
            done();
          });
      });
    });
    describe('add a non valid branch', () => {
      it('should return a error', (done) => {
        chai.request(app)
          .post('/branch')
          .query({ name: 'test' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            done();
          });
      });
    });
  });

  describe('DELETE /branch', () => {
    describe('delete a valid branch', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ branchId })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`branche '${branchName}' détruite`);
            done();
          });
      });
    });
    describe('delete a non valid branch', () => {
      it('should failed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ branchId: 0 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            done();
          });
      });
    });
  });
});
