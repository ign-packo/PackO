const chai = require('chai');
chai.use(require('chai-http'));
chai.use(require('chai-json-schema'));

const should = chai.should();
const fs = require('fs');
const path = require('path');

const app = require('../..');

let cachePath = './cache_test/cache_test_RGBIR';
const overviews = JSON.parse(fs.readFileSync(`${cachePath}/overviews.json`, 'utf8'));
const cacheName = 'cacheRegress';

// for npm run test
const cachePathTmp = './regress/tmp4tests';

let idCache = null;
function setIdCache(id) {
  idCache = id;
}

const branchName = 'branchRegress';
const branchName2 = 'branchRegress2';
const idBranch = {};
function setIdBranch(name, id) {
  idBranch[name] = id;
}

// for merge (adding a patch)
const testOpi = '19FD5606Ax00020_16371';

function copyFileSync(source, target) {
  let targetFile = target;
  // If target is a directory, a new file with the same name will be created
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }
  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target) {
  let files = [];
  // Check if folder needs to be created or integrated
  const targetFolder = path.join(target, path.basename(source));
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder);
  }
  // Copy
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      const curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

if (process.env.TEST_ENV === 'test') {
  if (!fs.existsSync(cachePathTmp)) {
    fs.mkdirSync(cachePathTmp);
  }
  copyFolderRecursiveSync(path.join(cachePath), cachePathTmp);
  cachePath = path.join(cachePathTmp, path.basename(cachePath));
}

const idProcessus = {};
function setIdProcessus(mergeName, id) {
  idProcessus[mergeName] = id;
}

describe('route/branch.js', () => {
  after((done) => {
    app.server.close();
    if (process.env.TEST_ENV === 'test') {
      fs.rmSync(cachePathTmp, { recursive: true, force: true });
    }
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

  describe('POST /{idBranch}/merge', () => {
    describe('merge non valid branches', () => {
      it('should failed', (done) => {
        chai.request(app)
          .post('/branches/merge')
          .query({
            name: 'merge',
            idBranch: [99998, 99999],
          })
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
    describe('merge a branch on itself', () => {
      it('should failed', (done) => {
        chai.request(app)
          .post('/branches/merge')
          .query({
            name: 'merge',
            idBranch: [idBranch[branchName], idBranch[branchName]],
          })
          .end((err, res) => {
            should.not.exist(err);
            res.should.have.status(400);
            const resJson = JSON.parse(res.text);
            resJson.should.be.an('array').to.have.lengthOf(1);
            resJson[0].should.have.property('status').equal("Le paramètre 'idBranch (doublons)' n'est pas valide.");
            done();
          });
      });
    });
    describe('merge a branch on a branch from a different cache', () => {
      it('not tested yet', (done) => {
        done();
      });
    });
    describe('merge valid branches', () => {
      describe('with no patch', () => {
        it('should succeed', (done) => {
          chai.request(app)
            .post('/branches/merge')
            .query({
              name: 'merge',
              idBranch: [idBranch[branchName], idBranch.orig],
            })
            .end((err, res) => {
              should.not.exist(err);
              res.should.have.status(200);
              const resJson = JSON.parse(res.text);
              resJson.should.have.property('name').equal('merge');
              resJson.should.have.property('process').that.is.an('array');
              resJson.process.forEach((item) => {
                item.should.have.property('id');
                item.should.have.property('idProcess');
              });
              done();
            });
        }).timeout(9000);
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
                      is_auto: false,
                    },
                    geometry: { type: 'Polygon', coordinates: [[[230749, 6759646], [230752, 6759646], [230752, 6759644], [230749, 6759644], [230749, 6759646]]] },
                  }],
              })
              .end((err, res) => {
                should.not.exist(err);
                console.log(res.body.msg);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.be.a('array');
                done();
              });
          }).timeout(9000);
        });
        describe(`New branch ${branchName2} with a patch`, () => {
          it(`create branch ${branchName2}`, (done) => {
            chai.request(app)
              .post('/branch')
              .query({
                name: branchName2,
                idCache,
              })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.have.property('id');
                setIdBranch(cacheName, branchName2, resJson.id);
                setIdBranch(branchName2, resJson.id);
                resJson.should.have.property('name').equal(branchName2);
                done();
              });
          });
          it(`add a patch on ${branchName2}`, (done) => {
            chai.request(app)
              .post(`/${idBranch[branchName2]}/patch`)
              .send({
                type: 'FeatureCollection',
                crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
                features: [
                  {
                    type: 'Feature',
                    properties: {
                      color: overviews.list_OPI[testOpi].color,
                      opiName: testOpi,
                      is_auto: false,
                    },
                    geometry: { type: 'Polygon', coordinates: [[[230749, 6759646], [230752, 6759646], [230752, 6759644], [230749, 6759644], [230749, 6759646]]] },
                  }],
              })
              .end((err, res) => {
                should.not.exist(err);
                console.log(res.body.msg);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.be.a('array');
                done();
              });
          }).timeout(9000);
        });
        describe(`merge ${branchName} et ${branchName2} into 'orig'`, () => {
          it('should succeed', (done) => {
            const mergeName = 'merge2';
            chai.request(app)
              .post('/branches/merge')
              .query({
                name: mergeName,
                idBranch: [idBranch.orig, idBranch[branchName], idBranch[branchName2]],
              })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.have.property('name').equal(mergeName);
                resJson.should.have.property('process').that.is.an('array');
                resJson.process.forEach((item) => {
                  item.should.have.property('id');
                  item.should.have.property('idProcess');
                });
                setIdProcessus(mergeName, resJson.process[0].idProcess);
                done();
              });
          }).timeout(9000);
        });
        describe(`merge 'orig' into ${branchName}`, () => {
          it('should succeed', (done) => {
            const mergeName = 'merge3';
            chai.request(app)
              .post('/branches/merge')
              .query({
                name: 'merge3',
                idBranch: [idBranch[branchName], idBranch.orig],
              })
              .end((err, res) => {
                should.not.exist(err);
                res.should.have.status(200);
                const resJson = JSON.parse(res.text);
                resJson.should.have.property('name').equal(mergeName);
                resJson.should.have.property('process').that.is.an('array');
                resJson.process.forEach((item) => {
                  item.should.have.property('id');
                  item.should.have.property('idProcess');
                });
                setIdProcessus(mergeName, resJson.process[0].idProcess);
                done();
              });
          }).timeout(9000);
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
    it(`should return the idProcessus of the merge ${branchName} into 'orig'`, (done) => {
      // on vérifie que le idProcess est accessible
      const mergeName = 'merge2';
      const idProcess = idProcessus[mergeName];
      chai.request(app)
        .get(`/process/${idProcess}`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson2 = JSON.parse(res.text);
          resJson2.should.have.property('id').equal(idProcessus[mergeName]);
          resJson2.should.have.property('start_date');
          resJson2.should.have.property('end_date');
          resJson2.should.have.property('status').equal('succeed');
          resJson2.should.have.property('result').equal('done');
          done();
        });
    });
    it(`should return the idProcessus of the merge 'orig' into ${branchName}`, (done) => {
      // on vérifie que le idProcess est accessible
      const mergeName = 'merge3';
      const idProcess = idProcessus[mergeName];
      chai.request(app)
        .get(`/process/${idProcess}`)
        .end((err, res) => {
          should.not.exist(err);
          res.should.have.status(200);
          const resJson2 = JSON.parse(res.text);
          resJson2.should.have.property('id').equal(idProcessus[mergeName]);
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
