const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const app = require('..');

const overviews = JSON.parse(fs.readFileSync('./cache_test/overviews.json', 'utf8'));
const cacheName = 'cacheRegress';
const cachePath = 'cache_test';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'graphRegress';
let idBranch = null;
function setIdBranch(id) {
  idBranch = id;
}

const schema = {
  title: 'test',
  type: 'object',
  required: ['color', 'cliche'],
  properties: {
    color: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'integer',
      },
    },
    cliche: {
      type: 'string',
    },
  },
};

describe('Graph', () => {
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

  describe('GET /{idBranch}/graph', () => {
    describe('query: x=0 & y=0', () => {
      it("should return a 'out of bounds'", (done) => {
        chai.request(app)
          .get(`/${idBranch}/graph`)
          .query({ x: 0, y: 0 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(201);
            const resJson = JSON.parse(res.text);

            resJson.should.be.jsonSchema(schema);
            resJson.should.have.property('cliche').equal('out of bounds');

            done();
          });
      });
    });
    describe('query: x=230757 & y=6759654', () => {
      // outside of graph but inside the image frame
      it("should return a 'out of graph'", (done) => {
        chai.request(app)
          .get(`/${idBranch}/graph`)
          .query({ x: 230757, y: 6759654 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(201);
            const resJson = JSON.parse(res.text);
            resJson.should.be.jsonSchema(schema);
            resJson.should.have.property('cliche').equal('out of graph');

            done();
          });
      });
    });
    describe('query: x=230755 & y=6759650', () => {
      it('should return a Json { "color": Array(3), "cliche": 19FD5606Ax00020_16371 }', (done) => {
        chai.request(app)
          .get(`/${idBranch}/graph`)
          .query({ x: 230755, y: 6759650 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.jsonSchema(schema);
            resJson.should.have.property('cliche').equal('19FD5606Ax00020_16371');

            done();
          });
      });
    });
    describe('query: x=230749.8 & y=6759645.1', () => {
      it('should return a Json { "color": Array(3), "cliche": 19FD5606Ax00020_16372 }', (done) => {
        chai.request(app)
          .get(`/${idBranch}/graph`)
          .query({ x: 230749.8, y: 6759645.1 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.jsonSchema(schema);
            resJson.should.have.property('cliche').equal('19FD5606Ax00020_16372');

            done();
          });
      });
    });
    describe('query: x=230747 & y=6759643', () => {
      // image not yet in the cache
      it("should return a 'out of graph'", (done) => {
        chai.request(app)
          .get(`/${idBranch}/graph`)
          .query({ x: 230747, y: 6759643 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(201);
            const resJson = JSON.parse(res.text);

            resJson.should.be.jsonSchema(schema);
            resJson.should.have.property('cliche').equal('out of graph');

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
