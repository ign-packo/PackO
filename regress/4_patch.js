const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const GJV = require('geojson-validation');
const app = require('..');

const overviews = JSON.parse(fs.readFileSync('./cache_test/overviews.json', 'utf8'));
const cacheName = 'cacheRegress';
const cachePath = 'cache_test';

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
    it("should return 'undo: patch 1 canceled'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/undo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal('undo: patch 1 canceled');
          done();
        });
    });
    it("should return a warning (code 201): 'nothing to undo'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/undo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          JSON.parse(res.text).should.equal('nothing to undo');
          done();
        });
    });
  });

  describe('PUT /{idBranch}/patch/redo', () => {
    it("should return 'redo: patch 1 reapplied'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/redo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal('redo: patch 1 reapplied');
          done();
        });
    });
    it("should return a warning (code 201): 'nothing to redo'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patch/redo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          JSON.parse(res.text).should.equal('nothing to redo');
          done();
        });
    });
  });

  describe('PUT /{idBranch}/patches/clear', () => {
    it("should return a warning (code 401): 'unauthorized'", (done) => {
      chai.request(app)
        .put(`/${idBranch}/patches/clear`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(401);
          JSON.parse(res.text).should.equal('unauthorized');
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
              JSON.parse(res1.text).should.equal('undo: patch 2 canceled');

              // Pour faire le clear
              chai.request(app)
                .put(`/${idBranch}/patches/clear?test=true`)
                .end((err2, res2) => {
                  should.not.exist(err2);
                  res2.should.have.status(200);
                  JSON.parse(res2.text).should.equal('clear: all patches deleted');
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
          JSON.parse(res.text).should.equal('nothing to clear');
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
