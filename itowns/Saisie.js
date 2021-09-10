/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
import * as itowns from 'itowns';
import * as THREE from 'three';

const status = {
  RAS: 0,
  SELECT: 1,
  POLYGON: 2,
  ENDING: 3,
  WAITING: 4,
};

class Saisie {
  constructor(view, layer, apiUrl, branchId) {
    this.view = view;
    this.layer = layer;
    this.apiUrl = apiUrl;
    this.branchId = branchId;

    this.validClicheSelected = false;
    this.currentStatus = status.RAS;
    this.currentPolygon = null;
    this.nbVertices = 0;
    this.lastPos = null;
    this.mousePosition = null;
  }

  changeBranchId(branchId) {
    this.message = '';
    this.branchId = branchId;
    Object.keys(this.layer).forEach((element) => {
      // const regex = /^.*\/wmts/;
      const regex = new RegExp(`^${this.apiUrl}\\/[0-9]+\\/`);
      this.layer[element].config.source.url = this.layer[element].config.source.url.replace(regex, `${this.apiUrl}/${this.branchId}/`);
    });
    this.refreshView(['ortho', 'graph', 'contour', 'patches']);
  }

  async refreshView(layers) {
    // Pour le moment on force le rechargement complet des couches
    let redrawPatches = false;
    layers.forEach((id) => {
      this.view.removeLayer(this.layer[id].colorLayer.id);
      this.layer[id].config.opacity = this.layer[id].colorLayer.opacity;
      this.layer[id].config.visible = this.layer[id].colorLayer.visible;

      // ColorLayer
      if (id !== 'patches') {
        this.layer[id].colorLayer = new itowns.ColorLayer(
          this.layer[id].name,
          this.layer[id].config,
        );
        this.view.addLayer(this.layer[id].colorLayer);
        if (id === 'contour') {
          this.layer[id].colorLayer.effect_type = itowns.colorLayerEffects.customEffect;
          this.layer[id].colorLayer.effect_parameter = 1.0;
          this.layer[id].colorLayer.magFilter = 1003;// itowns.THREE.NearestFilter;
          this.layer[id].colorLayer.minFilter = 1003;// itowns.THREE.NearestFilter;
        }
      } else {
        redrawPatches = true;
      }
    });
    if (redrawPatches) {
      this.layer.patches.config.opacity = this.layer.patches.colorLayer.opacity;
      this.layer.patches.config.visible = this.layer.patches.colorLayer.visible;

      const currentPatches = await itowns.Fetcher.json(`${this.apiUrl}/${this.branchId}/patches`);
      this.layer.patches.config.source = new itowns.FileSource({
        fetchedData: currentPatches,
        crs: this.view.camera.crs,
        parser: itowns.GeoJsonParser.parse,
      });

      this.layer.patches.colorLayer = new itowns.ColorLayer(
        this.layer.patches.name,
        this.layer.patches.config,
      );
      this.view.addLayer(this.layer.patches.colorLayer);
    }
    itowns.ColorLayersOrdering.moveLayerToIndex(this.view, 'Ortho', 0);
    itowns.ColorLayersOrdering.moveLayerToIndex(this.view, 'Opi', 1);
    itowns.ColorLayersOrdering.moveLayerToIndex(this.view, 'Graph', 2);
    itowns.ColorLayersOrdering.moveLayerToIndex(this.view, 'Contour', 3);
    itowns.ColorLayersOrdering.moveLayerToIndex(this.view, 'Patches', 4);
    this.view.notifyChange();
  }

  pickPoint(event) {
    const pointUnderCursor = new THREE.Vector3();
    const coords = this.view.eventToViewCoords(event);
    this.view.getPickingPositionFromDepth(coords, pointUnderCursor);
    return pointUnderCursor;
  }

  mousemove(e) {
    this.mousePosition = this.pickPoint(e);
    if (this.mousePosition) {
      this.coord = `${this.mousePosition.x.toFixed(2)},${this.mousePosition.y.toFixed(2)}`;
      if (this.currentPolygon == null) return;

      if (this.currentStatus === status.POLYGON && this.nbVertices > 0) {
        const vertices = this.currentPolygon.geometry.attributes.position;
        const newPoint = new THREE.Vector3();
        newPoint.subVectors(this.mousePosition, this.currentPolygon.position);
        vertices.set(newPoint.toArray(), 3 * this.nbVertices);
        vertices.copyAt(this.nbVertices + 1, vertices, 0);
        vertices.needsUpdate = true;

        this.currentPolygon.geometry.setDrawRange(0, this.nbVertices + 2);
        this.currentPolygon.geometry.computeBoundingSphere();
        this.view.notifyChange(this.currentPolygon);
      }
    }
  }

  update() {
    console.log('update');
    if (!this.currentPolygon) {
      console.log('pas de polygone');
      return;
    }
    this.currentStatus = status.RAS;
    this.message = '';
    const positions = this.currentPolygon.geometry.attributes.position.array;
    const geojson = {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: { type: 'name', properties: { name: `urn:ogc:def:crs:${this.view.camera.crs.replace(':', '::')}` } },
      features: [
        {
          type: 'Feature',
          properties: this.json,
          geometry:
                    {
                      type: 'Polygon',
                      coordinates: [[]],
                    },
        },
      ],
    };
    for (let i = 0; i <= this.nbVertices; i += 1) {
      geojson.features[0].geometry.coordinates[0].push(
        [
          positions[3 * i] + this.currentPolygon.position.x,
          positions[3 * i + 1] + this.currentPolygon.position.y,
        ],
      );
    }

    const dataStr = JSON.stringify(geojson);
    this.view.scene.remove(this.currentPolygon);
    this.currentStatus = status.WAITING;
    this.view.controls.setCursor('default', 'wait');
    this.message = 'calcul en cours';
    // On post le geojson sur l'API
    fetch(`${this.apiUrl}/${this.branchId}/patch?`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: dataStr,
      }).then((res) => {
      this.cancelcurrentPolygon();
      if (res.status === 200) {
        this.refreshView(['ortho', 'graph', 'contour', 'patches']);
      } else {
        this.message = "polygon: out of OPI's bounds";
      }
    });
  }

  cancelcurrentPolygon() {
    if (this.currentPolygon) {
      // on annule la saisie en cours
      this.view.scene.remove(this.currentPolygon);
      this.currentPolygon = null;
      this.view.notifyChange();
    }
    this.view.controls.setCursor('default', 'auto');
    this.currentStatus = status.RAS;
    this.message = '';

    Object.keys(this.controllers).forEach((key) => {
      if (key !== 'cliche') this.controllers[key].__li.style.backgroundColor = '';
    });
  }

  keydown(e) {
    if (this.currentStatus === status.WAITING) return;
    console.log(e.key, ' down');
    if (e.key === 'Escape') {
      this.view.controls.setCursor('default', 'auto');
      this.cancelcurrentPolygon();
    } else if (e.key === 'Shift') {
      if (this.currentStatus === status.POLYGON) {
        if (this.currentPolygon && (this.nbVertices > 2)) {
          this.currentStatus = status.ENDING;
          this.message = 'Cliquer pour valider la saisie';
          this.view.controls.setCursor('default', 'progress');

          const vertices = this.currentPolygon.geometry.attributes.position;
          vertices.copyAt(this.nbVertices, vertices, 0);
          vertices.needsUpdate = true;

          this.currentPolygon.geometry.setDrawRange(0, this.nbVertices + 1);
          this.currentPolygon.geometry.computeBoundingSphere();
          this.view.notifyChange(this.currentPolygon);
        } else {
          this.message = 'Pas assez de points';
        }
      }
    } else if (e.key === 'Backspace') {
      if (this.currentStatus === status.POLYGON) {
        if (this.currentPolygon && (this.nbVertices > 1)) {
          const vertices = this.currentPolygon.geometry.attributes.position;
          vertices.copyAt(this.nbVertices - 1, vertices, this.nbVertices);
          vertices.copyAt(this.nbVertices, vertices, 0);
          vertices.needsUpdate = true;

          this.currentPolygon.geometry.setDrawRange(0, this.nbVertices + 1);
          this.currentPolygon.geometry.computeBoundingSphere();
          this.view.notifyChange(this.currentPolygon);

          this.nbVertices -= 1;
        }
      }
    }
  }

  keyup(e) {
    if (this.currentStatus === status.WAITING) return;
    console.log(e.key, ' up');
    if (e.key === 'Shift') {
      if (this.currentStatus === status.ENDING || this.currentStatus === status.POLYGON) {
        this.message = 'Maj pour terminer';
        if (this.currentPolygon && (this.nbVertices > 0)) {
          // on remet le dernier sommet sur la position de la souris

          const vertices = this.currentPolygon.geometry.attributes.position;
          const newPoint = new THREE.Vector3();
          newPoint.subVectors(this.mousePosition, this.currentPolygon.position);
          vertices.set(newPoint.toArray(), 3 * this.nbVertices);
          vertices.needsUpdate = true;

          this.currentPolygon.geometry.setDrawRange(0, this.nbVertices + 2);
          this.currentPolygon.geometry.computeBoundingSphere();
          this.view.notifyChange(this.currentPolygon);
          this.view.controls.setCursor('default', 'crosshair');
        }
        this.currentStatus = status.POLYGON;
      }
    }
  }

  click(e) {
    if (this.currentStatus === status.WAITING) return;
    const mousePosition = this.pickPoint(e);
    console.log('Click: ', mousePosition.x, mousePosition.y);
    console.log('currentStatus: ', this.currentStatus);
    this.message = '';

    switch (this.currentStatus) {
      case status.SELECT: {
        console.log('get OPI');
        // on selectionne le cliche
        const pos = this.pickPoint(e);
        this.view.controls.setCursor('default', 'auto');
        fetch(`${this.apiUrl}/${this.branchId}/graph?x=${pos.x}&y=${pos.y}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }).then((res) => {
          res.json().then((json) => {
            this.cliche = json.cliche;
            this.cancelcurrentPolygon();
            if (res.status === 200) {
              this.json = json;
              this.color = json.color;
              this.controllers.cliche.__li.style.backgroundColor = `rgb(${this.color[0]},${this.color[1]},${this.color[2]})`;
              // On modifie la couche OPI
              this.layer.opi.config.source.url = this.layer.opi.config.source.url.replace(/LAYER=.*&FORMAT/, `LAYER=opi&Name=${json.cliche}&FORMAT`);
              this.refreshView(['opi']);
              this.validClicheSelected = true;
            }
            if (res.status === 201) {
              console.log('out of bounds');
              this.layer.opi.colorLayer.visible = false;
              this.validClicheSelected = false;
              this.controllers.cliche.__li.style.backgroundColor = '';
              this.view.notifyChange(this.layer.opi.colorLayer, true);
            }
            if (res.status === 202) {
              console.log('Server Error');
              console.log(json);
              const err = new Error('cache corrompu');
              err.name = 'Server Error';
              window.alert(`${err}\n${JSON.stringify(json)}`);
            }
          });
        });
        break;
      }
      case status.POLYGON: {
        // Cas ou l'on est en train de saisir un polygon : on ajoute un point
        this.message = 'Maj pour terminer';

        // Si c'est le premier point, on defini une position de reference (pb de précision)
        if (this.nbVertices === 0) {
          this.currentPolygon.position.x = Math.floor(mousePosition.x);
          this.currentPolygon.position.y = Math.floor(mousePosition.y);
          this.currentPolygon.position.z = Math.floor(mousePosition.z);
          this.currentPolygon.updateMatrixWorld();

          // on ajoute ce premier point dans vertices
          const vertices = this.currentPolygon.geometry.attributes.position;
          const newPoint = new THREE.Vector3();
          newPoint.subVectors(mousePosition, this.currentPolygon.position);
          vertices.set(newPoint.toArray(), 3 * this.nbVertices);
          vertices.needsUpdate = true;
        }
        this.nbVertices += 1;
        break;
      }
      case status.ENDING:
      // on termine la ployline ou polygon
        this.update();
        break;
      default:
    }
  }

  select() {
    if (this.currentStatus === status.WAITING) return;
    this.cancelcurrentPolygon();
    this.controllers.select.__li.style.backgroundColor = '#FF000055';
    this.view.controls.setCursor('default', 'crosshair');
    console.log('"select": En attente de sélection');
    this.currentStatus = status.SELECT;
    this.message = 'choisir un cliche';
  }

  createBranch() {
    this.message = '';
    const branchName = window.prompt('Choose a new branch name:', '');
    console.log(branchName);
    if (branchName === null) return;
    if (branchName.length === 0) {
      this.message = 'le nom n\'est pas valide';
      return;
    }
    fetch(`${this.apiUrl}/branch?name=${branchName}`,
      {
        method: 'POST',
      }).then((res) => {
      if (res.status === 200) {
        itowns.Fetcher.json(`${this.apiUrl}/branches`).then((branches) => {
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
                this.branchId = branch.id;
                this.changeBranchId(this.branchId);
              }
            });
          });
          this.changeBranchId(branchId);
        });
      } else {
        res.text().then((err) => {
          console.log(err);
          this.message = 'le nom n\'est pas valide';
        });
      }
    });
  }

  polygon() {
    if (this.currentStatus === status.WAITING) return;
    if (!this.validClicheSelected) {
      this.message = (this.currentStatus === status.MOVE_POINT) ? 'choisir un cliche valide' : 'cliche non valide';
      return;
    }
    if (this.currentPolygon) {
      this.message = 'saisie déjà en cours';
      // saisie deja en cours
      return;
    }
    this.controllers.select.__li.style.backgroundColor = '';
    this.controllers.polygon.__li.style.backgroundColor = '#FF000055';
    this.view.controls.setCursor('default', 'crosshair');
    console.log("saisie d'un polygon");
    this.message = "saisie d'un polygon";
    const MAX_POINTS = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 1);
    const material = new THREE.LineBasicMaterial({
      color: 0xFF0000,
      depthTest: false,
      depthWrite: false,
    });
    this.currentPolygon = new THREE.Line(geometry, material);
    // Pour eviter que l'object disparaisse dans certains cas
    this.currentPolygon.renderOrder = 1;
    this.currentPolygon.maxMarkers = -1;
    this.view.scene.add(this.currentPolygon);
    this.view.notifyChange(this.currentPolygon);
    this.currentStatus = status.POLYGON;
    this.nbVertices = 0;
  }

  undo() {
    if (this.currentStatus === status.WAITING) return;
    this.cancelcurrentPolygon();
    this.message = '';
    console.log('undo');
    this.currentStatus = status.WAITING;
    this.view.controls.setCursor('default', 'wait');
    this.message = 'calcul en cours';
    fetch(`${this.apiUrl}/${this.branchId}/patch/undo?`,
      {
        method: 'PUT',
      }).then((res) => {
      this.cancelcurrentPolygon();
      if (res.status === 200) {
        this.refreshView(['ortho', 'graph', 'contour', 'patches']);
      }
      res.text().then((msg) => {
        this.message = msg;
      });
    });
  }

  redo() {
    if (this.currentStatus === status.WAITING) return;
    this.cancelcurrentPolygon();
    this.message = '';
    console.log('redo');
    this.currentStatus = status.WAITING;
    this.view.controls.setCursor('default', 'wait');
    this.message = 'calcul en cours';
    fetch(`${this.apiUrl}/${this.branchId}/patch/redo?`,
      {
        method: 'PUT',
      }).then((res) => {
      this.cancelcurrentPolygon();
      if (res.status === 200) {
        this.refreshView(['ortho', 'graph', 'contour', 'patches']);
      }
      res.text().then((msg) => {
        this.message = msg;
      });
    });
  }

  clear() {
    if (this.currentStatus === status.WAITING) return;
    const ok = window.confirm('Voulez-vous effacer toutes les modifications?');
    if (!ok) return;
    console.log('clear');
    this.currentStatus = status.WAITING;
    this.view.controls.setCursor('default', 'wait');
    this.message = 'calcul en cours';

    fetch(`${this.apiUrl}/${this.branchId}/patches/clear?`,
      {
        method: 'PUT',
      }).then((res) => {
      this.cancelcurrentPolygon();
      if (res.status === 200) {
        this.refreshView(['ortho', 'graph', 'contour', 'patches']);
      }
      res.text().then((msg) => {
        this.message = msg;
      });
    });
  }
}

export default Saisie;
