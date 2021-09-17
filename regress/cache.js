const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const server = require('..');

describe('Cache', () => {
  after((done) => {
    server.close();
    done();
  });
  describe('POST /cache', () => {
    describe('insert an overviews.json', () => {
      it('should succeed', (done) => {
        chai.request(server)
          .post('/cache')
          .query({ name: 'test' })
          .send({
            identifier: 'LAMB93_5cm',
            crs: {
              type: 'EPSG',
              code: 2154,
              boundingBox: {
                xmin: 0,
                xmax: 1200000,
                ymin: 6090000,
                ymax: 7200000,
              },
              proj4Definition: '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
            },
            resolution: 0.05,
            level: {
              min: 14,
              max: 21,
            },
            tileSize: {
              width: 256,
              height: 256,
            },
            pathDepth: 4,
            slabSize: {
              width: 16,
              height: 16,
            },
            list_OPI: {
              '19FD5606Ax00020_16371': [
                126,
                222,
                76,
              ],
              '19FD5606Ax00020_16373': [
                240,
                25,
                92,
              ],
              '19FD5606Ax00020_16372': [
                218,
                145,
                208,
              ],
            },
            dataSet: {
              boundingBox: {
                LowerCorner: [
                  230745.6,
                  6759641.6,
                ],
                UpperCorner: [
                  230758.4,
                  6759654.4,
                ],
              },
              limits: {
                14: {
                  MinTileCol: 140,
                  MinTileRow: 268,
                  MaxTileCol: 140,
                  MaxTileRow: 268,
                },
                15: {
                  MinTileCol: 281,
                  MinTileRow: 537,
                  MaxTileCol: 281,
                  MaxTileRow: 537,
                },
                16: {
                  MinTileCol: 563,
                  MinTileRow: 1075,
                  MaxTileCol: 563,
                  MaxTileRow: 1075,
                },
                17: {
                  MinTileCol: 1126,
                  MinTileRow: 2150,
                  MaxTileCol: 1126,
                  MaxTileRow: 2150,
                },
                18: {
                  MinTileCol: 2253,
                  MinTileRow: 4300,
                  MaxTileCol: 2253,
                  MaxTileRow: 4300,
                },
                19: {
                  MinTileCol: 4506,
                  MinTileRow: 8600,
                  MaxTileCol: 4506,
                  MaxTileRow: 8600,
                },
                20: {
                  MinTileCol: 9013,
                  MinTileRow: 17201,
                  MaxTileCol: 9013,
                  MaxTileRow: 17201,
                },
                21: {
                  MinTileCol: 18027,
                  MinTileRow: 34402,
                  MaxTileCol: 18027,
                  MaxTileRow: 34402,
                },
              },
              slabLimits: {
                16: {
                  MinSlabCol: 35,
                  MinSlabRow: 67,
                  MaxSlabCol: 35,
                  MaxSlabRow: 67,
                },
                21: {
                  MinSlabCol: 1126,
                  MinSlabRow: 2150,
                  MaxSlabCol: 1126,
                  MaxSlabRow: 2150,
                },
              },
              level: {
                min: 14,
                max: 21,
              },
            },
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            // const resJson = JSON.parse(res.text);
            // resJson.should.have.property('name').equal('test');
            done();
          });
      });
    });
  });
});
