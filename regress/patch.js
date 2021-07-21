const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const GJV = require('geojson-validation');
const server = require('..');

describe('Patch', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('POST /0/patch', () => {
    describe('body: {}', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .post('/0/patch')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            done();
          });
      });
    });
    describe('body: polygon geoJson', () => {
      it('should apply the patch and return the liste of tiles impacted', (done) => {
        chai.request(server)
          .post('/0/patch')
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: { color: [119, 72, 57], cliche: '19FD5606Ax00020_16371' },
                geometry: { type: 'Polygon', coordinates: [[[230748, 6759646], [230752, 6759646], [230752, 6759644], [230748, 6759644], [230748, 6759646]]] },
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
      // TODO gestion des polygones Out of bounds
      it("should get an error: 'File(s) missing", (done) => {
        chai.request(server)
          .post('/0/patch')
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: { color: [58, 149, 47], cliche: '19FD5606Ax00020_16371' },
                geometry: { type: 'Polygon', coordinates: [[[230760, 6759736], [230746, 6759736], [230746, 6759734], [230748, 6759734], [230760, 6759736]]] },
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

  describe('GET /0/patches', () => {
    it('should return an valid geoJson', (done) => {
      chai.request(server)
        .get('/0/patches')
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

  describe('PUT /0/patch/undo', () => {
    it("should return 'undo: patch 1 canceled'", (done) => {
      chai.request(server)
        .put('/0/patch/undo')
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.text.should.equal('undo: patch 1 canceled');
          done();
        });
    });
    it("should return a warning (code 201): 'nothing to undo'", (done) => {
      chai.request(server)
        .put('/0/patch/undo')
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          res.text.should.equal('nothing to undo');
          done();
        });
    });
  });
  describe('PUT /0/patch/redo', () => {
    it("should return 'redo: patch 1 reapplied'", (done) => {
      chai.request(server)
        .put('/0/patch/redo')
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          res.text.should.equal('redo: patch 1 reapplied');
          done();
        });
    });
    it("should return a warning (code 201): 'nothing to redo'", (done) => {
      chai.request(server)
        .put('/0/patch/redo')
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          res.text.should.equal('nothing to redo');
          done();
        });
    });
  });
  describe('PUT /0/patches/clear', () => {
    it("should return a warning (code 401): 'unauthorized'", (done) => {
      chai.request(server)
        .put('/0/patches/clear')
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(401);
          res.text.should.equal('unauthorized');
          done();
        });
    }).timeout(9000);
    it("should return 'clear: all patches deleted'", (done) => {
      // Ajout d'un nouveau patch
      chai.request(server)
        .post('/0/patch')
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
          chai.request(server)
            .put('/0/patch/undo')
            .end((err1, res1) => {
              should.not.exist(err1);
              res1.should.have.status(200);
              res1.text.should.equal('undo: patch 2 canceled');

              // Pour faire le clear
              chai.request(server)
                .put('/0/patches/clear?test=true')
                .end((err2, res2) => {
                  should.not.exist(err2);
                  res2.should.have.status(200);
                  res2.text.should.equal('clear: all patches deleted');
                  done();
                });
            });
        });

      // chai.request(server)
      //   .put('/0/patches/clear?test=true')
      //   .end((err, res) => {
      //     should.not.exist(err);
      //     res.should.have.status(200);
      //     res.text.should.equal('clear: all patches deleted');
      //     done();
      //   });
    }).timeout(9000);
    it("should return a warning (code 201): 'nothing to clear'", (done) => {
      chai.request(server)
        .put('/0/patches/clear?test=true')
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          res.text.should.equal('nothing to clear');
          done();
        });
    });
  });
});
