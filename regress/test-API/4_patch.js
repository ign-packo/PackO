const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const GJV = require('geojson-validation');
const app = require('../..');

const cachePath = './cache_test/cache_test_RGBIR';
const overviews = JSON.parse(fs.readFileSync(`${cachePath}/overviews.json`, 'utf8'));
const cacheName = 'cacheRegress';
const testOpi = '19FD5606Ax00020_16371';
const testOpi2 = '19FD5606Ax00020_16372';

const crs = 'urn:ogc:def:crs:EPSG::2154';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'patchRegress';
const idBranch = {};
function setIdBranch(name, id) {
  idBranch[name] = id;
}

describe('route/multipatch.js', () => {
  after((done) => {
    app.server.close();
    done();
  });

  // params.forEach((param) => {
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

  describe('create a test branch', () => {
    it('should return a branchId', (done) => {
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
          setIdBranch(branchName, resJson.id);
          resJson.should.have.property('name').equal(branchName);
          done();
        });
    });
  });

  describe('POST /{idBranch}/multipatch', () => {
    describe('body: {}', () => {
      it('should return an error', (done) => {
        chai.request(app)
          .post(`/${idBranch[branchName]}/multipatch`)
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
      it('should apply multipatch and return the list of tiles impacted', (done) => {
        chai.request(app)
          .post(`/${idBranch[branchName]}/multipatch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: crs } },
            features: [
              {
                type: 'Feature',
                properties: {
                  color: overviews.list_OPI[testOpi].color,
                  opiName: testOpi,
                  is_auto: false,
                },
                geometry: { type: 'Polygon', coordinates: [[[230749, 6759646], [230752, 6759646], [230752, 6759644], [230749, 6759644], [230749, 6759646]]] },
              },
              {
                type: 'Feature',
                properties: {
                  color: overviews.list_OPI[testOpi].color,
                  opiName: testOpi,
                  is_auto: false,
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
          .post(`/${idBranch[branchName]}/multipatch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: crs } },
            features: [
              {
                type: 'Feature',
                properties: {
                  color: overviews.list_OPI[testOpi].color,
                  opiName: testOpi,
                  is_auto: false,
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
      it("should get a error: 'Le parametre geometry n'est pas un LineString valide.'", (done) => {
        chai.request(app)
          .post(`/${idBranch[branchName]}/multipatch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: crs } },
            features: [
              {
                type: 'Feature',
                properties: {
                  color: overviews.list_OPI[testOpi].color,
                  opiName: testOpi,
                  is_auto: true,
                },
                geometry: { type: 'Polygon', coordinates: [[[230749, 6759646], [230752, 6759646], [230752, 6759644], [230749, 6759644], [230749, 6759646]]] },
              }],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            done();
          });
      }).timeout(9000);
    });
    describe('body: linestring geoJson', () => {
      // waiting for ozcpp in ci
      it('should apply the semi auto patch and return the list of tiles impacted', (done) => {
        chai.request(app)
          .post(`/${idBranch[branchName]}/multipatch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: crs } },
            features: [
              {
                type: 'Feature',
                properties: {
                  color: overviews.list_OPI[testOpi].color,
                  opiName: testOpi,
                  colorSec: overviews.list_OPI[testOpi2].color,
                  opiNameSec: testOpi2,
                  is_auto: true,
                },
                geometry: { type: 'LineString', coordinates: [[230751, 6759645], [230750, 6759645], [230750, 6759644], [230751, 6759644]] },
              }],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            done();
          });
      }).timeout(9000);
      it("should get a error: 'Le parametre geometry n'est pas un Polygone valide.'", (done) => {
        chai.request(app)
          .post(`/${idBranch[branchName]}/multipatch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: crs } },
            features: [
              {
                type: 'Feature',
                properties: {
                  color: overviews.list_OPI[testOpi].color,
                  opiName: testOpi,
                  colorSec: overviews.list_OPI[testOpi2].color,
                  opiNameSec: testOpi2,
                  is_auto: false,
                },
                geometry: { type: 'LineString', coordinates: [[230751, 6759645], [230750, 6759645], [230750, 6759644], [230751, 6759644]] },
              }],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            done();
          });
      }).timeout(9000);
    });
  });

  describe('GET /{idBranch}/multipatches', () => {
    it('should return a valid geoJson', (done) => {
      chai.request(app)
        .get(`/${idBranch[branchName]}/multipatches`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
          GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
          resJson.crs.properties.name.should.to.equal(crs);
          done();
        });
    });
  });
  describe('GET /{idBranch}/lastpatches', () => {
    it('should return last patch on the branch with 3 patches', (done) => {
      chai.request(app)
        .get(`/${idBranch[branchName]}/lastpatches?nbPatches=1`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
          GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
          resJson.features.should.have.lengthOf(1);
          resJson.features[0].properties.should.have.property('num', 1);
          resJson.features[0].properties.should.have.property('id_block', 3);
          done();
        });
    });
    it('should return 3 patches when nbPatches=3 and there are 3 patches on the branch', (done) => {
      chai.request(app)
        .get(`/${idBranch[branchName]}/lastpatches?nbPatches=3`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
          GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
          resJson.features.should.have.lengthOf(3);
          done();
        });
    });
    it('should return 3 patches when nbPatches>3 and there are 3 patches on the branch', (done) => {
      chai.request(app)
        .get(`/${idBranch[branchName]}/lastpatches?nbPatches=100`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
          GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
          resJson.features.should.have.lengthOf(3);
          done();
        });
    });
  });

  describe('PUT /{idBranch}/multipatch/undo', () => {
    it("should return 'undo: multipatch 2 annulé'", (done) => {
      chai.request(app)
        .put(`/${idBranch[branchName]}/multipatch/undo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal('undo: multipatch 2 annulé');
          done();
        });
    });
    it("should return a warning (code 201): 'rien à annuler'", (done) => {
      chai.request(app)
        .put(`/${idBranch[branchName]}/multipatch/undo`)
        .end((errUndo, resUndo) => {
          should.not.exist(errUndo);
          resUndo.should.have.status(200);

          chai.request(app)
            .put(`/${idBranch[branchName]}/multipatch/undo`)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(201);
              JSON.parse(res.text).should.equal('rien à annuler');
              done();
            });
        });
    });
    it('idBranch=99999 => should return an error', (done) => {
      chai.request(app)
        .put('/99999/multipatch/undo')
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

  describe('PUT /{idBranch}/multipatch/redo', () => {
    it("should return 'redo: multipatch xxx réappliqué'", (done) => {
      chai.request(app)
        .put(`/${idBranch[branchName]}/multipatch/redo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.to.include('réappliqué');
          done();
        });
    });
    it("should return a warning (code 201): 'rien à réappliquer'", (done) => {
      chai.request(app)
        .put(`/${idBranch[branchName]}/multipatch/redo`)
        .end((errRedo, resRedo) => {
          should.not.exist(errRedo);
          resRedo.should.have.status(200);
          JSON.parse(resRedo.text).should.to.include('réappliqué');

          chai.request(app)
            .put(`/${idBranch[branchName]}/multipatch/redo`)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(201);
              JSON.parse(res.text).should.equal('rien à réappliquer');
              done();
            });
        });
    });
    it("should return 'redo: multipatch xxx réappliqué'", (done) => {
      // Ajout d'un nouveau patch
      chai.request(app)
        .post(`/${idBranch[branchName]}/multipatch`)
        .send({
          type: 'FeatureCollection',
          crs: { type: 'name', properties: { name: crs } },
          features: [
            {
              type: 'Feature',
              properties: {
                color: overviews.list_OPI[testOpi].color,
                opiName: testOpi,
                is_auto: false,
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
            .put(`/${idBranch[branchName]}/multipatch/undo`)
            .end((err1, res1) => {
              should.not.exist(err1);
              res1.should.have.status(200);
              JSON.parse(res1.text).should.equal('undo: multipatch 3 annulé');

              // Pour refaire un redo
              chai.request(app)
                .put(`/${idBranch[branchName]}/multipatch/redo`)
                .end((err2, res2) => {
                  should.not.exist(err2);
                  res2.should.have.status(200);
                  JSON.parse(res2.text).should.equal('redo: multipatch 3 réappliqué');
                  done();
                });
            });
        });
    }).timeout(9000);
    it('idBranch=99999 => should return an error', (done) => {
      chai.request(app)
        .put('/99999/multipatch/redo')
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

  describe('PUT /{idBranch}/multipatches/clear', () => {
    it("should return a warning (code 401): 'non autorisé'", (done) => {
      chai.request(app)
        .put(`/${idBranch[branchName]}/multipatches/clear`)
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
        .post(`/${idBranch[branchName]}/multipatch`)
        .send({
          type: 'FeatureCollection',
          crs: { type: 'name', properties: { name: crs } },
          features: [
            {
              type: 'Feature',
              properties: {
                color: overviews.list_OPI[testOpi].color,
                opiName: testOpi,
                is_auto: false,
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
            .put(`/${idBranch[branchName]}/multipatch/undo`)
            .end((err1, res1) => {
              should.not.exist(err1);
              res1.should.have.status(200);
              JSON.parse(res1.text).should.equal('undo: multipatch 4 annulé');

              // Pour faire le clear
              chai.request(app)
                .put(`/${idBranch[branchName]}/multipatches/clear?test=true`)
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
        .put(`/${idBranch[branchName]}/multipatches/clear?test=true`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          JSON.parse(res.text).should.equal('rien à nettoyer');
          done();
        });
    });
    it('idBranch=99999 => should return an error', (done) => {
      chai.request(app)
        .put('/99999/multipatches/clear?test=true')
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
  // });// params.forEach
});
