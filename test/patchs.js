const chai = require('chai');
const chaiHttp = require('chai-http');
// const { json } = require('body-parser');
const server = require('..');

const should = chai.should();
chai.use(chaiHttp);
chai.use(require('chai-json-schema'));

describe('Patchs', () => {
  after((done) => {
    server.close();
    done();
  });

  describe('Post patchs', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .post('/patch')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(500);
          done();
        });
    });
  });

  describe('Post patchs', () => {
    it('should return an works', (done) => {
      chai.request(server)
        .post('/patch')
        .send({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { color: [0, 0, 0], cliche: 'unkown' },
              geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
            }],
        })
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(500);
          done();
        });
    });
  });

  describe('Put undo', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .put('/patchs/undo')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(400);
          done();
        });
    });
  });

  describe('Put redo', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .put('/patchs/redo')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(400);
          // todo : valider le message d'erreur
          done();
        });
    });
  });

  describe('Put clear', () => {
    it('should return an error', (done) => {
      chai.request(server)
        .put('/patchs/clear')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          // todo : valider le message d'erreur
          done();
        });
    });
  });

  describe('Get', () => {
    it('should return an valid geoJson', (done) => {
      chai.request(server)
        .get('/patchs')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          // todo : valider le geojson
          done();
        });
    });
  });
});
