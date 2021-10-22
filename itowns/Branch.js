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
  constructor(apiUrl, vue) {
    // this.getBranches = getBranches;
    this.apiUrl = apiUrl;
    this.vue = vue;
    this.view = vue.view;

    this.layers = {};
    this.vectorList = {};

    // this.layer = {};
    this.idBranch = 0;
    // this.currentBranch = {
    //   id: 0,
    //   name: 'master',
    // };
    // this.branches = null;
    // this.branchNames = [];
    this.list = {};
    this.names = [];
  }

  setLayers() {
    // this.vectorList = await getVectorList
    // const getVectorList = itowns.Fetcher.json(`${this.apiUrl}/${this.idBranch}/vectors`);

    this.layers = {
      Ortho: {
        type: 'raster',
        url: `${this.apiUrl}/${this.idBranch}/wmts`,
        crs: this.vue.crs,
        opacity: 1,
        visible: true,
      },
      Graph: {
        type: 'raster',
        url: `${this.apiUrl}/${this.idBranch}/wmts`,
        crs: this.vue.crs,
        opacity: 1,
        visible: true,
      },
      Contour: {
        type: 'raster',
        url: `${this.apiUrl}/${this.idBranch}/wmts`,
        crs: this.vue.crs,
        opacity: 0.5,
        visible: true,
      },
      Opi: {
        type: 'raster',
        url: `${this.apiUrl}/${this.idBranch}/wmts`,
        crs: this.vue.crs,
        opacity: 0.5,
        visible: false,
      },
      Patches: {
        type: 'vector',
        url: `${this.apiUrl}/${this.idBranch}/patches`,
        crs: this.vue.crs,
        opacity: 1,
        visible: false,
        style: {
          stroke: {
            color: 'Yellow',
            width: 2,
          },
        },
      },
    };
    // if (!this.vectorList[this.idBranch]) this.vectorList[this.idBranch] = [];

    // this.vectorList = await getVectorList;

    // this.vectorList[this.idBranch].forEach((vector) => {
    this.vectorList.forEach((vector) => {
      this.layers[vector.name] = {
        type: 'vector',
        url: `${this.apiUrl}/vector?idVector=${vector.id}`,
        crs: vector.crs,
        opacity: 1,
        // style: vector.config.style,
        style: JSON.parse(vector.style_itowns),
        visible: true,
      };
    });
  }

  async changeBranchId(branchId) {
    console.log('changeBranch ->', branchId);
    this.vue.message = '';
    this.idBranch = branchId;
    // Object.keys(this.layer).forEach((element) => {
    const listColorLayer = this.vue.view.getLayers((l) => l.isColorLayer).map((l) => l.id);
    listColorLayer.forEach((element) => {
      const regex = new RegExp(`^${this.apiUrl}\\/[0-9]+\\/`);
      this.view.getLayerById(element).source.url = this.view.getLayerById(element).source.url.replace(regex, `${this.apiUrl}/${this.idBranch}/`);
    });
    const getVectorList = itowns.Fetcher.json(`${this.apiUrl}/${this.idBranch}/vectors`);
    this.vectorList = await getVectorList;
    this.setLayers();
    this.vue.refresh(this.layers);
  }

  createBranch() {
    this.vue.message = '';
    const branchName = window.prompt('Choose a new branch name:', '');
    console.log(branchName);
    if (branchName === null) return;
    if (branchName.length === 0) {
      this.vue.message = 'le nom n\'est pas valide';
      return;
    }
    fetch(`${this.apiUrl}/branch?name=${branchName}&idCache=${this.vue.idCache}`,
      {
        method: 'POST',
      }).then((res) => {
      if (res.status === 200) {
        itowns.Fetcher.json(`${this.apiUrl}/branches?idCache=${this.vue.idCache}`).then((branches) => {
          const branchNames = [];
          let branchId = null;
          branches.forEach((element) => {
            branchNames.push(element.name);
            if (element.name === branchName) {
              branchId = element.id;
            }
          });
          this.controllers.branch = this.controllers.branch.options(branchNames)
            .setValue(branchName);
          this.controllers.branch.onChange((value) => {
            console.log('new active branch : ', value);
            branches.forEach((branch) => {
              if (branch.name === value) {
                this.branch = value;
                // this.idBranch = branch.id;
                this.changeBranchId(branch.id);
              }
            });
          });
          this.changeBranchId(branchId);
        });
      } else {
        res.text().then((err) => {
          console.log(err);
          this.vue.message = 'le nom n\'est pas valide';
        });
      }
    });
  }

  saveLayer(name, geojson, style) {
    // this.vectorList[this.idBranch].push({
    // this.vectorList.push({
    //   // id: this.vectorList[this.idBranch].length + 1,
    //   num: this.vectorList.length + 1,
    //   name,
    //   // style,
    //   config: {
    //     transparent: true,
    //     opacity: 1,
    //     style,
    //   },
    //   crs: readCRS(geojson),
    // });

    // console.log(this.vectorList);

    fetch(`${this.apiUrl}/${this.idBranch}/vector`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // metadonnees: this.vectorList,
          metadonnees: {
            name,
            style,
            crs: readCRS(geojson),
          },
          data: geojson,
        }),
      }).then(async (res) => {
      if (res.status === 200) {
        // this.vectorList = await itowns.Fetcher.json(`${this.apiUrl}/${this.idBranch}/vectors`);
        // this.setLayers();
        res.json().then((json) => {
          this.layers[name] = {
            type: 'vector',
            url: `${this.apiUrl}/vector?idVector=${json.id}`,
            crs: readCRS(geojson),
            opacity: 1,
            style,
            visible: true,
          };
          console.log(`-> Layer '${name}' saved`);
        });
      } else {
        console.log(`-> Error Serveur: Layer '${name}' NOT saved`);
      }
    });
  }
}
export default Branch;
