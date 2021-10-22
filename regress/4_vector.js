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

const branchName = 'vectorRegress';
let idBranch = null;
function setIdBranch(id) {
  idBranch = id;
}

const vector = JSON.parse(fs.readFileSync('./regress/data/vector.json', 'utf8'));
let idVector = null;
const vectorName = vector.metadonnees.name;
function setIdVector(id) {
  idVector = id;
}

describe('Vector', () => {
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

  describe('GET /{idBranch}/vectors', () => {
    describe('on the new created branch', () => {
      it('should return an empty list of vectors', (done) => {
        chai.request(app)
          .get(`/${idBranch}/vectors`)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.a('array');
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
          .post(`/${idBranch}/vector`)
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
          .post(`/${idBranch}/vector`)
          .send(vector)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('id');
            setIdVector(resJson.id);
            resJson.should.have.property('msg').equal("vector 'vector_example' (1 feature(s)) ajouté.");
            done();
          });
      });
    });
    describe('post a vector already added (same name)', () => {
      it('should return a error', (done) => {
        chai.request(app)
          .post(`/${idBranch}/vector`)
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
      it('should return an empty list of vectors', (done) => {
        chai.request(app)
          .get('/vector')
          .query({ idVector })
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
  describe('DELETE/vector', () => {
    describe('Vector valid: vector_example', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .delete('/vector')
          .query({ idVector })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`vecteur '${vectorName}' détruit (sur la branche '${branchName}')`);
            done();
          });
      });
    });
    describe('Vector non valid', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .delete('/vector')
          .query({ idVector })
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
