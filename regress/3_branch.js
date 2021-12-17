const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');

const app = require('..');

const params = [
  // Les caches générés par l'intégration continue
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgb',
    cachePath: 'cache_regress_RGB',
    idCache: null,
    idBranch: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgbir',
    cachePath: 'cache_regress_RGBIR',
    idCache: null,
    idBranch: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_IR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressIr',
    cachePath: 'cache_regress_IR',
    idCache: null,
    idBranch: {},
  },
  // Les caches présents dans le dépôt
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgb',
    cachePath: 'cache_test/cache_test_RGB/',
    idCache: null,
    idBranch: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgbir',
    cachePath: 'cache_test/cache_test_RGBIR/',
    idCache: null,
    idBranch: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_IR/overviews.json', 'utf8')),
    cacheName: 'cacheTestIr',
    cachePath: 'cache_test/cache_test_IR/',
    idCache: null,
    idBranch: {},
  },
];

function setIdCache(cacheName, idCache) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idCache = idCache;
      /* eslint-enable no-param-reassign */
    }
  });
}

function setIdBranch(cacheName, branchName, idBranch) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idBranch[branchName] = idBranch;
      /* eslint-enable no-param-reassign */
    }
  });
}

const branchName = 'branchRegress';

describe('Branch', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('create a test cache', () => {
    params.forEach((param) => {
      it(`should return a cacheId on ${param.cacheName}`, (done) => {
        chai.request(app)
          .post('/cache')
          .query({
            name: param.cacheName,
            path: param.cachePath,
          })
          .send(param.overviews)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('id_cache');
            setIdCache(param.cacheName, resJson.id_cache);
            resJson.should.have.property('name').equal(param.cacheName);
            done();
          });
      });
    });// params.forEach
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
      params.forEach((param) => {
        it(`on ${param.cacheName} => should return a list of branches`, (done) => {
          chai.request(app)
            .get('/branches')
            .query({ idCache: param.idCache })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson[0].should.have.property('name').equal('orig');
              setIdBranch(param.cacheName, 'orig', resJson[0].id);
              done();
            });
        }); // params.forEach
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
      params.forEach((param) => {
        it(`should return an idBranch on ${param.cacheName}`, (done) => {
          chai.request(app)
            .post('/branch')
            .query({
              name: branchName,
              idCache: param.idCache,
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('id');
              setIdBranch(param.cacheName, branchName, resJson.id);
              resJson.should.have.property('name').equal(branchName);
              done();
            });
        });
      });// param.forEach
      it('on a non valid cache => should return an error', (done) => {
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
      params.forEach((param) => {
        it(`should return a error on ${param.cacheName}`, (done) => {
          chai.request(app)
            .post('/branch')
            .query({
              name: branchName,
              idCache: param.idCache,
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
      });// param.forEach
    });
  });

  describe('POST /{idBranch}/rebase', () => {
    params.forEach((param) => {
      describe(`rebase valid branches on ${param.cacheName}`, () => {
        it('should succeed', (done) => {
          chai.request(app)
            .post(`/${param.idBranch.orig}/rebase`)
            .query({
              name: 'rebase',
              idBase: param.idBranch[branchName],
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
    });// param.forEach
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
    params.forEach((param) => {
      describe(`delete a valid branch on ${param.cacheName}`, () => {
        it('should succeed', (done) => {
          chai.request(app)
            .delete('/branch')
            .query({ idBranch: param.idBranch[branchName] })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.equal(`branche '${branchName}' détruite`);
              done();
            });
        });
      });
      describe(`delete a non destructible branch (orig) on ${param.cacheName}`, () => {
        it('should failed', (done) => {
          chai.request(app)
            .delete('/branch')
            .query({ idBranch: param.idBranch.orig })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(406);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('msg').equal(`Branch '${param.idBranch.orig}' can't be deleted.`);
              done();
            });
        });
      });
    });// param.forEach
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
  });

  describe('delete the test cache', () => {
    params.forEach((param) => {
      it(`should succeed on ${param.cacheName}`, (done) => {
        chai.request(app)
          .delete('/cache')
          .query({ idCache: param.idCache })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`cache '${param.cacheName}' détruit`);
            done();
          });
      });
    });// param.forEach
  });
});
