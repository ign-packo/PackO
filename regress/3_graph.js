const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const app = require('..');

const params = [
  // Les caches générés par l'intégration continue
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgb',
    cachePath: 'cache_regress_RGB',
    idCache: null,
    idBranch: {},
    testOpi1: '19FD5606Ax00020_16371',
    testOpi2: '19FD5606Ax00020_16372',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressRgbir',
    cachePath: 'cache_regress_RGBIR',
    idCache: null,
    idBranch: {},
    testOpi1: '19FD5606Ax00020_16371',
    testOpi2: '19FD5606Ax00020_16372',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_regress_IR/overviews.json', 'utf8')),
    cacheName: 'cacheRegressIr',
    cachePath: 'cache_regress_IR',
    idCache: null,
    idBranch: {},
    testOpi1: '19FD5606A_ix00020_16371',
    testOpi2: '19FD5606A_ix00020_16372',
  },
  // Les caches présents dans le dépôt
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGB/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgb',
    cachePath: 'cache_test/cache_test_RGB/',
    idCache: null,
    idBranch: {},
    testOpi1: '19FD5606Ax00020_16371',
    testOpi2: '19FD5606Ax00020_16372',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_RGBIR/overviews.json', 'utf8')),
    cacheName: 'cacheTestRgbir',
    cachePath: 'cache_test/cache_test_RGBIR/',
    idCache: null,
    idBranch: {},
    testOpi1: '19FD5606Ax00020_16371',
    testOpi2: '19FD5606Ax00020_16372',
  },
  {
    overviews: JSON.parse(fs.readFileSync('./cache_test/cache_test_IR/overviews.json', 'utf8')),
    cacheName: 'cacheTestIr',
    cachePath: 'cache_test/cache_test_IR/',
    idCache: null,
    idBranch: {},
    testOpi1: '19FD5606A_ix00020_16371',
    testOpi2: '19FD5606A_ix00020_16372',
  },
];

function setIdCache(cacheName, idCache) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idCache = idCache;
      /* eslint-enable no-param-reassign */
    }
  });
}

function setIdBranch(cacheName, branchName, idBranch) {
  params.forEach((param) => {
    if (param.cacheName === cacheName) {
      /* eslint-disable no-param-reassign */
      param.idBranch[branchName] = idBranch;
      /* eslint-enable no-param-reassign */
    }
  });
}

// let idCache = null;
// function setIdCache(id) {
//   idCache = id;
// }

const branchName = 'graphRegress';
// let idBranch = null;
// function setIdBranch(id) {
//   idBranch = id;
// }

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

describe('Graph', () => {
  after((done) => {
    app.server.close();
    done();
  });

  params.forEach((param) => {
    describe('create a test cache', () => {
      it(`should return a cacheId on ${param.cacheName}`, (done) => {
        chai.request(app)
          .post('/cache')
          .query({
            name: param.cacheName,
            path: param.cachePath,
          })
          .send(param.overviews)
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('id_cache');
            setIdCache(param.cacheName, resJson.id_cache);
            resJson.should.have.property('name').equal(param.cacheName);
            done();
          });
      });

      describe(`create a test branch on ${param.cacheName}`, () => {
        it('should return a branchId', (done) => {
          chai.request(app)
            .post('/branch')
            .query({
              name: branchName,
              idCache: param.idCache,
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('id');
              setIdBranch(param.cacheName, branchName, resJson.id);
              resJson.should.have.property('name').equal(branchName);
              done();
            });
        });
      });

      describe(`GET /{idBranch}/graph on ${param.cacheName}`, () => {
        describe('query: x=0 & y=0', () => {
          it("should return a 'out of bounds'", (done) => {
            chai.request(app)
              .get(`/${param.idBranch[branchName]}/graph`)
              .query({ x: 0, y: 0 })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(201);
                const resJson = JSON.parse(res.text);

                resJson.should.be.jsonSchema(schema);
                resJson.should.have.property('opiName').equal('out of bounds');

                done();
              });
          });
        });
        describe('query: x=230757 & y=6759654', () => {
          // outside of graph but inside the image frame
          it("should return a 'out of graph'", (done) => {
            chai.request(app)
              .get(`/${param.idBranch[branchName]}/graph`)
              .query({ x: 230757, y: 6759654 })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(201);
                const resJson = JSON.parse(res.text);
                resJson.should.be.jsonSchema(schema);
                resJson.should.have.property('opiName').equal('out of graph');
                done();
              });
          });
        });
        describe('query: x=230755 & y=6759650', () => {
          it(`should return a Json { "color": Array(3), "opiName": ${param.testOpi1} }`, (done) => {
            chai.request(app)
              .get(`/${param.idBranch[branchName]}/graph`)
              .query({ x: 230755, y: 6759650 })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.be.jsonSchema(schema);
                resJson.should.have.property('opiName').equal(param.testOpi1);
                done();
              });
          });
        });
        describe('query: x=230749.8 & y=6759645.1', () => {
          it(`should return a Json { "color": Array(3), "opiName": ${param.testOpi2} }`, (done) => {
            chai.request(app)
              .get(`/${param.idBranch[branchName]}/graph`)
              .query({ x: 230749.8, y: 6759645.1 })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.be.jsonSchema(schema);
                resJson.should.have.property('opiName').equal(param.testOpi2);
                done();
              });
          });
        });
        describe('query: x=230747 & y=6759643', () => {
          // image not yet in the cache
          it("should return a 'out of graph'", (done) => {
            chai.request(app)
              .get(`/${param.idBranch[branchName]}/graph`)
              .query({ x: 230747, y: 6759643 })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(201);
                const resJson = JSON.parse(res.text);

                resJson.should.be.jsonSchema(schema);
                resJson.should.have.property('opiName').equal('out of graph');

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
            .query({ idCache: param.idCache })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.equal(`cache '${param.cacheName}' détruit`);
              done();
            });
        });
      });
    });
  });// params.forEach
});
