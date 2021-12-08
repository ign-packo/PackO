const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const GJV = require('geojson-validation');
const app = require('..');

const overviews = JSON.parse(fs.readFileSync('./cache_test/cache_test_RGB/overviews.json', 'utf8'));
const cacheName = 'cacheTestRgb';
const cachePath = 'cache_test/cache_test_RGB';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'patchRegress';
let idBranch = null;
function setIdBranch(id) {
  idBranch = id;
}

describe('Patch', () => {
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
          setIdBranch(resJson.id);
          resJson.should.have.property('name').equal(branchName);
          done();
        });
    });
  });

  describe('POST /{idBranch}/patch', () => {
    describe('body: {}', () => {
      it('should return an error', (done) => {
        chai.request(app)
          .post(`/${idBranch}/patch`)
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
      it('should apply the patch and return the liste of tiles impacted', (done) => {
        chai.request(app)
          .post(`/${idBranch}/patch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: { color: [119, 72, 57], cliche: '19FD5606Ax00020_16371' },
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
      // it('should succed / out of graph', (done) => {
      //   chai.request(app)
      //     .post(`/${idBranch}/patch`)
      //     .send({
      //       type: 'FeatureCollection',
      //       crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
      //       features: [
      //         {
      //           type: 'Feature',
      //           properties: { color: [58, 149, 47], cliche: '19FD5606Ax00020_16371' },
      //           geometry: {
      //             type: 'Polygon',
      //             coordinates: [[[230748, 6759646], [230752, 6759646], [230752, 6759644],
      //               [230748, 6759644], [230748, 6759646]]],
      //           },
      //         }],
      //     })
      //     .end((err, res) => {
      //       should.not.exist(err);
      //       // res.should.have.status(404);
      //       const resJson = JSON.parse(res.text);
      //       resJson.should.be.a('array');
      //       done();
      //     });
      // }).timeout(9000);
      it("should get an error: 'File(s) missing / out of boundaries", (done) => {
        chai.request(app)
          .post(`/${idBranch}/patch`)
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: { color: [58, 149, 47], cliche: '19FD5606Ax00020_16371' },
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

  describe('GET /{idBranch}/patches', () => {
    it('should return an valid geoJson', (done) => {
      chai.request(app)
        .get(`/${idBranch}/patches`)
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

  describe('PUT /{idBranch}/patch/undo', () => {
    it("should return 'undo: patch 1 annulé'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/undo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal('undo: patch 1 annulé');
          done();
        });
    });
    it("should return a warning (code 201): 'rien à annuler'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/undo`)
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

  describe('PUT /{idBranch}/patch/redo', () => {
    it("should return 'redo: patch 1 réappliqué'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/redo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal('redo: patch 1 réappliqué');
          done();
        });
    });
    it("should return a warning (code 201): 'rien à réappliquer'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/redo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          JSON.parse(res.text).should.equal('rien à réappliquer');
          done();
        });
    });
    it("should return 'redo: patch 2 réappliqué'", (done) => {
      // Ajout d'un nouveau patch
      chai.request(app)
        .post(`/${idBranch}/patch`)
        .send({
          type: 'FeatureCollection',
          crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
          features: [
            {
              type: 'Feature',
              properties: { color: [58, 149, 47], cliche: '19FD5606Ax00020_16371' },
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
            .put(`/${idBranch}/patch/undo`)
            .end((err1, res1) => {
              should.not.exist(err1);
              res1.should.have.status(200);
              JSON.parse(res1.text).should.equal('undo: patch 2 annulé');

              // Pour refaire un redo
              chai.request(app)
                .put(`/${idBranch}/patch/redo`)
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

  describe('PUT /{idBranch}/patches/clear', () => {
    it("should return a warning (code 401): 'non autorisé'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patches/clear`)
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
        .post(`/${idBranch}/patch`)
        .send({
          type: 'FeatureCollection',
          crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
          features: [
            {
              type: 'Feature',
              properties: { color: [58, 149, 47], cliche: '19FD5606Ax00020_16371' },
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
            .put(`/${idBranch}/patch/undo`)
            .end((err1, res1) => {
              should.not.exist(err1);
              res1.should.have.status(200);
              JSON.parse(res1.text).should.equal('undo: patch 3 annulé');

              // Pour faire le clear
              chai.request(app)
                .put(`/${idBranch}/patches/clear?test=true`)
                .end((err2, res2) => {
                  should.not.exist(err2);
                  res2.should.have.status(200);
                  JSON.parse(res2.text).should.equal('clear: tous les patches ont été effacés');
                  done();
                });
            });
        });

      // chai.request(app)
      //   .put('/0/patches/clear?test=true')
      //   .end((err, res) => {
      //     should.not.exist(err);
      //     res.should.have.status(200);
      //     res.text.should.equal('clear: all patches deleted');
      //     done();
      //   });
    }).timeout(9000);
    it("should return a warning (code 201): 'nothing to clear'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patches/clear?test=true`)
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
