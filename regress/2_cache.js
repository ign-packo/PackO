const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');

const app = require('..');

const overviews = JSON.parse(fs.readFileSync('./regress/data/regress_overviews.json', 'utf8'));
const cacheName = 'cacheRegress';
const cachePath = '/cache_regress';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

describe('Cache', () => {
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
            done();
          });
      });
    });
  });

  describe('POST /cache', () => {
    describe('insert an overviews.json', () => {
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
          .query({ idCache })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            done();
          });
      });
    });
  });
});
