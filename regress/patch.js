const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const GJV = require('geojson-validation');
const server = require('..');

describe('Patch', function () {
  let idBranch;
  let idPatch;

  before(function (done) {
    // on crée une branche spécialement pour ces tests
    chai.request(server)
      .post('/branch')
      .query({ name: 'test_regress_patch' })
      .end((err, res) => {
        should.not.exist(err);
        res.should.have.status(200);
        const branch = JSON.parse(res.text);
        idBranch = branch.id;
        done();
      });
  });

  after(function (done) {
    // on detruit la branche créée spécialement pour ces tests
    chai.request(server)
      .delete(`/branch/${idBranch}`)
      .end((err, res) => {
        should.not.exist(err);
        res.should.have.status(200);
        server.close();
        done();
      });
  });

  describe('POST a null patch', function () {
    it('should return an error', function (done) {
      chai.request(server)
        .post(`/${idBranch}/patch`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(400);
          done();
        });
    });
  });

  describe('POST a valid patch on', function () {
    it('should apply the patch and return the liste of tiles impacted', (done) => {
      chai.request(server)
        .post(`/${idBranch}/patch`)
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
  });

  describe('POST a valid patch with missing OPI', function () {
    it("should get an error: 'File(s) missing", (done) => {
      chai.request(server)
        .post(`/${idBranch}/patch`)
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

  describe('GET patches', function () {
    it('should return an valid geoJson', (done) => {
      chai.request(server)
        .get(`/${idBranch}/patches`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
          GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
          idPatch = resJson.features[0].properties.id;
          done();
        });
    });
  });

  describe('PUT /patch/undo', function () {
    it("should return 'undo: patch N canceled'", function (done) {
      chai.request(server)
        .put(`/${idBranch}/patch/undo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal(`undo: patch ${idPatch} canceled`);
          done();
        });
    });

    it("should return a warning (code 201): 'nothing to undo'", function (done) {
      chai.request(server)
        .put(`/${idBranch}/patch/undo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          JSON.parse(res.text).should.equal('nothing to undo');
          done();
        });
    });
  });

  describe('PUT /patch/redo', function () {
    it("should return 'redo: patch 1 reapplied'", function (done) {
      chai.request(server)
        .put(`/${idBranch}/patch/redo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          JSON.parse(res.text).should.equal(`redo: patch ${idPatch} reapplied`);
          done();
        });
    });
    it("should return a warning (code 201): 'nothing to redo'", function (done) {
      chai.request(server)
        .put(`/${idBranch}/patch/redo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          JSON.parse(res.text).should.equal('nothing to redo');
          done();
        });
    });
  });

  describe('PUT patches/clear', function () {
    // it("should return a warning (code 401): 'unauthorized'", function (done) {
    //   chai.request(server)
    //     .put(`/${idBranch}/patches/clear`)
    //     .end((err, res) => {
    //       should.not.exist(err);
    //       res.should.have.status(401);
    //       res.text.should.equal('unauthorized');
    //       done();
    //     });
    // }).timeout(9000);
    it("should return 'clear: all patches deleted'", function (done) {
      // Ajout d'un nouveau patch
      chai.request(server)
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
          chai.request(server)
            .put(`/${idBranch}/patch/undo`)
            .end((err1, res1) => {
              should.not.exist(err1);
              res1.should.have.status(200);

              // Pour faire le clear
              chai.request(server)
                .put(`/${idBranch}/patches/clear?test=true`)
                .end((err2, res2) => {
                  should.not.exist(err2);
                  res2.should.have.status(200);
                  JSON.parse(res2.text).should.equal('clear: all patches deleted');
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
    // it("should return a warning (code 201): 'nothing to clear'", function (done) {
    //   chai.request(server)
    //     .put(`/${idBranch}/patches/clear?test=true`)
    //     .end((err, res) => {
    //       should.not.exist(err);
    //       res.should.have.status(201);
    //       res.text.should.equal('nothing to clear');
    //       done();
    //     });
    // });
  });
});
