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

    this.layers = [];

    this.active = {};
    this.list = {};
  }

  async setLayers(vectorList = null) {
    let getVectorList;
    if (vectorList === null) {
      getVectorList = itowns.Fetcher.json(`${this.apiUrl}/${this.active.id}/vectors`);
    }

    this.layers = [
      {
        name: 'Graph',
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
      },
      {
        name: 'Ortho',
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 1,
        visible: true,
      },
      {
        name: 'Opi',
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: false,
      },
      {
        name: 'Contour',
        type: 'raster',
        url: `${this.apiUrl}/${this.active.id}/wmts`,
        crs: this.viewer.crs,
        opacity: 0.5,
        visible: true,
      },
      {
        name: 'Patches',
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
    ];

    if (vectorList === null) {
      this.vectorList = await getVectorList;
    }

    this.vectorList.forEach((vector) => {
      this.layers.push({
        name: vector.name,
        type: 'vector',
        url: `${this.apiUrl}/vector?idVector=${vector.id}`,
        crs: vector.crs,
        opacity: 1,
        visible: true,
        style: JSON.parse(vector.style_itowns),
        vectorId: vector.id,
        isAlert: false,
      });
    });
  }

  async changeBranch(name) {
    this.active = {
      name,
      id: this.list.filter((elem) => elem.name === name)[0].id,
    };
    this.viewer.message = '';
    const listColorLayer = this.viewer.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
    listColorLayer.forEach((element) => {
      const regex = new RegExp(`^${this.apiUrl}\\/[0-9]+\\/`);
      this.view.getLayerById(element).source.url = this.view.getLayerById(element).source.url.replace(regex, `${this.apiUrl}/${this.active.id}/`);
    });
    await this.setLayers();
    this.viewer.removeExtraLayers(this.viewer.menuGlobe);
    this.view.dispatchEvent({
      type: 'branch-changed',
      name: this.active.name,
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

  async addBranch(branchName) {
    const res = await fetch(`${this.apiUrl}/branch?name=${branchName}&idCache=${this.viewer.idCache}`,
      {
        method: 'POST',
      });
    if (res.status === 200) {
      const branches = await itowns.Fetcher.json(`${this.apiUrl}/branches?idCache=${this.viewer.idCache}`);// .then((branches) => {
      this.list = branches;
      this.active.name = branchName;
      this.active.id = this.list.filter((branch) => branch.name === branchName)[0].id;
      this.view.dispatchEvent({
        type: 'branch-created',
        name: branchName,
        id: this.active.id,
      });
    } else {
      res.text().then((err) => {
        console.log(err);
        this.viewer.message = 'le nom n\'est pas valide';
      });
    }
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
      const json = await res.json();
      this.vectorList.push({
        name,
        id: json.id,
        style_itowns: JSON.stringify(style),
        crs,
      });
      this.setLayers(this.vectorList);
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
