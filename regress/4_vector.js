const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const GJV = require('geojson-validation');
const app = require('..');

const vector = JSON.parse(fs.readFileSync('./regress/data/vector.json', 'utf8'));
const vectorName = vector.metadonnees.name;
const branchName = 'vectorRegress';

const params = [
  // Les caches générés par l'intégration continue
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgb',
    cachePath: 'cache_regress_RGB',
    idCache: null,
    idBranch: {},
    idVector: {},
    idRemarksVector: {},
    idFeature: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgbir',
    cachePath: 'cache_regress_RGBIR',
    idCache: null,
    idBranch: {},
    idVector: {},
    idRemarksVector: {},
    idFeature: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_IR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressIr',
    cachePath: 'cache_regress_IR',
    idCache: null,
    idBranch: {},
    idVector: {},
    idRemarksVector: {},
    idFeature: {},
  },
  // Les caches présents dans le dépôt
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgb',
    cachePath: 'cache_test/cache_test_RGB/',
    idCache: null,
    idBranch: {},
    idVector: {},
    idRemarksVector: {},
    idFeature: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgbir',
    cachePath: 'cache_test/cache_test_RGBIR/',
    idCache: null,
    idBranch: {},
    idVector: {},
    idRemarksVector: {},
    idFeature: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_IR/overviews.json', 'utf8')),
    cacheName: 'cacheTestIr',
    cachePath: 'cache_test/cache_test_IR/',
    idCache: null,
    idBranch: {},
    idVector: {},
    idRemarksVector: {},
    idFeature: {},
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

function setIdBranch(cacheName, aBranchName, idBranch) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idBranch[aBranchName] = idBranch;
      /* eslint-enable no-param-reassign */
    }
  });
}

function setIdVector(cacheName, aBranchName, idVector) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idVector[aBranchName] = idVector;
      /* eslint-enable no-param-reassign */
    }
  });
}

function setIdRemarksVector(cacheName, aBranchName, idVector) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idRemarksVector[aBranchName] = idVector;
      /* eslint-enable no-param-reassign */
    }
  });
}

function setIdFeature(cacheName, aBranchName, idFeature) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idFeature[aBranchName] = idFeature;
      /* eslint-enable no-param-reassign */
    }
  });
}

describe('Vector', () => {
  after((done) => {
    app.server.close();
    done();
  });

  params.forEach((param) => {
    describe(`create a test cache on ${param.cacheName}`, () => {
      it('should return a cacheId', (done) => {
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
    });

    describe(`create a test branch on ${param.cacheName}`, () => {
      it('should return a branchId', (done) => {
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
    });

    describe(`GET /{idBranch}/vectors on ${param.cacheName}`, () => {
      describe('on the new created branch', () => {
        it("should return an empty list of vectors but 'Remarques'", (done) => {
          chai.request(app)
            .get(`/${param.idBranch[branchName]}/vectors`)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.be.a('array');
              resJson.should.have.length(1);
              resJson[0].should.have.property('name').equal('Remarques');
              setIdRemarksVector(param.cacheName, branchName, resJson[0].id);
              done();
            });
        });
      });
      describe('on a NONE valid branch', () => {
        it('should failed', (done) => {
          chai.request(app)
            .get('/99999/vectors')
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

    describe(`POST /{idBranch}/vector on ${param.cacheName}`, () => {
      describe('body: {}', () => {
        it('should return an error', (done) => {
          chai.request(app)
            .post(`/${param.idBranch[branchName]}/vector`)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(3);
              resJson[0].should.have.property('status').equal('Un body non vide est requis.');
              done();
            });
        });
      });
      describe('body: json from monitor', () => {
        it('should send the vector and return name and id of the vector added', (done) => {
          chai.request(app)
            .post(`/${param.idBranch[branchName]}/vector`)
            .send(vector)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('id');
              setIdVector(param.cacheName, branchName, resJson.id);
              resJson.should.have.property('msg').equal(`vector '${vectorName}' (1 feature(s)) ajouté.`);
              done();
            });
        });
      });
      describe('post a vector already added (same name)', () => {
        it('should return a error', (done) => {
          chai.request(app)
            .post(`/${param.idBranch[branchName]}/vector`)
            .send(vector)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(406);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('msg').equal('A vector with this name already exists.');
              done();
            });
        });
      });
    });

    describe(`GET/vector on ${param.cacheName}`, () => {
      describe('idVector = id New Vector', () => {
        it('should return a geojson', (done) => {
          chai.request(app)
            .get('/vector')
            .query({ idVector: param.idVector[branchName] })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
              GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
              resJson.should.have.property('name').equal(vectorName);
              done();
            });
        });
      });
      describe('idVector = 99999}', () => {
        it('should failed', (done) => {
          chai.request(app)
            .get('/vector')
            .query({ idVector: 99999 })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("Le paramètre 'idVector' n'est pas valide.");
              done();
            });
        });
      });
    });

    describe(`GET/{idBranch}/vector on ${param.cacheName}`, () => {
      describe('idVector = id New Vector', () => {
        it('should return a geojson', (done) => {
          chai.request(app)
            .get(`/${param.idBranch[branchName]}/vector`)
            .query({ name: vectorName })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
              GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
              resJson.should.have.property('name').equal(vectorName);
              done();
            });
        });
      });
    });

    describe(`DELETE/vector on ${param.cacheName}`, () => {
      describe('Vector valid: vector_example', () => {
        it('should succeed', (done) => {
          chai.request(app)
            .delete('/vector')
            .query({ idVector: param.idVector[branchName] })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.equal(`vecteur '${vectorName}' détruit (sur la branche '${branchName}')`);
              done();
            });
        });
      });
      describe('Vector non valid', () => {
        it('should succeed', (done) => {
          chai.request(app)
            .delete('/vector')
            .query({ idVector: param.idVector[branchName] })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("Le paramètre 'idVector' n'est pas valide.");
              done();
            });
        });
      });
    });

    describe(`PUT/{idRemarksVector}/feature on ${param.cacheName}`, () => {
      describe('idRemarksVector non valid', () => {
        it('should fail', (done) => {
          chai.request(app)
            .put('/99999/feature')
            .query({ x: 0, y: 0, comment: 'test' })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("Le paramètre 'idRemarksVector' n'est pas valide.");
              done();
            });
        });
      });
      describe('should return the id on the newly created feature', () => {
        it('should succeed', (done) => {
          const x = 0;
          const y = 0;
          chai.request(app)
            .put(`/${param.idRemarksVector[branchName]}/feature`)
            .query({ x, y, comment: 'test' })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('idFeature');
              setIdFeature(param.cacheName, branchName, resJson.idFeature);
              resJson.should.have.property('msg').equal(`un point a été ajouté aux coordonnées ${x},${y} sur la couche 'Remarques' (id : ${param.idRemarksVector[branchName]})`);
              done();
            });
        });
      });
    });

    describe(`PUT/vector/{idFeature} on ${param.cacheName}`, () => {
      describe('idFeature non valid', () => {
        it('should fail', (done) => {
          chai.request(app)
            .put('/vector/99999')
            .query({ status: 'true' })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("Le paramètre 'idFeature' n'est pas valide.");
              done();
            });
        });
      });
      describe('should change the status of the feature', () => {
        it('should succeed', (done) => {
          chai.request(app)
            .put(`/vector/${param.idFeature[branchName]}`)
            .query({ status: 'true' })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.equal(`feature '${param.idFeature[branchName]}' mis à jour`);
              done();
            });
        });
      });
      describe('should change the comment of the feature', () => {
        it('should succeed', (done) => {
          chai.request(app)
            .put(`/vector/${param.idFeature[branchName]}`)
            .query({ comment: 'test modified' })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.equal(`feature '${param.idFeature[branchName]}' mis à jour`);
              done();
            });
        });
      });
    });

    describe(`DELETE/{idRemarksVector}/feature on ${param.cacheName}`, () => {
      describe('idRemarksVector non valid', () => {
        it('should fail', (done) => {
          chai.request(app)
            .delete('/99999/feature')
            .query({ id: param.idFeature[branchName] })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("Le paramètre 'idRemarksVector' n'est pas valide.");
              done();
            });
        });
      });
      describe("on 'Remarques' layer", () => {
        it('should succeed', (done) => {
          chai.request(app)
            .delete(`/${param.idRemarksVector[branchName]}/feature`)
            .query({ id: param.idFeature[branchName] })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('idLayer');
              resJson.should.have.property('msg').equal(`le point '${param.idFeature[branchName]}' a été supprimé de la couche 'Remarques' (id : ${resJson.idLayer})`);
              done();
            });
        });
      });
    });

    describe(`delete the test cache on ${param.cacheName}`, () => {
      it('should succeed', (done) => {
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
    });
  });// params.forEach
});
