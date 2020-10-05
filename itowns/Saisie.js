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
    if (this.currentMeasure == null) return;
    if (this.status == 'movePoint') {
      const pos = this.pickPoint(e);
      if (pos) {
        var positions = this.currentMeasure.geometry.attributes.position.array;
        positions[3 * this.currentIndex] = pos.x;
        positions[3 * this.currentIndex + 1] = pos.y;
        positions[3 * this.currentIndex + 2] = pos.z;
        this.currentMeasure.geometry.attributes.position.needsUpdate = true;
        this.currentMeasure.geometry.computeBoundingSphere();
        view.notifyChange(this.currentMeasure);
      }
    } else if ((this.status == 'freehand') && (e.buttons == 2)) {
      const pos = this.pickPoint(e);
      if (pos) {
        var positions = this.currentMeasure.geometry.attributes.position.array;
        positions[3 * this.currentIndex] = pos.x;
        positions[3 * this.currentIndex + 1] = pos.y;
        positions[3 * this.currentIndex + 2] = pos.z;
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
      geojson.features[0].geometry.coordinates[0].push([positions[3 * i], positions[3 * i + 1]]);
    }
    geojson.features[0].geometry.coordinates[0].push([positions[0], positions[1]]);
    const dataStr = JSON.stringify(geojson);
    view.scene.remove(this.currentMeasure);
    // On post le geojson sur l'API
    fetch(`${this.apiUrl}graph/patch?`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: dataStr,
      }).then((res) => {
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
    });
    this.currentMeasure = null;
    this.currentIndex = -1;
  }

  click(e) {
    console.log('click: ', this.pickPoint(e));
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
            if (json) {
              console.log(json);
              that.json = json;
              that.cliche = json.cliche;
              that.status = 'ras';
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
    console.log('choisir le cliche');
    this.currentMeasure = null;
    this.status = 'movePoint';
    this.cliche = null;
    this.currentIndex = 0;
  }

  polygon() {
    console.log('saisir d un polygon');
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

  freehand() {
    console.log('saisir d un freehand');
    const MAX_POINTS = 10000;
    const geometry = new itowns.THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
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
    this.status = 'freehand-wait';
    this.currentIndex = 0;
  }
}
