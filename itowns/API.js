/* eslint-disable no-console */
class API {
  constructor(url) {
    this.url = url;
  }

  postBranch(idCache, name) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/branch?name=${name}&idCache=${idCache}`,
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

  // branch
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
          // this.view.dispatchEvent({
          //   type: 'error',
          //   msg: `Error Serveur: Vector '${name}' (id: ${id}) NOT deleted`,
          // });
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
            // this.view.dispatchEvent({
            //   type: 'error',
            //   msg: `Error Serveur: Layer '${name}' NOT saved`,
            // });
            console.log(json.msg);
            reject();
          }
        });
      });
    });
  }

  // index
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
              reject(msg);
            });
          }
        });
    });
  }

  // editing
  getGraph(idBranch, position) {
    return new Promise((resolve, reject) => {
      fetch(
        `${this.url}/${idBranch}/graph?x=${position.x}&y=${position.y}`,
        { method: 'GET' },
      ).then((res) => {
        res.json().then((json) => {
          // 201-> out of graph; 202-> out of bounds; 404-> cache corrompu
          if (res.status === 200) {
            resolve(json);
          } else {
            console.log('-> Database Error: No OPI found');
            console.log(JSON.stringify(json));
            const err = new Error();
            if (res.status === 201 || res.status === 202) {
              err.name = 'Server Error';
              err.message = json.cliche;
            } else {
              err.name = 'Database Error';
              if (res.status === 404) {
                err.message = 'cache corrupted';
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
            res.json().then((json) => reject(json.msg));
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
