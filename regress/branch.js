const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const server = require('..');

describe('Branch', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('GET /branches', () => {
    describe('query all branches ', () => {
      it('should return a list of branches', (done) => {
        chai.request(server)
          .get('/branches')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            done();
          });
      });
    });
    describe('add a valid branch', () => {
      it('should return a branchId', (done) => {
        chai.request(server)
          .post('/branch')
          .query({ name: 'test' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('name').equal('test');
            done();
          });
      });
    });
    describe('add a non valid branch', () => {
      it('should return a error', (done) => {
        chai.request(server)
          .post('/branch')
          .query({ name: 'test' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            done();
          });
      });
    });
    describe('create a new branch with rebase', () => {
      it('should return a branchId', (done) => {
        chai.request(server)
          .post('/rebase')
          .query({ name: 'rebased', firstId: 0, secondId: 1 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('id').equal(2);
            resJson.should.have.property('name').equal('rebased');
            done();
          });
      });
    });
    describe('delete a valid branch', () => {
      it('should return done', (done) => {
        chai.request(server)
          .delete('/branch/1')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.text.should.equal('branch 1 deleted');
            done();
          });
      });
    });
    describe('delete a valid branch', () => {
      it('should return done', (done) => {
        chai.request(server)
          .delete('/branch/2')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.text.should.equal('branch 2 deleted');
            done();
          });
      });
    });
    describe('delete the last branch', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .delete('/branch/0')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            res.text.should.equal('it is not possible to delete the last branch');
            done();
          });
      });
    });
  });
});
