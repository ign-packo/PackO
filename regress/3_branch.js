const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');

const app = require('..');

const overviews = JSON.parse(fs.readFileSync('./regress/data/regress_overviews_rgb.json', 'utf8'));
const cacheName = 'cacheRegressRgb';
const cachePath = 'cache_test/cache_test_RGB';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'branchRegress';
const idBranch = {};
function setIdBranch(type, id) {
  idBranch[type] = id;
}

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
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array');
            done();
          });
      });
    });
    describe('query all branches on a specified cache', () => {
      it(`on ${cacheName} => should return a list of branches`, (done) => {
        chai.request(app)
          .get('/branches')
          .query({ idCache })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson[0].should.have.property('name').equal('orig');
            setIdBranch('orig', resJson[0].id);
            done();
          });
      });
      it('(idCache = 99999) => should return a error', (done) => {
        chai.request(app)
          .get('/branches')
          .query({ idCache: 99999 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idCache' n'est pas valide.");
            done();
          });
      });
    });
  });

  describe('POST /branch', () => {
    describe('post a valid branch', () => {
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
            setIdBranch('newBranch', resJson.id);
            resJson.should.have.property('name').equal(branchName);
            done();
          });
      });
      it(' on a non valid cache => should return an error', (done) => {
        chai.request(app)
          .post('/branch')
          .query({
            name: branchName,
            idCache: 99999,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idCache' n'est pas valide.");
            done();
          });
      });
    });
    describe('post a branch already added', () => {
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
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('object');
            resJson.should.have.property('msg').equal('A branch with this name already exists.');
            done();
          });
      });
    });
  });

  describe('POST /{idBranch}/rebase', () => {
    describe('rebase valid branches', () => {
      it('should succeed', (done) => {
        const idB = idBranch.orig;
        chai.request(app)
          .post(`/${idB}/rebase`)
          .query({
            name: 'rebase',
            idBase: idBranch.newBranch,
          })
          .end((err, res) => {
            should.not.exist(err);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('name').equal('rebase');
            resJson.should.have.property('id');
            resJson.should.have.property('idProcess');
            // on vérifie que le idProcess est accessible
            const { idProcess } = resJson;
            chai.request(app)
              .get(`/process/${idProcess}`)
              .end((err2, res2) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson2 = JSON.parse(res2.text);
                resJson2.should.have.property('id').equal(idProcess);
                resJson2.should.have.property('start_date');
                resJson2.should.have.property('end_date');
                resJson2.should.have.property('status');
                resJson2.should.have.property('result');
                done();
              });
          });
      });
    });
    describe('rebase non valid branches', () => {
      it('should succeed', (done) => {
        const idB = 99999;
        chai.request(app)
          .post(`/${idB}/rebase`)
          .query({
            name: 'rebase',
            idBase: 99999,
          })
          .end((err, res) => {
            should.not.exist(err);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(2);
            resJson[0].should.have.property('status').equal("Le paramètre 'idBase' n'est pas valide.");
            resJson[1].should.have.property('status').equal("Le paramètre 'idBranch' n'est pas valide.");
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
          .query({ idBranch: idBranch.newBranch })
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
          .query({ idBranch: 99999 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idBranch' n'est pas valide.");
            done();
          });
      });
    });
    describe('delete a non destructible branch (orig)', () => {
      it('should failed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ idBranch: idBranch.orig })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('msg').equal(`Branch '${idBranch.orig}' can't be deleted.`);
            done();
          });
      });
    });
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
