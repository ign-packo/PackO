class API {
  constructor(url) {
    this.url = url;
  }

  // viewer
  deleteLayer(name, id) {
    fetch(`${this.url}/vector?idVector=${id}`,
      {
        method: 'DELETE',
      }).then((res) => {
      if (res.status === 200) {
        console.log(`-> Layer '${name}' (id: ${id}) succesfully deleted`);
        this.view.dispatchEvent({
          type: 'vector-deleted',
          layerId: id,
        });
      } else {
        console.log(`-> Error Serveur: Layer '${name}' (id: ${id}) NOT deleted`);
        this.view.dispatchEvent({
          type: 'error',
          msg: `Error Serveur: Layer '${name}' (id: ${id}) NOT deleted`,
        });
      }
    });
  }

  // index
  updateStatus(idFeature, value) {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}/alert/${idFeature}?status=${value}`,
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
