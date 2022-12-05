const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');

const app = require('../..');

// const cachePath = '/cache_regress';
const cachePath = './cache_test/cache_test_RGBIR';
const overviews = JSON.parse(fs.readFileSync(`${cachePath}/overviews.json`, 'utf8'));
const cacheName = 'cacheRegress';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

describe('route/cache.js', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('GET /caches', () => {
    describe('query all caches', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .get('/caches')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array');
            done();
          });
      });
    });
  });

  describe('POST /cache', () => {
    describe('insert a cache with no name', () => {
      // no change in test coverage but it's checked in the code
      it('should return an error', (done) => {
        chai.request(app)
          .post('/cache')
          .query({
            path: cachePath,
          })
          .send(overviews)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'name' est requis.");
            done();
          });
      });
    });
    describe('insert a cache with a valid overviews.json', () => {
      it('should succeed', (done) => {
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
    describe('insert a cache already in the base', () => {
      it('should return an error', (done) => {
        chai.request(app)
          .post('/cache')
          .query({
            name: cacheName,
            path: cachePath,
          })
          .send(overviews)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('object');
            resJson.should.have.property('msg').equal('A cache with this name already exists.');
            done();
          });
      });
    });
    describe('insert a cache with an overviews.json with no key list_OPI', () => {
      it('should return an error', (done) => {
        delete overviews.list_OPI;
        chai.request(app)
          .post('/cache')
          .query({
            name: cacheName,
            path: cachePath,
          })
          .send(overviews)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'list_OPI' est requis.");
            done();
          });
      });
    });
  });

  describe('DELETE /cache', () => {
    describe('delete a valid cache', () => {
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
    describe('delete a non existing cache', () => {
      it('should failed', (done) => {
        chai.request(app)
          .delete('/cache')
          .query({ idCache: 99999 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idCache' n'est pas valide.");
            done();
          });
      });
    });
  });
});

describe('middlewares/cache.js', () => {
  describe('getCachePath', () => {
    it('not tested yet', (done) => {
      done();
    });
  });
  describe('getOverviews', () => {
    it('not tested yet', (done) => {
      done();
    });
  });
});
