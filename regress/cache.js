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
