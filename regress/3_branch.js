const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');

const app = require('..');

const cachePath = './cache_test/cache_test_RGBIR';
const overviews = JSON.parse(fs.readFileSync(`${cachePath}/overviews.json`, 'utf8'));
const cacheName = 'cacheRegress';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'branchRegress';
const idBranch = {};
function setIdBranch(name, id) {
  idBranch[name] = id;
}

// for rebase (adding a patch)
const testOpi = '19FD5606Ax00020_16371';

const idProcessus = {};
function setIdProcessus(rebaseName, id) {
  idProcessus[rebaseName] = id;
}

describe('route/branch.js', () => {
  after((done) => {
    app.server.close();
    done();
  });

  describe('initialisation', () => {
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
  });

  describe('GET /branches', () => {
    describe('query all branches on all caches ', () => {
      it('should return a list of branches', (done) => {
        chai.request(app)
          .get('/branches')
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array');
            done();
          });
      });
    });
    describe('query all branches on a specified cache', () => {
      it('should return a list of branches', (done) => {
        chai.request(app)
          .get('/branches')
          .query({ idCache })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson[0].should.have.property('name').equal('orig');
            resJson[0].should.have.property('id');
            setIdBranch('orig', resJson[0].id);
            done();
          });
      });
      it('(idCache = 99999) => should return a error', (done) => {
        chai.request(app)
          .get('/branches')
          .query({ idCache: 99999 })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idCache' n'est pas valide.");
            done();
          });
      });
    });
  });

  describe('POST /branch', () => {
    describe('post a valid branch', () => {
      it('should return an idBranch', (done) => {
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
            setIdBranch(cacheName, branchName, resJson.id);
            setIdBranch(branchName, resJson.id);
            resJson.should.have.property('name').equal(branchName);
            done();
          });
      });
      it('on a non valid cache => should return an error', (done) => {
        chai.request(app)
          .post('/branch')
          .query({
            name: branchName,
            idCache: 99999,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idCache' n'est pas valide.");
            done();
          });
      });
    });
    describe('post a branch already added', () => {
      it('should return a error ', (done) => {
        chai.request(app)
          .post('/branch')
          .query({
            name: branchName,
            idCache,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('object');
            resJson.should.have.property('msg').equal('A branch with this name already exists.');
            done();
          });
      });
    });
  });

  describe('POST /{idBranch}/rebase', () => {
    describe('rebase non valid branches', () => {
      it('should failed', (done) => {
        const idB = 99999;
        chai.request(app)
          .post(`/${idB}/rebase`)
          .query({
            name: 'rebase',
            idBase: 99999,
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(2);
            resJson[0].should.have.property('status').equal("Le paramètre 'idBase' n'est pas valide.");
            resJson[1].should.have.property('status').equal("Le paramètre 'idBranch' n'est pas valide.");
            done();
          });
      });
    });
    describe('rebase a branch on itself', () => {
      it('should failed', (done) => {
        chai.request(app)
          .post(`/${idBranch[branchName]}/rebase`)
          .query({
            name: 'rebase',
            idBase: idBranch[branchName],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('object');
            resJson.should.have.property('msg').equal(`Branch '${idBranch[branchName]}' rebase failed with error: impossible to rebase a branch on itself`);
            done();
          });
      });
    });
    describe('rebase a branch on a branch from a different cache', () => {
      it('not tested yet', (done) => {
        done();
      });
    });
    describe('rebase valid branches', () => {
      describe('with no patch', () => {
        it('should succeed', (done) => {
          chai.request(app)
            .post(`/${idBranch.orig}/rebase`)
            .query({
              name: 'rebase',
              idBase: idBranch[branchName],
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('name').equal('rebase');
              resJson.should.have.property('id');
              resJson.should.have.property('idProcess');
              // // on vérifie que le idProcess est accessible
              // const { idProcess } = resJson;
              // chai.request(app)
              //   .get(`/process/${idProcess}`)
              //   .end((err2, res2) => {
              //     should.not.exist(err2);
              //     res2.should.have.status(200);
              //     console.log(JSON.parse(res2.text))
              //     const resJson2 = JSON.parse(res2.text);
              //     resJson2.should.have.property('id').equal(idProcess);
              //     resJson2.should.have.property('start_date');
              //     resJson2.should.have.property('end_date');
              //     resJson2.should.have.property('status');
              //     resJson2.should.have.property('result');
              //     done();
              //   });
              done();
            });
        });
      });
      describe('with patch', () => {
        describe(`add a patch on ${branchName}`, () => {
          it('should succeed', (done) => {
            chai.request(app)
              .post(`/${idBranch[branchName]}/patch`)
              .send({
                type: 'FeatureCollection',
                crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
                features: [
                  {
                    type: 'Feature',
                    properties: {
                      color: overviews.list_OPI[testOpi].color,
                      opiName: testOpi,
                    },
                    geometry: { type: 'Polygon', coordinates: [[[230749, 6759646], [230752, 6759646], [230752, 6759644], [230749, 6759644], [230749, 6759646]]] },
                  }],
              })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.be.a('array');
                done();
              });
          }).timeout(9000);
        });
        describe(`rebase ${branchName} into 'orig'`, () => {
          it('should succeed', (done) => {
            const rebaseName = 'rebase2';
            chai.request(app)
              .post(`/${idBranch[branchName]}/rebase`)
              .query({
                name: rebaseName,
                idBase: idBranch.orig,
              })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.have.property('name').equal(rebaseName);
                resJson.should.have.property('id');
                resJson.should.have.property('idProcess');
                setIdProcessus(rebaseName, resJson.idProcess);
                done();
                // // on vérifie que le idProcess est accessible
                // const { idProcess } = resJson;
                // chai.request(app)
                //   .get(`/process/${idProcess}`)
                //   .end((err2, res2) => {
                //     should.not.exist(err2);
                //     res2.should.have.status(200);
                //     console.log(JSON.parse(res2.text))
                //     const resJson2 = JSON.parse(res2.text);
                //     resJson2.should.have.property('id').equal(idProcess);
                //     resJson2.should.have.property('start_date');
                //     resJson2.should.have.property('end_date');
                //     resJson2.should.have.property('status');
                //     resJson2.should.have.property('result');
                //     done();
                //   });
              });
          });
        });
        describe(`rebase 'orig' into ${branchName}`, () => {
          it('should succeed', (done) => {
            const rebaseName = 'rebase3';
            chai.request(app)
              .post(`/${idBranch.orig}/rebase`)
              .query({
                name: 'rebase3',
                idBase: idBranch[branchName],
              })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.have.property('name').equal(rebaseName);
                resJson.should.have.property('id');
                resJson.should.have.property('idProcess');
                setIdProcessus(rebaseName, resJson.idProcess);
                done();
              //   // on vérifie que le idProcess est accessible
              //   const { idProcess } = resJson;
              //   chai.request(app)
              //     .get(`/process/${idProcess}`)
              //     .end((err2, res2) => {
              //       should.not.exist(err2);
              //       res2.should.have.status(200);
              //       const resJson2 = JSON.parse(res2.text);
              //       resJson2.should.have.property('id').equal(idProcess);
              //       resJson2.should.have.property('start_date');
              //       resJson2.should.have.property('end_date');
              //       resJson2.should.have.property('status');
              //       resJson2.should.have.property('result');
              //       done();
              //     });
              });
          });
        });
      });
    });
  });

  describe('DELETE /branch', () => {
    describe('delete a valid branch', () => {
      it('should succeed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ idBranch: idBranch[branchName] })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(200);
            const resJson = JSON.parse(res.text);
            resJson.should.equal(`branche '${branchName}' détruite`);
            done();
          });
      });
    });
    describe('delete a non destructible branch (orig)', () => {
      it('should failed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ idBranch: idBranch.orig })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(406);
            const resJson = JSON.parse(res.text);
            resJson.should.have.property('msg').equal(`Branch '${idBranch.orig}' can't be deleted.`);
            done();
          });
      });
    });
    describe('delete a non existing branch', () => {
      it('should failed', (done) => {
        chai.request(app)
          .delete('/branch')
          .query({ idBranch: 99999 })
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

  describe('\n  extra: route/processQueue.js\n    GET /process/', () => {
    it(`should return the idProcessus of the rebase ${branchName} into 'orig'`, (done) => {
      // on vérifie que le idProcess est accessible
      const rebaseName = 'rebase2';
      const idProcess = idProcessus[rebaseName];
      chai.request(app)
        .get(`/process/${idProcess}`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson2 = JSON.parse(res.text);
          resJson2.should.have.property('id').equal(idProcessus[rebaseName]);
          resJson2.should.have.property('start_date');
          resJson2.should.have.property('end_date');
          resJson2.should.have.property('status').equal('succeed');
          resJson2.should.have.property('result').equal('done');
          done();
        });
    });
    it(`should return the idProcessus of the rebase 'orig' into ${branchName}`, (done) => {
      // on vérifie que le idProcess est accessible
      const rebaseName = 'rebase3';
      const idProcess = idProcessus[rebaseName];
      chai.request(app)
        .get(`/process/${idProcess}`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson2 = JSON.parse(res.text);
          resJson2.should.have.property('id').equal(idProcessus[rebaseName]);
          resJson2.should.have.property('start_date');
          resJson2.should.have.property('end_date');
          resJson2.should.have.property('status').equal('succeed');
          resJson2.should.have.property('result').equal('done');
          done();
        });
    });
  });

  describe('clean up', () => {
    describe('delete the cache used for test', () => {
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
});
