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

  describe('POST /patch', () => {
    describe('body: {}', () => {
      it('should return an error', (done) => {
        chai.request(server)
          .post('/patch')
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
          .post('/patch')
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
          .post('/patch')
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
            res.should.have.status(500);

            done();
          });
      });
    });
  });

  describe('Put undo', () => {
    it('should succeed', (done) => {
      chai.request(server)
        .put('/patchs/undo')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          done();
        });
    });
  });

  describe('Put redo', () => {
    it('should succeed', (done) => {
      chai.request(server)
        .put('/patchs/redo')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
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
          done();
        });
    });
  });

  describe('Put clear', () => {
    it('should succeed', (done) => {
      chai.request(server)
        .put('/patchs/clear')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(200);
          done();
        });
    });
  });

  describe('Put undo', () => {
    it('should return an error (nothing to undo)', (done) => {
      chai.request(server)
        .put('/patchs/undo')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(500);
          done();
        });
    });
  });

  describe('Put redo', () => {
    it('should return an error (nothing to redo)', (done) => {
      chai.request(server)
        .put('/patchs/redo')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(500);
          done();
        });
    });
  });

  describe('Put clear', () => {
    it('should return an error (nothing to clear)', (done) => {
      chai.request(server)
        .put('/patchs/clear')
        .end((err, res) => {
          should.equal(err, null);
          res.should.have.status(500);
          done();
        });
    });
  });


});
