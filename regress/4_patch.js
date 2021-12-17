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
    testCliche: '19FD5606Ax00020_16371',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgbir',
    cachePath: 'cache_regress_RGBIR',
    idCache: null,
    idBranch: {},
    testCliche: '19FD5606Ax00020_16371',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_IR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressIr',
    cachePath: 'cache_regress_IR',
    idCache: null,
    idBranch: {},
    testCliche: '19FD5606A_ix00020_16371',
  },
  // Les caches présents dans le dépôt
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgb',
    cachePath: 'cache_test/cache_test_RGB/',
    idCache: null,
    idBranch: {},
    testCliche: '19FD5606Ax00020_16371',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgbir',
    cachePath: 'cache_test/cache_test_RGBIR/',
    idCache: null,
    idBranch: {},
    testCliche: '19FD5606Ax00020_16371',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_IR/overviews.json', 'utf8')),
    cacheName: 'cacheTestIr',
    cachePath: 'cache_test/cache_test_IR/',
    idCache: null,
    idBranch: {},
    testCliche: '19FD5606A_ix00020_16371',
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

const branchName = 'patchRegress';

describe('Patch', () => {
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

    describe(`POST /{idBranch}/patch on ${param.cacheName}`, () => {
      describe('body: {}', () => {
        it('should return an error', (done) => {
          chai.request(app)
            .post(`/${param.idBranch[branchName]}/patch`)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(5);
              resJson[0].should.have.property('status').equal('Un body non vide est requis.');
              done();
            });
        });
      });
      describe('body: polygon geoJson', () => {
        it('should apply the patch and return the list of tiles impacted', (done) => {
          chai.request(app)
            .post(`/${param.idBranch[branchName]}/patch`)
            .send({
              type: 'FeatureCollection',
              crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
              features: [
                {
                  type: 'Feature',
                  properties: {
                    color: param.overviews.list_OPI[param.testCliche].color,
                    cliche: param.testCliche,
                  },
                  geometry: { type: 'Polygon', coordinates: [[[230749, 6759646], [230752, 6759646], [230752, 6759644], [230749, 6759644], [230749, 6759646]]] },
                }],
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.be.a('array');
              done();
            });
        }).timeout(9000);
        it("should get an error: 'File(s) missing / out of boundaries", (done) => {
          chai.request(app)
            .post(`/${param.idBranch[branchName]}/patch`)
            .send({
              type: 'FeatureCollection',
              crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
              features: [
                {
                  type: 'Feature',
                  properties: {
                    color: param.overviews.list_OPI[param.testCliche].color,
                    cliche: param.testCliche,
                  },
                  geometry: { type: 'Polygon', coordinates: [[[230748, 6759736], [230746, 6759736], [230746, 6759734], [230748, 6759734], [230748, 6759736]]] },
                }],
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(404);
              done();
            });
        }).timeout(9000);
      });
    });

    describe(`GET /{idBranch}/patches on ${param.cacheName}`, () => {
      it('should return an valid geoJson', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/patches`)
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

    describe(`PUT /{idBranch}/patch/undo on ${param.cacheName}`, () => {
      it("should return 'undo: patch 1 annulé'", (done) => {
        chai.request(app)
          .put(`/${param.idBranch[branchName]}/patch/undo`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            JSON.parse(res.text).should.equal('undo: patch 1 annulé');
            done();
          });
      });
      it("should return a warning (code 201): 'rien à annuler'", (done) => {
        chai.request(app)
          .put(`/${param.idBranch[branchName]}/patch/undo`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(201);
            JSON.parse(res.text).should.equal('rien à annuler');
            done();
          });
      });
      it('idBranch=99999 => should return an error', (done) => {
        chai.request(app)
          .put('/99999/patch/undo')
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

    describe(`PUT /{idBranch}/patch/redo on ${param.cacheName}`, () => {
      it("should return 'redo: patch xxx réappliqué'", (done) => {
        chai.request(app)
          .put(`/${param.idBranch[branchName]}/patch/redo`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            JSON.parse(res.text).should.to.include('réappliqué');
            done();
          });
      });
      it("should return a warning (code 201): 'rien à réappliquer'", (done) => {
        chai.request(app)
          .put(`/${param.idBranch[branchName]}/patch/redo`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(201);
            JSON.parse(res.text).should.equal('rien à réappliquer');
            done();
          });
      });
      it("should return 'redo: patch xxx réappliqué'", (done) => {
      // Ajout d'un nouveau patch
        chai.request(app)
          .post(`/${param.idBranch[branchName]}/patch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: {
                  color: param.overviews.list_OPI[param.testCliche].color,
                  cliche: param.testCliche,
                },
                geometry: { type: 'Polygon', coordinates: [[[230748, 6759646], [230752, 6759646], [230752, 6759644], [230748, 6759644], [230748, 6759646]]] },
              }],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.a('array');

            // Avant de l'annuler
            chai.request(app)
              .put(`/${param.idBranch[branchName]}/patch/undo`)
              .end((err1, res1) => {
                should.not.exist(err1);
                res1.should.have.status(200);
                JSON.parse(res1.text).should.equal('undo: patch 2 annulé');

                // Pour refaire un redo
                chai.request(app)
                  .put(`/${param.idBranch[branchName]}/patch/redo`)
                  .end((err2, res2) => {
                    should.not.exist(err2);
                    res2.should.have.status(200);
                    JSON.parse(res2.text).should.equal('redo: patch 2 réappliqué');
                    done();
                  });
              });
          });
      }).timeout(9000);
      it('idBranch=99999 => should return an error', (done) => {
        chai.request(app)
          .put('/99999/patch/redo')
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

    describe(`PUT /{idBranch}/patches/clear on  on ${param.cacheName}`, () => {
      it("should return a warning (code 401): 'non autorisé'", (done) => {
        chai.request(app)
          .put(`/${param.idBranch[branchName]}/patches/clear`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(401);
            JSON.parse(res.text).should.equal('non autorisé');
            done();
          });
      }).timeout(9000);
      it("should return 'clear: all patches deleted'", (done) => {
      // Ajout d'un nouveau patch
        chai.request(app)
          .post(`/${param.idBranch[branchName]}/patch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: {
                  color: param.overviews.list_OPI[param.testCliche].color,
                  cliche: param.testCliche,
                },
                geometry: { type: 'Polygon', coordinates: [[[230748, 6759646], [230752, 6759646], [230752, 6759644], [230748, 6759644], [230748, 6759646]]] },
              }],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.a('array');

            // Avant de l'annuler
            chai.request(app)
              .put(`/${param.idBranch[branchName]}/patch/undo`)
              .end((err1, res1) => {
                should.not.exist(err1);
                res1.should.have.status(200);
                JSON.parse(res1.text).should.equal('undo: patch 3 annulé');

                // Pour faire le clear
                chai.request(app)
                  .put(`/${param.idBranch[branchName]}/patches/clear?test=true`)
                  .end((err2, res2) => {
                    should.not.exist(err2);
                    res2.should.have.status(200);
                    JSON.parse(res2.text).should.equal('clear: tous les patches ont été effacés');
                    done();
                  });
              });
          });
      }).timeout(9000);
      it("should return a warning (code 201): 'nothing to clear'", (done) => {
        chai.request(app)
          .put(`/${param.idBranch[branchName]}/patches/clear?test=true`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(201);
            JSON.parse(res.text).should.equal('rien à nettoyer');
            done();
          });
      });
      it('idBranch=99999 => should return an error', (done) => {
        chai.request(app)
          .put('/99999/patches/clear?test=true')
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
