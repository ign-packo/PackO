/* eslint-disable no-console */
import * as itowns from 'itowns';

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
  constructor(apiUrl, viewer) {
    this.apiUrl = apiUrl;
    this.viewer = viewer;
    this.view = viewer.view;

    this.layers = {};
    this.vectorList = {};

    this.active = {};
    this.list = {};
  }

  setLayers() {
    this.layers = {
      Ortho: {
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
        wmtsStyle: 'RVB',
      },
      Graph: {
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
      },
      Contour: {
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: true,
      },
      Opi: {
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: false,
        wmtsStyle: 'RVB',
      },
      Patches: {
        type: 'vector',
        url: `${this.apiUrl}/${this.active.id}/patches`,
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
        url: `${this.apiUrl}/vector?idVector=${vector.id}`,
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

  async saveLayer(name, geojson, style) {
    const crs = readCRS(geojson);
    const res = await fetch(`${this.apiUrl}/${this.active.id}/vector`,
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
      });
    if (res.status === 200) {
      this.vectorList = await itowns.Fetcher.json(`${this.apiUrl}/${this.active.id}/vectors`);
      this.setLayers();
      // const json = await res.json();
      // this.layers[name] = {
      //   type: 'vector',
      //   url: `${this.apiUrl}/vector?idVector=${json.id}`,
      //   crs,
      //   opacity: 1,
      //   style,
      //   visible: true,
      //   id: json.id,
      // };
      console.log(`-> Layer '${name}' saved`);
      this.viewer.refresh(this.layers);
    } else {
      console.log(`-> Error Serveur: Layer '${name}' NOT saved`);
    }
  }

  deleteLayer(id) {
    fetch(`${this.apiUrl}/vector?idVector=${id}`,
      {
        method: 'DELETE',
      }).then((res) => {
      if (res.status === 200) {
        const layer = this.vectorList.filter((elem) => elem.id === id)[0];
        const index = this.vectorList.indexOf(layer);
        this.vectorList.splice(index, 1);
        delete this.layers[layer.name];
        console.log(`-> Layer '${id}' deleted`);
      } else {
        console.log(`-> Error Serveur: Layer '${id}' NOT deleted`);
      }
    });
  }

  deleteVectorLayer(layer) {
    if (!layer) return;
    this.deleteLayer(layer.vectorId);
    this.view.removeLayer(layer.id);
    this.viewer.menuGlobe.removeLayersGUI(layer.id);
    delete this.viewer.layerIndex[layer.id];
  }
}
export default Branch;
