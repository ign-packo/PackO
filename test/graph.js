const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('..');
const { json } = require('body-parser');

const should = chai.should();
chai.use(chaiHttp);
chai.use(require('chai-json-schema'));

describe('Graph', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('Get graph', () => {
    it('should return an Id', (done) => {
      chai.request(server)
        .get('/graph')
        .query({ x: 0, y: 0 })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          const json = JSON.parse(res.text);
          var schema = {
            title: 'test',
            type: 'object',
            required: ['color', 'cliche'],
            properties: {
              color: {
                type: 'array',
                "minItems": 3,
                "maxItems": 3,
                items: {
                  type: 'integer'
                }
              },
              cliche: {
                type: 'string'
              }
            }
          };
          json.should.be.jsonSchema(schema);
          json.cliche.should.to.equal('unkown');
          done();
        });
    });
  });

  describe('Post graph/patch', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .get('/graph/patch')
        .query({ cliche: -1 })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(404);
          // res.body.status.should.equal("Le paramètre 'id_session' est invalide.");
          done();
        });
    });
  });
});
