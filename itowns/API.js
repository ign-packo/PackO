function readCRS(json) {
  if (json.crs) {
    if (json.crs.type.toLowerCase() === 'epsg') {
      return `EPSG:${json.crs.properties.code}`;
    } if (json.crs.type.toLowerCase() === 'name') {
      const epsgIdx = json.crs.properties.name.toLowerCase().indexOf('epsg:');
      if (epsgIdx >= 0) {
        // authority:version:code => EPSG:[...]:code
        const codeStart = json.crs.properties.name.indexOf(':', epsgIdx + 5);
        if (codeStart > 0) {
          return `EPSG:${json.crs.properties.name.substr(codeStart + 1)}`;
        }
      }
    }
    throw new Error(`Unsupported CRS type '${json.crs}'`);
  }
  // assume default crs
  return 'EPSG:4326';
}

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
          res.text().then((msg) => reject(msg));
        }
      });
    });
  }

  saveVector(idBranch, name, geojson, style) {
    return new Promise((resolve, reject) => {
      const crs = readCRS(geojson);
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
        if (res.status === 200) {
          console.log(`-> Layer '${name}' succesfully saved`);
          resolve();
        } else {
          console.log(`-> Database Error: Layer '${name}' NOT saved`);
          // this.view.dispatchEvent({
          //   type: 'error',
          //   msg: `Error Serveur: Layer '${name}' NOT saved`,
          // });
          res.text().then((msg) => reject(msg));
        }
      });
    });
  }

  // index
  updateAlert(idFeature, variable, value) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/alert/${idFeature}?${variable}=${value}`,
        {
          method: 'PUT',
        })
        .then((res) => {
          if (res.status === 200) {
            resolve();
          } else {
            res.text().then((msg) => reject(msg));
          }
        });
    });
  }

  // editing
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
}

export default API;
