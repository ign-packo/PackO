import * as itowns from 'itowns';
import Alert from './Alert';

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
  constructor(viewer, idCache) {
    // this.apiUrl = apiUrl;
    this.viewer = viewer;
    this.view = viewer.view;
    this.api = viewer.api;
    this.idCache = idCache;

    this.layers = {};
    this.vectorList = {};

    this.active = {};
    this.list = {};
    this.alert = new Alert(this);
  }

  setLayers() {
    this.layers = {
      Ortho: {
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
      },
      Graph: {
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
      },
      Contour: {
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: true,
      },
      Opi: {
        type: 'raster',
        url: `${this.api.url}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: false,
      },
      Patches: {
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
    };

    this.vectorList.forEach((vector) => {
      this.layers[vector.name] = {
        type: 'vector',
        url: `${this.api.url}/vector?idVector=${vector.id}`,
        crs: vector.crs,
        opacity: 1,
        visible: true,
        style: JSON.parse(vector.style_itowns),
        id: vector.id,
      };
    });
  }

  async changeBranch(name) {
    this.active = {
      name,
      id: this.list.filter((elem) => elem.name === name)[0].id,
    };
    const listColorLayer = this.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
    listColorLayer.forEach((element) => {
      const regex = new RegExp(`^${this.api.url}\\/[0-9]+\\/`);
      this.view.getLayerById(element).source.url = this.view.getLayerById(element).source.url
        .replace(regex, `${this.api.url}/${this.active.id}/`);
    });
    this.vectorList = await itowns.Fetcher.json(`${this.api.url}/${this.active.id}/vectors`);
    this.setLayers();
    this.resetAlert();
    this.view.dispatchEvent({
      type: 'branch-changed',
      name: this.active.name,
    });
    // this.viewer.refresh(this.layers, true);
  }

  async getVectorList() {
    this.vectorList = await itowns.Fetcher.json(`${this.apiUrl}/${this.active.id}/vectors`);
    this.setLayers();
  }

  createBranch() {
    // eslint-disable-next-line no-alert
    const branchName = window.prompt('Choose a new branch name:', '');
    if (branchName === null) return;
    if (branchName.length === 0) {
      this.viewer.message = "le nom n'est pas valide";
      return;
    }
    this.addBranch(branchName);
  }

  addBranch(branchName) {
    this.api.postBranch(this.idCache, branchName)
      .then((newBranch) => {
        this.list.push(newBranch);
        this.view.dispatchEvent({
          type: 'branch-created',
          name: branchName,
          id: newBranch.id,
        });
        // await this.changeBranch(branchName);
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

  deleteLayer(name, id) {
    return new Promise((resolve, reject) => {
      this.api.deleteVector(name, id)
        .then(() => {
          const layer = this.vectorList.filter((elem) => elem.id === id)[0];
          const index = this.vectorList.indexOf(layer);
          this.vectorList.splice(index, 1);
          delete this.layers[name];
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
          this.setLayers();
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

  setAlertLayer(name) {
    if (this.alert.layerName !== ' -') this.layers[this.alert.layerName].isAlert = false;
    if (name !== ' -') this.layers[name].isAlert = true;
    this.alert.layerName = name;
  }

  resetAlert() {
    this.alert = new Alert(this);
  }
}
export default Branch;
