/* eslint-disable no-console */
class API {
  constructor(url, idCache) {
    this.url = url;
    this.idCache = idCache;
  }

  // Branch.js
  postBranch(name) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/branch?name=${name}&idCache=${this.idCache}`,
        {
          method: 'POST',
        }).then((res) => {
        res.json().then((json) => {
          if (res.status === 200) {
            resolve(json);
          } else {
            console.log(`-> Database Error: Branch '${name}' NOT added`);
            console.log(JSON.stringify(json));
            const err = new Error();
            if (res.status === 406) {
              err.name = 'Server Error';
              err.message = `Branch '${name}' already created`;
            } else {
              err.name = 'Database Error';
              err.message = `Branch '${name}' NOT added`;
            }
            reject(err);
          }
        });
      });
    });
  }

  getVectors(idBranch) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/${idBranch}/vectors`,
        {
          method: 'GET',
        }).then((res) => {
        res.json().then((json) => {
          if (res.status === 200) {
            resolve(json);
          } else {
            console.log('-> Database Error');
            console.log(JSON.stringify(json));
            const err = new Error();
            err.name = 'Database Error';
            reject(err);
          }
        });
      });
    });
  }

  deleteVector(name, id) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/vector?idVector=${id}`,
        {
          method: 'DELETE',
        }).then((res) => {
        if (res.status === 200) {
          console.log(`-> Vector '${name}' (id: ${id}) succesfully deleted`);
          resolve();
        } else {
          console.log(`-> Database Error: Vector '${name}' (id: ${id}) NOT deleted`);
          res.text().then((msg) => {
            console.log(msg);
            reject();
          });
        }
      });
    });
  }

  saveVector(idBranch, name, geojson, crs, style) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/${idBranch}/vector`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            metadonnees: {
              name,
              style,
              crs,
            },
            data: geojson,
          }),
        }).then((res) => {
        res.json().then((json) => {
          if (res.status === 200) {
            console.log(`-> Layer '${name}' succesfully saved`);
            resolve(json.id);
          } else {
            console.log(`-> Database Error: Layer '${name}' NOT saved`);
            console.log(json.msg);
            reject();
          }
        });
      });
    });
  }

  // Alert.js
  updateAlert(idFeature, variable, value) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/vector/${idFeature}?${variable}=${value}`,
        {
          method: 'PUT',
        })
        .then((res) => {
          if (res.status === 200) {
            resolve();
          } else {
            res.text().then((msg) => {
              console.log(msg);
              reject();
            });
          }
        });
    });
  }

  // Editing.js
  getGraph(idBranch, position) {
    return new Promise((resolve, reject) => {
      fetch(
        `${this.url}/${idBranch}/graph?x=${position.x}&y=${position.y}`,
        { method: 'GET' },
      ).then((res) => {
        res.json().then((json) => {
          if (res.status === 200) {
            resolve(json);
          } else {
            console.log(`-> No OPI found (${json.msg})`);
            // 244-> no OPI at x, y (out of graph OR out of bounds)
            // 404-> no OPI corresponding to the color found at x, y (corrupted cache)
            const err = new Error();
            if (res.status === 244) {
              err.name = 'Erreur Utilisateur';
              err.message = json.msg;
            } else {
              err.name = 'Erreur de Cache ';
              err.message = json;
              if (res.status === 404) {
                err.message = "Sélection d'une OPI\n    -> cache corrompu";
              }
            }
            reject(err);
          }
        });
      });
    });
  }

  postPatch(idBranch, dataStr) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/${idBranch}/patch?`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: dataStr,
        })
        .then((res) => {
          if (res.status === 200) {
            resolve();
          } else {
            res.json().then((json) => reject(json));
          }
        });
    });
  }

  // Remarks
  putRemark(remarksLayerId, mousePosition, remark) {
    return new Promise((resolve, reject) => {
      fetch(
        `${this.url}/${remarksLayerId}/feature?x=${mousePosition.x}&y=${mousePosition.y}&comment=${remark}`,
        { method: 'PUT' },
      ).then((res) => {
        if (res.status === 200) {
          resolve();
        } else {
          res.json().then((json) => {
            console.log('-> Database Error');
            console.log(JSON.stringify(json));
            const err = new Error('Remark NOT added');
            err.name = 'Database Error';
            reject(err);
          });
        }
      });
    });
  }

  delRemark(remarksLayerId, remarkId) {
    return new Promise((resolve, reject) => {
      fetch(
        `${this.url}/${remarksLayerId}/feature?id=${remarkId}`,
        { method: 'DELETE' },
      ).then((res) => {
        if (res.status === 200) {
          resolve();
        } else {
          res.json().then((json) => {
            console.log('-> Database Error');
            console.log(JSON.stringify(json));
            const err = new Error('Remark NOT deleted');
            err.name = 'Database Error';
            reject(err);
          });
        }
      });
    });
  }
}

export default API;
