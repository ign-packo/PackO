const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const server = require('..');

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

let idBranch = null;

describe('Graph', () => {
  before((done) => {
    // on crée une branche spécialement pour ces tests
    chai.request(server)
      .post('/branch')
      .query({ name: 'test_regress_graph' })
      .end((err, res) => {
        should.not.exist(err);
        res.should.have.status(200);
        const branch = JSON.parse(res.text);
        idBranch = branch.id;
        done();
      });
  });

  after((done) => {
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

  describe('query: x=0 & y=0', () => {
    it("should return a 'out of bounds'", (done) => {
      chai.request(server)
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
      chai.request(server)
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
      chai.request(server)
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
      chai.request(server)
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
      chai.request(server)
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
    it("should return a 'branch does not exist'", (done) => {
      chai.request(server)
        .get('/9999/graph')
        .query({ x: 230747, y: 6759643 })
        .end((err, res) => {
          should.not.exist(err);
          const resJson = JSON.parse(res.text);
          resJson.should.have.property('msg').equal('branch does not exist');
          res.should.have.status(400);
          done();
        });
    });
  });
});
