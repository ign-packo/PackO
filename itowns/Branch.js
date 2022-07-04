/* eslint-disable no-console */

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

class Branch {
  constructor(viewer, alert) {
    this.viewer = viewer;
    this.view = viewer.view;
    this.api = viewer.api;

    this.layers = [];

    this.active = {};
    this.list = {};
    this.alert = alert;
  }

  async setLayers(vectorList = null) {
    let getVectorList;
    if (vectorList === null) {
      getVectorList = this.api.getVectors(this.active.id);
    }

    this.layers = [
      {
        name: 'Graph',
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
      },
      {
        name: 'Ortho',
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
      },
      {
        name: 'Opi',
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: false,
      },
      {
        name: 'Contour',
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: true,
      },
      {
        name: 'Patches',
        type: 'vector',
        url: `${this.api.url}/${this.active.id}/patches`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: false,
        style: {
          stroke: {
            color: 'Yellow',
            width: 2,
          },
          point: {
            color: 'Yellow',
          },
        },
      },
    ];

    if (vectorList === null) {
      this.vectorList = await getVectorList;
    }

    let layerIndex = this.layers.length - 1;
    this.vectorList.forEach((vector) => {
      layerIndex += 1;
      this.layers.push({
        name: vector.name,
        type: 'vector',
        url: `${this.api.url}/vector?idVector=${vector.id}`,
        crs: vector.crs,
        opacity: 1,
        visible: true,
        style: JSON.parse(vector.style_itowns),
        vectorId: vector.id,
        isAlert: false,
        layerIndex,
      });
    });
  }

  async changeBranch(name) {
    this.active = {
      name,
      id: this.list.filter((elem) => elem.name === name)[0].id,
    };
    // this.viewer.message = '';
    this.alert.reset();
    await this.setLayers();
    this.view.dispatchEvent({
      type: 'branch-changed',
      name: this.active.name,
      id: this.active.id,
    });
  }

  createBranch() {
    this.viewer.message = '';
    // eslint-disable-next-line no-alert
    const branchName = window.prompt('Choose a new branch name:', '');
    const errors = [];
    if (branchName === null) return;
    if (branchName.length === 0) {
      errors.push('le nom ne peut être vide');
    } else if (!branchName[0].match(/[a-z0-9]/i)) {
      errors.push('le nom doit commencer par une lettre ou un chiffre');
    }
    if (!branchName.match(/^[a-z0-9_-]*$/i)) {
      errors.push('le nom ne peut contenir que des caractères alphanumériques non accentués ainsi que - et _');
    }
    if (errors.length > 0) {
      const error = new Error(`${[`Ajout d'une branche "${branchName}"`, ...errors].join('\n    -> ')}\n`);
      error.name = 'Erreur ';
      this.view.dispatchEvent({
        type: 'error',
        error,
      });
      return;
    }
    this.addBranch(branchName);
  }

  addBranch(branchName) {
    this.api.postBranch(branchName)
      .then((newBranch) => {
        this.list.push(newBranch);
        this.view.dispatchEvent({
          type: 'branch-created',
          name: branchName,
          id: newBranch.id,
        });
      })
      .catch((error) => {
        if (error.name === 'Server Error') {
          this.viewer.message = 'la branche existe déjà';
        } else {
          this.viewer.message = 'PB de mise à jour de la BdD';
          this.view.dispatchEvent({
            type: 'error',
            msg: error,
          });
        }
      });
  }

  saveLayer(name, geojson, style) {
    return new Promise((resolve, reject) => {
      const crs = readCRS(geojson);
      this.api.saveVector(this.active.id, name, geojson, crs, style)
        .then((id) => {
          this.vectorList.push({
            name,
            id,
            style_itowns: JSON.stringify(style),
            crs,
          });
          this.setLayers(this.vectorList);
          resolve();
        })
        .catch(() => {
          this.viewer.message = 'PB with updating the database';
          const err = new Error(`Layer '${name}' NOT saved`);
          err.name = 'Database Error';
          reject(err);
        });
    });
  }

  deleteLayer(id, name) {
    return new Promise((resolve, reject) => {
      this.api.deleteVector(name, id)
        .then(() => {
          this.vectorList = this.vectorList.filter((l) => l.id !== id);
          this.setLayers(this.vectorList);
          resolve();
        })
        .catch(() => {
          this.viewer.message = 'PB with updating the database';
          const err = new Error(`Vector '${name}' (id: ${id}) NOT deleted`);
          err.name = 'Database Error';
          reject(err);
        });
    });
  }
}
export default Branch;
