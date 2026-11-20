const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const app = require('../..');

const cachePath = './cache_test/cache_test_RGBIR';
const overviews = JSON.parse(fs.readFileSync(`${cachePath}/overviews.json`, 'utf8'));
const cacheName = 'cacheRegress';
const testOpi = '19FD5606Ax00020_16371';

const crs = 'urn:ogc:def:crs:EPSG::2154';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName1 = 'patchRegress1';
const branchName2 = 'patchRegress2';
const idBranch = {};
function setIdBranch(name, id) {
  idBranch[name] = id;
}

describe('route/backup.js', () => {
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
    it('should return a branchId1', (done) => {
      chai.request(app)
        .post('/branch')
        .query({
          name: branchName1,
          idCache,
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('id');
          setIdBranch(branchName1, resJson.id);
          resJson.should.have.property('name').equal(branchName1);
          done();
        });
    });
    it('should return a branchId2', (done) => {
      chai.request(app)
        .post('/branch')
        .query({
          name: branchName2,
          idCache,
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('id');
          setIdBranch(branchName2, resJson.id);
          resJson.should.have.property('name').equal(branchName2);
          done();
        });
    });
  });

  describe('apply test patch', () => {
    it('apply patch - return slab impacted', (done) => {
      chai.request(app)
        .post(`/${idBranch[branchName1]}/patches`)
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
              geometry: { type: 'Polygon', coordinates: [[[230758.15, 6759644.78], [230758.78, 6759644.7], [230758.73, 6759644.05], [230758.1, 6759644.08], [230758.15, 6759644.78]]] },
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

  describe('backup idBranch', () => {
    it('idBranch=99999 => should return an error', (done) => {
      chai.request(app)
        .post('/99999/backup')
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(400);
          const resJson = JSON.parse(res.text);
          resJson.should.be.an('array').to.have.lengthOf(1);
          resJson[0].should.have.property('status').equal("Le paramètre 'idBranch' n'est pas valide.");
          done();
        });
    });
    it('should return an error, no active patch in branch', (done) => {
      chai.request(app)
        .post(`/${idBranch[branchName2]}/backup`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(406);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('msg').equal(`NoActivePatch: No patches to save on the ${idBranch[branchName2]} branch.`);
          done();
        });
    });
    it('should return idBackup and date', (done) => {
      chai.request(app)
        .post(`/${idBranch[branchName1]}/backup`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('id');
          resJson.should.have.property('date');
          resJson.should.have.property('last_included_patch_id');
          chai.request(app)
            .get(`/${idBranch[branchName1]}/patches?nbPatches=1`)
            .end((err2, res2) => {
              should.not.exist(err2);
              res2.should.have.status(200);
              const resJson2 = JSON.parse(res2.text);
              resJson2.features.should.have.lengthOf(1);
              resJson2.features[0].properties.should.have.property('id', resJson.last_included_patch_id);
              done();
            });
        });
    });
    it('should return list of backup (1)', (done) => {
      chai.request(app)
        .get(`/${idBranch[branchName1]}/backups`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.be.an('array').to.have.lengthOf(1);
          resJson[0].should.have.property('id').that.is.a('number');
          resJson[0].should.have.property('last_included_patch_id').that.is.a('number');
          resJson[0].should.have.property('date').that.is.a('string');
          done();
        });
    });
    it('should return an error NoNewPatch', (done) => {
      chai.request(app)
        .get(`/${idBranch[branchName1]}/backups`)
        .end((errb, resb) => {
          should.not.exist(errb);
          resb.should.have.status(200);
          chai.request(app)
            .post(`/${idBranch[branchName1]}/backup`)
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(406);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('msg').equal('NoNewPatch: No new patches since the last backup on this branch');
              done();
            });
        });
    });
    it('should return no undo', (done) => {
      chai.request(app)
        .put(`/${idBranch[branchName1]}/patch/undo`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(201);
          JSON.parse(res.text).should.equal('patch saved, no undo');
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
