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
            res.should.have.status(200);
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

  describe('POST /graph/patch', () => {
    describe('body: {}', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .post('/graph/patch')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            done();
          });
      });
    });

    describe('body: polygon geoJson', () => {
      it('should apply the patch and return the liste of tiles impacted', (done) => {
        chai.request(server)
          .post('/graph/patch')
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: { color: [99, 167, 133], cliche: '19FD5606Ax00020_16371' },
                geometry: { type: 'Polygon', coordinates: [[[230748, 6759736], [230746, 6759736], [230746, 6759734], [230748, 6759734], [230748, 6759736]]] },
              }],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.a('array');

            done();
          });
      });

      it('should get an error: missing data', (done) => {
        chai.request(server)
          .post('/graph/patch')
          .send({
            type: 'FeatureCollection',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
            features: [
              {
                type: 'Feature',
                properties: { color: [99, 167, 133], cliche: '19FD5606Ax00020_16371' },
                geometry: { type: 'Polygon', coordinates: [[[230760, 6759736], [230746, 6759736], [230746, 6759734], [230748, 6759734], [230760, 6759736]]] },
              }],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(404);

            done();
          });
      });
    });
  });
});
