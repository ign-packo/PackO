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

const branchName = 'wmtsRegress';

describe('Wmts', () => {
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

    describe(`GET /{idBranch}/wmts?SERVICE=OTHER&REQUEST=GetCapabilities on ${param.cacheName}`, () => {
      it('should return an error', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({ REQUEST: 'GetCapabilities', SERVICE: 'OTHER', VERSION: '1.0.0' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("'OTHER': unsupported SERVICE value");
            done();
          });
      });
    });

    describe(`GET /{idBranch}/wmts?SERVICE=WMTS&REQUEST=Other on ${param.cacheName}`, () => {
      it('should return an error', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({ REQUEST: 'Other', SERVICE: 'WMTS', VERSION: '1.0.0' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("'Other': unsupported REQUEST value");
            done();
          });
      });
    });

    // GetCapabilities
    describe(`GetCapabilities on ${param.cacheName}`, () => {
      it('should return the Capabilities.xml', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({ REQUEST: 'GetCapabilities', SERVICE: 'WMTS', VERSION: '1.0.0' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/xml');
            done();
          });
      });
    });

    // GetTile
    describe(`GetTile on ${param.cacheName}`, () => {
      it('should return an error', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/autre', LAYER: 'ortho', STYLE: 'normal',
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("'image/autre': unsupported FORMAT value");
            done();
          });
      });

      it('should return a png image', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/png', LAYER: 'ortho', STYLE: 'normal',
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/octet-stream');
            done();
          });
      });

      it('should return a RVB jpeg image', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/jpeg', LAYER: 'ortho', STYLE: 'RVB',
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/octet-stream');
            done();
          });
      });

      it('should return a IRC jpeg image', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/jpeg', LAYER: 'ortho', STYLE: 'IRC',
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/octet-stream');
            done();
          });
      });

      it('should return a IR jpeg image', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 12, TILEROW: 0, TILECOL: 0, FORMAT: 'image/jpeg', LAYER: 'ortho', STYLE: 'IR',
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/octet-stream');
            done();
          });
      });

      it("should return the OPI '19FD5606Ax00020_16371' as png", (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 21, TILEROW: 34402, TILECOL: 18027, FORMAT: 'image/png', LAYER: 'opi', Name: '19FD5606Ax00020_16371', STYLE: 'normal',
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/octet-stream');
            done();
          });
      });

      it('should return the default OPI as png', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            REQUEST: 'GetTile', SERVICE: 'WMTS', VERSION: '1.0.0', TILEMATRIXSET: 'LAMB93_5cm', TILEMATRIX: 21, TILEROW: 34402, TILECOL: 18027, FORMAT: 'image/png', LAYER: 'opi', STYLE: 'normal',
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/octet-stream');
            done();
          });
      });
    });

    // GetFeatureInfo
    describe(`GetFeatureInfo on ${param.cacheName}`, () => {
      describe('query: LAYER=other', () => {
        it('should return an error', (done) => {
          chai.request(app)
            .get(`/${param.idBranch[branchName]}/wmts`)
            .query({
              SERVICE: 'WMTS',
              REQUEST: 'GetFeatureInfo',
              VERSION: '1.0.0',
              LAYER: 'other',
              STYLE: 'normal',
              INFOFORMAT: 'application/gml+xml; version=3.1',
              TILEMATRIXSET: 'LAMB93_5cm',
              TILEMATRIX: 21,
              TILEROW: 34395,
              TILECOL: 18027,
              I: 139,
              J: 102,
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("'other': unsupported LAYER value");
              done();
            });
        });
      });
      describe('query: STYLE=other', () => {
        it('should return an error', (done) => {
          chai.request(app)
            .get(`/${param.idBranch[branchName]}/wmts`)
            .query({
              SERVICE: 'WMTS',
              REQUEST: 'GetFeatureInfo',
              VERSION: '1.0.0',
              LAYER: 'ortho',
              STYLE: 'other',
              INFOFORMAT: 'application/gml+xml; version=3.1',
              TILEMATRIXSET: 'LAMB93_5cm',
              TILEMATRIX: 21,
              TILEROW: 34395,
              TILECOL: 18027,
              I: 139,
              J: 102,
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("'other': unsupported STYLE value");
              done();
            });
        });
      });
      describe('query: TILEMATRIXSET=OTHER', () => {
        it('should return an error', (done) => {
          chai.request(app)
            .get(`/${param.idBranch[branchName]}/wmts`)
            .query({
              SERVICE: 'WMTS',
              REQUEST: 'GetFeatureInfo',
              VERSION: '1.0.0',
              LAYER: 'ortho',
              STYLE: 'normal',
              INFOFORMAT: 'application/gml+xml; version=3.1',
              TILEMATRIXSET: 'Other_Xcm',
              TILEMATRIX: 21,
              TILEROW: 34395,
              TILECOL: 18027,
              I: 139,
              J: 102,
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status')
                .equal("'Other_Xcm': unsupported TILEMATRIXSET value");
              done();
            });
        });
      });
      it('should succeed (return an xml)', (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            SERVICE: 'WMTS',
            REQUEST: 'GetFeatureInfo',
            VERSION: '1.0.0',
            LAYER: 'ortho',
            STYLE: 'normal',
            INFOFORMAT: 'application/gml+xml; version=3.1',
            TILEMATRIXSET: 'LAMB93_5cm',
            TILEMATRIX: 21,
            TILEROW: 34402,
            TILECOL: 18027,
            I: 139,
            J: 102,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            res.type.should.be.a('string').equal('application/xml');

            done();
          });
      });
      describe('query: TILEMATRIX={out of limit}', () => {
        it('should return an error', (done) => {
          chai.request(app)
            .get(`/${param.idBranch[branchName]}/wmts`)
            .query({
              SERVICE: 'WMTS',
              REQUEST: 'GetFeatureInfo',
              VERSION: '1.0.0',
              LAYER: 'ortho',
              STYLE: 'normal',
              INFOFORMAT: 'application/gml+xml; version=3.1',
              TILEMATRIXSET: 'LAMB93_5cm',
              TILEMATRIX: 25,
              TILEROW: 34402,
              TILECOL: 18027,
              I: 139,
              J: 102,
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(400);
              const resJson = JSON.parse(res.text);
              resJson.should.be.an('array').to.have.lengthOf(1);
              resJson[0].should.have.property('status').equal("Le paramètre 'TILEMATRIX' n'est pas valide.");
              done();
            });
        });
      });
      it("should return a warning: 'missing'", (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            SERVICE: 'WMTS',
            REQUEST: 'GetFeatureInfo',
            VERSION: '1.0.0',
            LAYER: 'ortho',
            STYLE: 'normal',
            INFOFORMAT: 'application/gml+xml; version=3.1',
            TILEMATRIXSET: 'LAMB93_5cm',
            TILEMATRIX: 21,
            TILEROW: 34402,
            TILECOL: 18027,
            I: 44,
            J: 215,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(201);
            res.type.should.be.a('string').equal('application/xml');
            done();
          });
      });
      it("should return an error: 'out of bounds'", (done) => {
        chai.request(app)
          .get(`/${param.idBranch[branchName]}/wmts`)
          .query({
            SERVICE: 'WMTS',
            REQUEST: 'GetFeatureInfo',
            VERSION: '1.0.0',
            LAYER: 'ortho',
            STYLE: 'normal',
            INFOFORMAT: 'application/gml+xml; version=3.1',
            TILEMATRIXSET: 'LAMB93_5cm',
            TILEMATRIX: 21,
            TILEROW: 34395,
            TILECOL: 180270,
            I: 139,
            J: 102,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('status').equal('out of bounds');
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
