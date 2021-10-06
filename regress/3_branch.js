const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');

const app = require('..');

const overviews = JSON.parse(fs.readFileSync('./regress/data/regress_overviews.json', 'utf8'));
const cacheName = 'cacheRegress';
const cachePath = '/cache_regress';

// const idInvalidBranch = 9999;

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'branchRegress';
let idBranch = null;
function setIdBranch(id) {
  idBranch = id;
}

// const branchName2 = 'branchRegress2';
// let idBranch2 = null;
// function setIdBranch2(id) {
//   idBranch2 = id;
// }

// const branchName3 = 'branchRegress3';
// let idBranch3 = null;
// function setIdBranch3(id) {
//   idBranch3 = id;
// }

describe('Branch', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('create a test cache', () => {
    it('should return a cacheId', (done) => {
      chai.request(app)
        .post('/cache')
        .query({
          name: cacheName,
          path: cachePath,
        })
        .send(overviews)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('id_cache');
          setIdCache(resJson.id_cache);
          resJson.should.have.property('name').equal(cacheName);
          done();
        });
    });
  });

  describe('GET /branches', () => {
    describe('query all branches on all caches ', () => {
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
    describe('query all branches on a specified cache', () => {
      it('should return a list of branches', (done) => {
        chai.request(app)
          .get('/branches')
          .query({ idCache })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            done();
          });
      });
    });
  });

  describe('POST /branch', () => {
    describe('add a valid branch', () => {
      it('should return an idBranch', (done) => {
        chai.request(app)
          .post('/branch')
          .query({
            name: branchName,
            idCache,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('id');
            setIdBranch(resJson.id);
            resJson.should.have.property('name').equal(branchName);
            done();
          });
      });
    });
    describe('add a non valid branch', () => {
      it('should return a error', (done) => {
        chai.request(app)
          .post('/branch')
          .query({
            name: branchName,
            idCache,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            done();
          });
      });
    });
  });

  // describe('POST /rebase', () => {
  //   describe('add a second valid branch', () => {
  //     it('should return an idBranch', (done) => {
  //       chai.request(app)
  //         .post('/branch')
  //         .query({
  //           name: branchName2,
  //           idCache,
  //         })
  //         .end((err, res) => {
  //           should.not.exist(err);
  //           res.should.have.status(200);
  //           const resJson = JSON.parse(res.text);
  //           resJson.should.have.property('id');
  //           setIdBranch2(resJson.id);
  //           resJson.should.have.property('name').equal(branchName2);
  //           done();
  //         });
  //     });
  //   });
  //   describe('rebase two valid branches', () => {
  //     it('should return an idProcess', (done) => {
  //       chai.request(app)
  //         .post(`${idBranch}/rebase`)
  //         .query({
  //           name: branchName3,
  //           idBase: idBranch2,
  //         })
  //         .end((err, res) => {
  //           should.not.exist(err);
  //           res.should.have.status(200);
  //           done();
  //         });
  //     });
  //   });
  //   describe('rebase from a non existing branch', () => {
  //     it('should failed', (done) => {
  //       chai.request(app)
  //         .post(`${idInvalidBranch}/rebase`)
  //         .query({
  //           name: branchName3,
  //           idBase: idBranch2,
  //         })
  //         .end((err, res) => {
  //           should.not.exist(err);
  //           res.should.have.status(400);
  //           done();
  //         });
  //     });
  //   });
  //   describe('rebase on a non existing branch', () => {
  //     it('should failed', (done) => {
  //       chai.request(app)
  //         .post(`${idBranch}/rebase`)
  //         .query({
  //           name: branchName3,
  //           idBase: idInvalidBranch,
  //         })
  //         .end((err, res) => {
  //           should.not.exist(err);
  //           res.should.have.status(400);
  //           done();
  //         });
  //     });
  //   });
  // });

  describe('DELETE /branch', () => {
    describe('delete a valid branch', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ idBranch })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`branche '${branchName}' détruite`);
            done();
          });
      });
    });
    describe('delete a non existing branch', () => {
      it('should failed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ idBranch: 0 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            done();
          });
      });
    });
    // describe('delete a non destructible branch (orig)', () => {
    //   it('should failed', (done) => {
    //     chai.request(app)
    //       .delete('/branch')
    //       .query({ idBranch })
    //       .end((err, res) => {
    //         should.not.exist(err);
    //         res.should.have.status(406);
    //         done();
    //       });
    //   });
    // });
  });

  describe('delete the test cache', () => {
    it('should succeed', (done) => {
      chai.request(app)
        .delete('/cache')
        .query({ idCache })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.equal(`cache '${cacheName}' détruit`);
          done();
        });
    });
  });
});
