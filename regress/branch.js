const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const server = require('..');

let idBranch = null;

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
          idBranch = resJson.id;
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
  describe('delete a valid branch', () => {
    it('should return done', (done) => {
      chai.request(server)
        .delete(`/branch/${idBranch}`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal(`branch ${idBranch} deleted`);
          done();
        });
    });
  });
});
