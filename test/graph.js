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

describe('Graph', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('GET /graph', () => {
    describe('query: x=0 & y=0', () => {
      it("should return a 'out of bounds'", (done) => {
        chai.request(server)
          .get('/graph')
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
    describe('query: x=0 & y=0', () => {
      it("should return a 'missing'", (done) => {
        chai.request(server)
          .get('/graph')
          .query({ x: 230746, y: 6759735 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);

            resJson.should.be.jsonSchema(schema);
            resJson.should.have.property('cliche').equal('missing');

            done();
          });
      });
    });
    describe('query: x=230752.8 & y=6759737.1', () => {
      it('should return a Json { "color": Array(3), "cliche": !unknown }', (done) => {
        chai.request(server)
          .get('/graph')
          .query({ x: 230752.8, y: 6759737.1 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.jsonSchema(schema);
            resJson.should.have.property('cliche').not.equal('unknown');

            done();
          });
      });
    });
  });
});
