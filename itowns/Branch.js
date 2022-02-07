/* eslint-disable no-console */
import * as itowns from 'itowns';
import Alert from './Alert';

class Branch {
  constructor(apiUrl, viewer) {
    this.apiUrl = apiUrl;
    this.viewer = viewer;
    this.view = viewer.view;
    this.api = viewer.api;

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
        style: JSON.parse(vector.style_itowns),
        visible: true,
        id: vector.id,
      };
    });
  }

  async changeBranch() {
    console.log('changeBranch -> name:', this.active.name, 'id:', this.active.id);
    this.viewer.message = '';
    const listColorLayer = this.viewer.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
    listColorLayer.forEach((element) => {
      const regex = new RegExp(`^${this.apiUrl}\\/[0-9]+\\/`);
      this.view.getLayerById(element).source.url = this.view.getLayerById(element).source.url.replace(regex, `${this.apiUrl}/${this.active.id}/`);
    });
    const getVectorList = itowns.Fetcher.json(`${this.apiUrl}/${this.active.id}/vectors`);
    this.vectorList = await getVectorList;
    this.setLayers();
    this.viewer.refresh(this.layers, true);
  }

  createBranch() {
    this.viewer.message = '';
    // eslint-disable-next-line no-alert
    const branchName = window.prompt('Choose a new branch name:', '');
    console.log(branchName);
    if (branchName === null) return;
    if (branchName.length === 0) {
      this.viewer.message = 'le nom n\'est pas valide';
      return;
    }
    this.addBranch(branchName);
  }

  async addBranch(branchName) {
    const res = await fetch(`${this.apiUrl}/branch?name=${branchName}&idCache=${this.viewer.idCache}`,
      {
        method: 'POST',
      });// .then((res) => {
    if (res.status === 200) {
      const branches = await itowns.Fetcher.json(`${this.apiUrl}/branches?idCache=${this.viewer.idCache}`);// .then((branches) => {
      this.list = branches;
      this.active.name = branchName;
      this.active.id = this.list.filter((branch) => branch.name === branchName)[0].id;
      await this.changeBranch();
      this.view.dispatchEvent({
        type: 'branch-created',
      });
      // });
    } else {
      res.text().then((err) => {
        console.log(err);
        this.viewer.message = 'le nom n\'est pas valide';
      });
    }
    // });
  }

  // saveLayer(name, geojson, style) {
  //   this.api.saveVector(this.active.id, name, geojson, style);
  // }

  // deleteLayer(name, id) {
  //   this.api.deleteVector(name, id);
  // }

  deleteLayer(name, id) {
    return new Promise((resolve, reject) => {
      this.api.deleteVector(name, id)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.log(error);
          this.viewer.message = 'PB with updating the database';
          const err = new Error(`Vector '${name}' (id: ${id}) NOT deleted`);
          err.name = 'Server Error';
          reject(err);
        });
    });
  }

  saveLayer(name, geojson, style) {
    return new Promise((resolve, reject) => {
      this.api.saveVector(this.active.id, name, geojson, style)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.log(error);
          this.viewer.message = 'PB with updating the database';
          const err = new Error(`Layer '${name}' NOT saved`);
          err.name = 'Server Error';
          reject(err);
        });
    });
  }

  setAlertLayer(name) {
    if (this.alert.layerName !== ' -') this.layers[this.alert.layerName].isAlert = false;
    if (name !== ' -') this.layers[name].isAlert = true;
    this.alert.layerName = name;
  }
}
export default Branch;
