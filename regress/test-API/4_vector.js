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

const vector = JSON.parse(fs.readFileSync('./regress/data/extra_layers/vector.json', 'utf8'));
const vectorName = vector.metadonnees.name;
const testBranchName = 'vectorRegress';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const idBranch = {};
function setIdBranch(branchName, id) {
  idBranch[branchName] = id;
}

const idVector = {};
function setIdVector(branchName, id) {
  idVector[branchName] = id;
}

const idRemarksVector = {};
function setIdRemarksVector(branchName, id) {
  idRemarksVector[branchName] = id;
}

const idFeature = {};
function setIdFeature(branchName, id) {
  idFeature[branchName] = id;
}

describe('route/vector.js', () => {
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
          name: testBranchName,
          idCache,
        })
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('id');
          setIdBranch(testBranchName, resJson.id);
          resJson.should.have.property('name').equal(testBranchName);
          done();
        });
    });
  });

  describe('GET /{idBranch}/vectors', () => {
    describe('on the new created branch', () => {
      it("should return an empty list of vectors but 'Remarques'", (done) => {
        chai.request(app)
          .get(`/${idBranch[testBranchName]}/vectors`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.a('array');
            resJson.should.have.length(1);
            resJson[0].should.have.property('name').equal('Remarques');
            setIdRemarksVector(testBranchName, resJson[0].id);
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

  describe('POST /{idBranch}/vector', () => {
    describe('body: {}', () => {
      it('should return an error', (done) => {
        chai.request(app)
          .post(`/${idBranch[testBranchName]}/vector`)
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
          .post(`/${idBranch[testBranchName]}/vector`)
          .send(vector)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('id');
            setIdVector(testBranchName, resJson.id);
            resJson.should.have.property('msg').equal(`vector '${vectorName}' (1 feature(s)) ajouté.`);
            done();
          });
      });
    });
    describe('post a vector already added (same name)', () => {
      it('should return a error', (done) => {
        chai.request(app)
          .post(`/${idBranch[testBranchName]}/vector`)
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

  describe('GET/vector', () => {
    describe('idVector = id New Vector', () => {
      it('should return a geojson', (done) => {
        chai.request(app)
          .get('/vector')
          .query({ idVector: idVector[testBranchName] })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
            GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
            resJson.should.have.property('name').equal(vectorName);
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

  describe('GET/{idBranch}/vector', () => {
    describe('name = name New Vector', () => {
      it('should return a geojson', (done) => {
        chai.request(app)
          .get(`/${idBranch[testBranchName]}/vector`)
          .query({ name: vectorName })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            GJV.isGeoJSONObject(resJson).should.be.a('boolean').equal(true);
            GJV.isFeatureCollection(resJson).should.be.a('boolean').equal(true);
            resJson.should.have.property('name').equal(vectorName);
            done();
          });
      });
    });
  });

  describe('DELETE/vector', () => {
    describe('valid vector (vector_example)', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .delete('/vector')
          .query({ idVector: idVector[testBranchName] })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`vecteur '${vectorName}' détruit (sur la branche '${testBranchName}')`);
            done();
          });
      });
    });
    describe('NON valid vector', () => {
      it('should fail', (done) => {
        chai.request(app)
          .delete('/vector')
          .query({ idVector: idVector[testBranchName] })
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

  describe('PUT/{idRemarksVector}/feature', () => {
    describe('NON valid idRemarksVector', () => {
      it('should fail', (done) => {
        chai.request(app)
          .put('/99999/feature')
          .query({ x: 0, y: 0, comment: 'test' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idRemarksVector' n'est pas valide.");
            done();
          });
      });
    });
    describe('should return the id on the newly created feature', () => {
      it('should succeed', (done) => {
        const x = 0;
        const y = 0;
        chai.request(app)
          .put(`/${idRemarksVector[testBranchName]}/feature`)
          .query({ x, y, comment: 'test' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('idFeature');
            setIdFeature(testBranchName, resJson.idFeature);
            resJson.should.have.property('msg').equal(`un point a été ajouté aux coordonnées ${x},${y} sur la couche 'Remarques' (id : ${idRemarksVector[testBranchName]})`);
            done();
          });
      });
    });
  });

  describe('PUT/vector/{idFeature}', () => {
    describe('NON valid idFeature', () => {
      it('should fail', (done) => {
        chai.request(app)
          .put('/vector/99999')
          .query({ status: 'true' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idFeature' n'est pas valide.");
            done();
          });
      });
    });
    describe('should change the status of the feature', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .put(`/vector/${idFeature[testBranchName]}`)
          .query({ status: 'true' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`feature '${idFeature[testBranchName]}' mis à jour`);
            done();
          });
      });
    });
    describe('should change the comment of the feature', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .put(`/vector/${idFeature[testBranchName]}`)
          .query({ comment: 'test modified' })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`feature '${idFeature[testBranchName]}' mis à jour`);
            done();
          });
      });
    });
  });

  describe('DELETE/{idRemarksVector}/feature', () => {
    describe('NON valid idRemarksVector', () => {
      it('should fail', (done) => {
        chai.request(app)
          .delete('/99999/feature')
          .query({ id: idFeature[testBranchName] })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idRemarksVector' n'est pas valide.");
            done();
          });
      });
    });
    describe("on 'Remarques' layer", () => {
      it('should succeed', (done) => {
        chai.request(app)
          .delete(`/${idRemarksVector[testBranchName]}/feature`)
          .query({ id: idFeature[testBranchName] })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('idLayer');
            resJson.should.have.property('msg').equal(`le point '${idFeature[testBranchName]}' a été supprimé de la couche 'Remarques' (id : ${resJson.idLayer})`);
            done();
          });
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
