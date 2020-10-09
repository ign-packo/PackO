// const { threshold } = require("jimp");

// const { threshold } = require("jimp");

class Saisie {
  constructor(options) {
    this.opiLayer = options.opiLayer;
    this.orthoLayer = options.orthoLayer;
    this.graphLayer = options.graphLayer;
    this.opiConfig = options.opiConfig;
    this.orthoConfig = options.orthoConfig;
    this.graphConfig = options.graphConfig;
    this.apiUrl = options.apiUrl;

    this.status = 'ras';
    this.currentMeasure = null;
    this.currentIndex = -1;
    console.log('Saisie', this.status);
  }

  pickPoint(e) {
    const pointUnderCursor = new itowns.THREE.Vector3();
    const mousePosition = new itowns.THREE.Vector2();
    mousePosition.set(e.clientX, e.clientY);
    view.getPickingPositionFromDepth(mousePosition, pointUnderCursor);
    return pointUnderCursor;
  }

  mousemove(e) {
    const pos = this.pickPoint(e);
    if (pos) {
      // console.log('position :', pos);
      this.coord = `${pos.x.toFixed(2)} ${pos.y.toFixed(2)}`;
      if (this.currentMeasure == null) return;
      if (this.status == 'movePoint') {
        var positions = this.currentMeasure.geometry.attributes.position.array;
        // Si c'est le premier point, on fixe la position
        if (this.currentIndex == 0) {
          this.currentMeasure.position.x = Math.floor(pos.x);
          this.currentMeasure.position.y = Math.floor(pos.y);
          this.currentMeasure.position.z = Math.floor(pos.z);
          this.currentMeasure.updateMatrixWorld();
        }
        positions[3 * this.currentIndex] = pos.x - this.currentMeasure.position.x;
        positions[3 * this.currentIndex + 1] = pos.y - this.currentMeasure.position.y;
        positions[3 * this.currentIndex + 2] = pos.z - this.currentMeasure.position.z;
        this.currentMeasure.geometry.attributes.position.needsUpdate = true;
        this.currentMeasure.geometry.computeBoundingSphere();
        view.notifyChange(this.currentMeasure);
      }
    } else if ((this.status == 'freehand') && (e.buttons == 2)) {
      const pos = this.pickPoint(e);
      if (pos) {
        var positions = this.currentMeasure.geometry.attributes.position.array;
        if (this.currentIndex == 0) {
          this.currentMeasure.position.x = Math.floor(pos.x);
          this.currentMeasure.position.y = Math.floor(pos.y);
          this.currentMeasure.position.z = Math.floor(pos.z);
          this.currentMeasure.updateMatrixWorld();
        }
        positions[3 * this.currentIndex] = pos.x - this.currentMeasure.position.x;
        positions[3 * this.currentIndex + 1] = pos.y - this.currentMeasure.position.y;
        positions[3 * this.currentIndex + 2] = pos.z - this.currentMeasure.position.z;
        positions[3 * (this.currentIndex + 1)] = positions[0];
        positions[3 * (this.currentIndex + 1) + 1] = positions[1];
        positions[3 * (this.currentIndex + 1) + 2] = positions[2];
        this.currentIndex += 1;
        this.currentMeasure.geometry.setDrawRange(0, this.currentIndex + 1);
        this.currentMeasure.geometry.attributes.position.needsUpdate = true;
        this.currentMeasure.geometry.computeBoundingSphere();
        view.notifyChange(this.currentMeasure);
      }
    }
  }

  mousedown(e) {
    if (this.status == 'freehand-wait') {
      this.status = 'freehand';
    }
  }

  mouseup(e) {
    if (this.status == 'freehand') {
      this.update();
    }
  }

  update() {
    console.log('update');
    this.status = 'ras';
    this.help = '';
    const positions = this.currentMeasure.geometry.attributes.position.array;
    const geojson = {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
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
    for (let i = 0; i < this.currentIndex; i++) {
      geojson.features[0].geometry.coordinates[0].push([positions[3 * i] + this.currentMeasure.position.x, positions[3 * i + 1] + this.currentMeasure.position.y]);
    }
    geojson.features[0].geometry.coordinates[0].push([positions[0] + this.currentMeasure.position.x, positions[1] + this.currentMeasure.position.y]);
    const dataStr = JSON.stringify(geojson);
    view.scene.remove(this.currentMeasure);
    // On post le geojson sur l'API
    fetch(`${this.apiUrl}patch?`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: dataStr,
      }).then((res) => {
        if (res.status == 200) {
          // Pour le moment on force le rechargement complet des couches
          this.orthoConfig.opacity = this.orthoLayer.opacity;
          this.graphConfig.opacity = this.graphLayer.opacity;
          menuGlobe.removeLayersGUI(['Ortho', 'Graph']);
          view.removeLayer('Ortho');
          view.removeLayer('Graph');
          this.orthoLayer = new itowns.ColorLayer('Ortho', this.orthoConfig);
          view.addLayer(this.orthoLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          this.graphLayer = new itowns.ColorLayer('Graph', this.graphConfig);
          view.addLayer(this.graphLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
          view.notifyChange();
        } else {
          this.message = "Polygon: out of OPI bounds"
        }
    });
    this.currentMeasure = null;
    this.currentIndex = -1;
  }

  keypress(e) {
    if (e.key === "Escape"){
      console.log('Escape');
      this.status = 'ras';
      this.help = '';
      view.scene.remove(this.currentMeasure);
      this.currentMeasure = null;
      this.currentIndex = -1;
      view.notifyChange();
    }
  }

  click(e) {
    console.log('Click: ', this.pickPoint(e));
    this.message = "";
    if (this.status == 'movePoint') {
      if (this.currentMeasure == null) {
        console.log("Click");
        // on selectionne le cliche
        const pos = this.pickPoint(e);
        const that = this;
        fetch(`${this.apiUrl}graph?x=${pos.x}&y=${pos.y}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }).then((res) => {
          res.json().then((json) => {
            that.cliche = json.cliche;
            if (res.status == 200) {
              that.json = json;
              // that.cliche = json.cliche;
              that.cliche = json.cliche;
              that.color = json.color;
              that.status = 'ras';
              that.help = '';
              // On modifie la couche OPI
              this.opiConfig.opacity = this.opiLayer.opacity;
              menuGlobe.removeLayersGUI(['Opi']);
              view.removeLayer('Opi');
              this.opiConfig.source.url = this.opiConfig.source.url.replace(/LAYER=.*\&FORMAT/, `LAYER=opi&Name=${json.cliche}&FORMAT`);
              this.opiLayer = new itowns.ColorLayer('Opi', this.opiConfig);
              view.addLayer(this.opiLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
              itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
              itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
              itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
              view.notifyChange();
            }
          });
        });
      } else if (e.shiftKey == false) {
        // sinon, on ajoute un point au polygone
        this.currentIndex += 1;
        const positions = this.currentMeasure.geometry.attributes.position.array;
        positions[3 * this.currentIndex] = positions[3 * (this.currentIndex - 1)];
        positions[3 * this.currentIndex + 1] = positions[3 * (this.currentIndex - 1) + 1];
        positions[3 * this.currentIndex + 2] = positions[3 * (this.currentIndex - 1) + 2];
        positions[3 * (this.currentIndex + 1)] = positions[0];
        positions[3 * (this.currentIndex + 1) + 1] = positions[1];
        positions[3 * (this.currentIndex + 1) + 2] = positions[2];
        this.currentMeasure.geometry.setDrawRange(0, this.currentIndex + 2);
        this.currentMeasure.geometry.attributes.position.needsUpdate = true;
        this.currentMeasure.geometry.computeBoundingSphere();
        view.notifyChange(this.currentMeasure);
      }
      // on termine la ployline ou polygon
      else {
        this.update();
      }
    }
  }

  select() {
    this.message = "";
    console.log('"select": En attente de sélection');
    this.currentMeasure = null;
    this.status = 'movePoint';
    this.cliche = null;
    this.currentIndex = 0;
    this.help = 'choisir un cliche';
  }

  polygon() {
    this.message = "";
    console.log('saisir d un polygon');
    this.help = 'saisir un polygone (Maj pour fermer)';
    const MAX_POINTS = 500;
    const geometry = new itowns.THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
    console.log(geometry);
    geometry.setAttribute('position', new itowns.THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 1);
    const material = new itowns.THREE.LineBasicMaterial({
      color: 0xFF0000,
      depthTest: false,
      depthWrite: false,
    });
    this.currentMeasure = new itowns.THREE.Line(geometry, material);
    this.currentMeasure.maxMarkers = -1;
    view.scene.add(this.currentMeasure);
    this.status = 'movePoint';
    this.currentIndex = 0;
  }

  // freehand() {
  //   console.log('saisir d un freehand');
  //   const MAX_POINTS = 10000;
  //   const geometry = new itowns.THREE.BufferGeometry();
  //   const positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
  //   geometry.setAttribute('position', new itowns.THREE.BufferAttribute(positions, 3));
  //   geometry.setDrawRange(0, 1);
  //   const material = new itowns.THREE.LineBasicMaterial({
  //     color: 0xFF0000,
  //     depthTest: false,
  //     depthWrite: false,
  //   });
  //   this.currentMeasure = new itowns.THREE.Line(geometry, material);
  //   this.currentMeasure.maxMarkers = -1;
  //   view.scene.add(this.currentMeasure);
  //   this.status = 'freehand-wait';
  //   this.currentIndex = 0;
  // }

  undo() {
    this.message = "";
    console.log('undo');
    fetch(`${this.apiUrl}patch/undo?`,
      {
        method: 'PUT',
      }).then((res) => {

        console.log(res.status)

        if (res.status == 200) {
          // Pour le moment on force le rechargement complet des couches
          this.orthoConfig.opacity = this.orthoLayer.opacity;
          this.graphConfig.opacity = this.graphLayer.opacity;
          menuGlobe.removeLayersGUI(['Ortho', 'Graph']);
          view.removeLayer('Ortho');
          view.removeLayer('Graph');
          this.orthoLayer = new itowns.ColorLayer('Ortho', this.orthoConfig);
          view.addLayer(this.orthoLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          this.graphLayer = new itowns.ColorLayer('Graph', this.graphConfig);
          view.addLayer(this.graphLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
          view.notifyChange();
        }
        res.text().then((msg) => {
          this.message = msg
        })
    });
  }

  redo() {
    this.message = "";
    console.log('redo');
    fetch(`${this.apiUrl}patch/redo?`,
      {
        method: 'PUT',
      }).then((res) => {
        if (res.status == 200) {
          // Pour le moment on force le rechargement complet des couches
          this.orthoConfig.opacity = this.orthoLayer.opacity;
          this.graphConfig.opacity = this.graphLayer.opacity;
          menuGlobe.removeLayersGUI(['Ortho', 'Graph']);
          view.removeLayer('Ortho');
          view.removeLayer('Graph');
          this.orthoLayer = new itowns.ColorLayer('Ortho', this.orthoConfig);
          view.addLayer(this.orthoLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          this.graphLayer = new itowns.ColorLayer('Graph', this.graphConfig);
          view.addLayer(this.graphLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
          view.notifyChange();
        }
        res.text().then((msg) => {
          this.message = msg
        })
    });
  }

  clear() {
    this.message = "";
    console.log('clear');
    fetch(`${this.apiUrl}patchs/clear?`,
      {
        method: 'PUT',
      }).then((res) => {
        if (res.status == 200) {
          // Pour le moment on force le rechargement complet des couches
          this.orthoConfig.opacity = this.orthoLayer.opacity;
          this.graphConfig.opacity = this.graphLayer.opacity;
          menuGlobe.removeLayersGUI(['Ortho', 'Graph']);
          view.removeLayer('Ortho');
          view.removeLayer('Graph');
          this.orthoLayer = new itowns.ColorLayer('Ortho', this.orthoConfig);
          view.addLayer(this.orthoLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          this.graphLayer = new itowns.ColorLayer('Graph', this.graphConfig);
          view.addLayer(this.graphLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
          itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
          view.notifyChange();
        }
        res.text().then((msg) => {
          this.message = msg
        })
    });
  }
}
