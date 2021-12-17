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
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgbir',
    cachePath: 'cache_regress_RGBIR',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_IR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressIr',
    cachePath: 'cache_regress_IR',
  },
  // Les caches présents dans le dépôt
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgb',
    cachePath: 'cache_test/cache_test_RGB/',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgbir',
    cachePath: 'cache_test/cache_test_RGBIR/',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_IR/overviews.json', 'utf8')),
    cacheName: 'cacheTestIr',
    cachePath: 'cache_test/cache_test_IR/',
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

describe('Cache', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('GET /caches', () => {
    describe('query all caches', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .get('/caches')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array');
            done();
          });
      });
    });
  });

  describe('POST /cache', () => {
    params.forEach((param) => {
      describe(`insert an overviews.json on ${param.cacheName}`, () => {
        it('should succeed', (done) => {
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
              // setIdCache(resJson.id_cache);
              // setCacheName(param.cacheName)
              setIdCache(param.cacheName, resJson.id_cache);
              resJson.should.have.property('name').equal(param.cacheName);
              done();
            });
        });
      });
      describe(`insert a cache already in the base on ${param.cacheName}`, () => {
        it('should return an error', (done) => {
          chai.request(app)
            .post('/cache')
            .query({
              name: param.cacheName,
              path: param.cachePath,
            })
            .send(param.overviews)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(406);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('object');
              resJson.should.have.property('msg').equal('A cache with this name already exists.');
              done();
            });
        });
      });
      describe(`insert an overviews.json on ${param.cacheName}`, () => {
        it(' list_OPI = [] => should return an error', (done) => {
          const paramTest = param;
          delete paramTest.overviews.list_OPI;
          chai.request(app)
            .post('/cache')
            .query({
              name: paramTest.cacheName,
              path: paramTest.cachePath,
            })
            .send(paramTest.overviews)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("Le paramètre 'list_OPI' est requis.");
              done();
            });
        });
      });
    });
  });

  describe('DELETE /cache', () => {
    params.forEach((param) => {
      describe(`delete a valid cache on ${param.cacheName}`, () => {
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
    });
    describe('delete a non existing cache', () => {
      it('should failed', (done) => {
        chai.request(app)
          .delete('/cache')
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
});
