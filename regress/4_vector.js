const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const GJV = require('geojson-validation');
const app = require('..');

const params = [
  // Les caches générés par l'intégration continue
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgb',
    cachePath: 'cache_regress_RGB',
    idCache: null,
    idBranch: {},
    idVector: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgbir',
    cachePath: 'cache_regress_RGBIR',
    idCache: null,
    idBranch: {},
    idVector: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_IR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressIr',
    cachePath: 'cache_regress_IR',
    idCache: null,
    idBranch: {},
    idVector: {},
  },
  // Les caches présents dans le dépôt
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgb',
    cachePath: 'cache_test/cache_test_RGB/',
    idCache: null,
    idBranch: {},
    idVector: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgbir',
    cachePath: 'cache_test/cache_test_RGBIR/',
    idCache: null,
    idBranch: {},
    idVector: {},
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_IR/overviews.json', 'utf8')),
    cacheName: 'cacheTestIr',
    cachePath: 'cache_test/cache_test_IR/',
    idCache: null,
    idBranch: {},
    idVector: {},
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

function setIdVector(cacheName, branchName, idVector) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idVector[branchName] = idVector;
      /* eslint-enable no-param-reassign */
    }
  });
}

const branchName = 'vectorRegress';
const vector = JSON.parse(fs.readFileSync('./regress/data/vector.json', 'utf8'));

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
        it('should return an empty list of vectors', (done) => {
          chai.request(app)
            .get(`/${param.idBranch[branchName]}/vectors`)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.be.a('array');
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
              resJson.should.have.property('msg').equal("vector 'vector_example' (1 feature(s)) ajouté.");
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
        it('should return an empty list of vectors', (done) => {
          chai.request(app)
            .get('/vector')
            .query({ idVector: param.idVector[branchName] })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
              GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
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
              resJson.should.equal(`vecteur '${vector.metadonnees.name}' détruit (sur la branche '${branchName}')`);
              done();
            });
        });
      });
      describe('Vector non valid', () => {
        it('should failed', (done) => {
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
