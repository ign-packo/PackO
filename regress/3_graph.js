const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const app = require('..');

const testOpi = [
  { name: '19FD5606Ax00020_16371', date: '2019-07-04', time: '13:33:00' },
  { name: '19FD5606Ax00020_16372', date: '2019-07-04', time: '13:33:00' },
  { name: '19FD5606Ax00020_16373', date: '2019-07-04', time: '13:33:00' },
];

const cachePath = './cache_test/cache_test_RGBIR';
const overviews = JSON.parse(fs.readFileSync(`${cachePath}/overviews.json`, 'utf8'));
const cacheName = 'cacheRegress';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'graphRegress';
const idBranch = {};
function setIdBranch(name, id) {
  idBranch[name] = id;
}

const schema = {
  title: 'test',
  type: 'object',
  required: ['color', 'opiName'],
  properties: {
    color: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'integer',
      },
    },
    opiName: {
      type: 'string',
    },
  },
};

describe('route/graph.js', () => {
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

    describe('GET /{idBranch}/graph', () => {
      describe('query: x=0 & y=0', () => {
        it("should return a 'out of bounds'", (done) => {
          chai.request(app)
            .get(`/${idBranch[branchName]}/graph`)
            .query({ x: 0, y: 0 })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(244);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('msg').equal('out of bounds');

              done();
            });
        });
      });
      describe('query: x=230757 & y=6759654', () => {
        // outside of graph but inside the images frame
        it("should return a 'out of graph'", (done) => {
          chai.request(app)
            .get(`/${idBranch[branchName]}/graph`)
            .query({ x: 230757, y: 6759654 })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(244);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('msg').equal('out of graph');
              done();
            });
        });
      });
      describe('query: x=230755 & y=6759650', () => {
        it(`should return a Json { "color": Array(3), "opiName": ${testOpi[0].name}, "date": ${testOpi[0].date}, "time": ${testOpi[0].time} }`, (done) => {
          chai.request(app)
            .get(`/${idBranch[branchName]}/graph`)
            .query({ x: 230755, y: 6759650 })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.be.jsonSchema(schema);
              resJson.should.have.property('opiName').equal(testOpi[0].name);
              resJson.should.have.property('date').equal(testOpi[0].date);
              resJson.should.have.property('time').equal(testOpi[0].time);
              done();
            });
        });
      });
      describe('query: x=230749.8 & y=6759645.1', () => {
        it(`should return a Json { "color": Array(3), "opiName": ${testOpi[1].name}, "date": ${testOpi[1].date}, "time": ${testOpi[1].time} }`, (done) => {
          chai.request(app)
            .get(`/${idBranch[branchName]}/graph`)
            .query({ x: 230749.8, y: 6759645.1 })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.be.jsonSchema(schema);
              resJson.should.have.property('opiName').equal(testOpi[1].name);
              resJson.should.have.property('date').equal(testOpi[1].date);
              resJson.should.have.property('time').equal(testOpi[1].time);
              done();
            });
        });
      });
      describe('query: x=230747.7 & y=6759644.', () => {
        it(`should return a Json { "color": Array(3), "opiName": ${testOpi[2].name}, "date": ${testOpi[2].date}, "time": ${testOpi[2].time} }`, (done) => {
          chai.request(app)
            .get(`/${idBranch[branchName]}/graph`)
            .query({ x: 230747.7, y: 6759644 })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.be.jsonSchema(schema);
              resJson.should.have.property('opiName').equal(testOpi[2].name);
              resJson.should.have.property('date').equal(testOpi[2].date);
              resJson.should.have.property('time').equal(testOpi[2].time);
              done();
            });
        });
      });

      describe('query: x=230748 & y=6759643', () => {
        // image not yet in the cache
        it("should return a 'out of graph'", (done) => {
          chai.request(app)
            .get(`/${idBranch[branchName]}/graph`)
            .query({ x: 230748, y: 6759643 })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(244);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('msg').equal('out of graph');
              done();
            });
        });
      });
      describe('query: x=230747 & y=6759643', () => {
        // branch doesn't exist
        it("idBranch=99999 => should return a 'branch does not exist'", (done) => {
          chai.request(app)
            .get('/99999/graph')
            .query({ x: 230747, y: 6759643 })
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
});
