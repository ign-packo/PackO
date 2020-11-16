const status = {
  RAS: 0,
  EN_COURS: 1,
  MOVE_POINT: 2,
  ENDING: 3,
}


class Saisie {
  constructor(layer, apiUrl) {
    this.layer = layer
    this.apiUrl = apiUrl;

    this.validClicheSelected = false;
    this.currentStatus = status.RAS;
    this.currentMeasure = null;
    this.currentIndex = -1;
    this.lastPos = null;
  }

  refreshView(layers){

    // Pour le moment on force le rechargement complet des couches
    layers.forEach((id) => {
      menuGlobe.removeLayersGUI([this.layer[id].colorLayer.id]);
      view.removeLayer(this.layer[id].colorLayer.id);
      this.layer[id].config.opacity = this.layer[id].colorLayer.opacity;
      this.layer[id].colorLayer = new itowns.ColorLayer(this.layer[id].name, this.layer[id].config);
      view.addLayer(this.layer[id].colorLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));
    })

    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Ortho', 0);
    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Opi', 1);
    itowns.ColorLayersOrdering.moveLayerToIndex(view, 'Graph', 2);
    view.notifyChange();
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
    this.lastPos = pos;
    if (pos) {
      // console.log('position :', pos);
      this.coord = `${pos.x.toFixed(2)} ${pos.y.toFixed(2)}`;
      if (this.currentMeasure == null) return;
      if (this.currentStatus == status.MOVE_POINT) {
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
    }
  }

  update() {
    if (!this.currentMeasure) {
      console.log('pas de polygone');
      return;
    }
    if (this.currentIndex<2){
      this.message = 'Pas assez de points';
      return;
    }
    console.log('update');
    this.currentStatus = status.RAS;
    this.message = '';
    document.getElementById("viewerDiv").style.cursor="auto";
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
    for (let i = 0; i <= (this.currentIndex+1); i++) {
      geojson.features[0].geometry.coordinates[0].push([positions[3 * i] + this.currentMeasure.position.x, positions[3 * i + 1] + this.currentMeasure.position.y]);
    }
    const dataStr = JSON.stringify(geojson);
    view.scene.remove(this.currentMeasure);
    this.currentStatus = status.EN_COURS;
    document.getElementById("viewerDiv").style.cursor="wait";
    this.message = "calcul en cours";
    // On post le geojson sur l'API
    fetch(`${this.apiUrl}/patch?`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: dataStr,
      }).then((res) => {
        this.cancelCurrentMeasure();
        if (res.status == 200) {
          this.refreshView(['ortho','graph'])
        } else {
          this.message = "polygon: out of OPI's bounds"
        }
    });    
  }

  cancelCurrentMeasure() {
    if (this.currentMeasure){
      // on annule la saisie en cours
      view.scene.remove(this.currentMeasure);
      this.currentMeasure = null;
      view.notifyChange();
    }
    document.getElementById("viewerDiv").style.cursor="auto";
    this.currentStatus = status.RAS;
    this.message = '';
    for (var key in this.controllers){
      if (key != 'cliche')
        this.controllers[key].__li.style.backgroundColor = '';
    }
  }

  keydown(e) {
    if (this.currentStatus === status.EN_COURS) return;
    console.log(e.key);
    if (e.key === "Escape"){
      document.getElementById("viewerDiv").style.cursor="auto";
      this.cancelCurrentMeasure();
    }
    else if (e.key == "Shift"){
      if (this.currentStatus === status.MOVE_POINT){
        if (this.currentMeasure && (this.currentIndex > 1)){
          this.currentStatus = status.ENDING;
          // on supprime le dernier point du polygone
          const positions = this.currentMeasure.geometry.attributes.position.array;
          this.currentIndex -= 1;
          positions[3 * (this.currentIndex + 1)] = positions[0];
          positions[3 * (this.currentIndex + 1) + 1] = positions[1];
          positions[3 * (this.currentIndex + 1) + 2] = positions[2];
          this.currentMeasure.geometry.setDrawRange(0, this.currentIndex + 2);
          this.currentMeasure.geometry.attributes.position.needsUpdate = true;
          this.currentMeasure.geometry.computeBoundingSphere();
          view.notifyChange(this.currentMeasure);
        }
      }
    }
  }

  keyup(e) {
    if (this.currentStatus === status.EN_COURS) return;
    console.log(e.key);
    if (e.key == "Shift"){
      if (this.currentStatus === status.ENDING){
        if (this.currentMeasure && (this.currentIndex > 0)){
          // on ferme le polygone sur le point en cours
          const positions = this.currentMeasure.geometry.attributes.position.array;
          this.currentIndex += 1;
          positions[3 * this.currentIndex] = this.lastPos.x - this.currentMeasure.position.x;
          positions[3 * this.currentIndex + 1] = this.lastPos.y - this.currentMeasure.position.y;
          positions[3 * this.currentIndex + 2] = this.lastPos.z - this.currentMeasure.position.z;
          positions[3 * (this.currentIndex + 1)] = positions[0];
          positions[3 * (this.currentIndex + 1) + 1] = positions[1];
          positions[3 * (this.currentIndex + 1) + 2] = positions[2];
          this.currentMeasure.geometry.setDrawRange(0, this.currentIndex + 2);
          this.currentMeasure.geometry.attributes.position.needsUpdate = true;
          this.currentMeasure.geometry.computeBoundingSphere();
          view.notifyChange(this.currentMeasure);
        }
        this.currentStatus = status.MOVE_POINT;
      }
    }
  }

  click(e) {
    if (this.currentStatus === status.EN_COURS) return;
    console.log('Click: ', this.pickPoint(e), this.currentStatus);
    this.message = "";
    if (this.currentStatus == status.MOVE_POINT) {
      if (this.currentMeasure == null) {
        console.log("get OPI");
        // on selectionne le cliche
        const pos = this.pickPoint(e);
        const that = this;
        document.getElementById("viewerDiv").style.cursor="auto";
        fetch(`${this.apiUrl}/graph?x=${pos.x}&y=${pos.y}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }).then((res) => {
          res.json().then((json) => {
            this.cliche = json.cliche;
            this.cancelCurrentMeasure();
            if (res.status == 200) {
              that.json = json;
              that.color = json.color;
              that.controllers['cliche'].__li.style.backgroundColor = `rgb(${that.color[0]},${that.color[1]},${that.color[2]})`;
              
              // On modifie la couche OPI
              this.layer['opi'].config.source.url = this.layer['opi'].config.source.url.replace(/LAYER=.*\&FORMAT/, `LAYER=opi&Name=${json.cliche}&FORMAT`);
              this.refreshView(['opi'])

              that.validClicheSelected = true;
            }
            if (res.status == 201) {
              console.log("out of bounds")
              this.layer['opi'].colorLayer.visible = false;
              this.validClicheSelected = false;
              this.controllers['cliche'].__li.style.backgroundColor = '';
              view.notifyChange(this.layer['opi'].colorLayer,true);
            }
          });
        });
      } else {
        this.message = 'Maj pour terminer';
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
    }
    else if (this.currentStatus == status.ENDING){
      // on termine la ployline ou polygon
      this.update();
    }
  }

  select() {
    if (this.currentStatus === status.EN_COURS) return;
    this.cancelCurrentMeasure();
    this.controllers['select'].__li.style.backgroundColor = '#FF000055';
    document.getElementById("viewerDiv").style.cursor="crosshair";
    console.log('"select": En attente de sélection');
    this.currentStatus = status.MOVE_POINT;
    this.message = 'choisir un cliche';
  }

  polygon() {
    if (this.currentStatus === status.EN_COURS) return;
    if (!this.validClicheSelected){
      this.message = (this.currentStatus == status.MOVE_POINT) ? 'choisir un cliche valide' : 'cliche non valide';
      return;
    }
    if (this.currentMeasure){
      this.message = 'saisie déjà en cours';
      // saisie deja en cours
      return;
    }
    this.controllers['select'].__li.style.backgroundColor = '';
    this.controllers['polygon'].__li.style.backgroundColor = '#FF000055';
    document.getElementById("viewerDiv").style.cursor="crosshair";
    console.log("saisie d'un polygon");
    this.message = "saisie d'un polygone";
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
    // Pour eviter que l'object disparaisse dans certains cas
    this.currentMeasure.renderOrder = 1;
    console.log(this.currentMeasure);
    this.currentMeasure.maxMarkers = -1;
    view.scene.add(this.currentMeasure);
    view.notifyChange(this.currentMeasure);
    this.currentStatus = status.MOVE_POINT;
    this.currentIndex = 0;
  }

  undo() {
    if (this.currentStatus === status.EN_COURS) return;
    this.cancelCurrentMeasure();
    this.message = "";
    console.log('undo');
    this.currentStatus = status.EN_COURS;
    document.getElementById("viewerDiv").style.cursor="wait";
    this.message = "calcul en cours";
    fetch(`${this.apiUrl}/patch/undo?`,
      {
        method: 'PUT',
      }).then((res) => {
        this.cancelCurrentMeasure();
        if (res.status == 200) {
          this.refreshView(['ortho','graph'])
        }
        res.text().then((msg) => {
          this.message = msg
        })
    });
  }

  redo() {
    if (this.currentStatus === status.EN_COURS) return;
    this.cancelCurrentMeasure();
    this.message = "";
    console.log('redo');
    this.currentStatus = status.EN_COURS;
    document.getElementById("viewerDiv").style.cursor="wait";
    this.message = "calcul en cours";
    fetch(`${this.apiUrl}/patch/redo?`,
      {
        method: 'PUT',
      }).then((res) => {
        this.cancelCurrentMeasure();
        if (res.status == 200) {
          this.refreshView(['ortho','graph'])
        }
        res.text().then((msg) => {
          this.message = msg
        })
    });
  }

  clear() {
    if (this.currentStatus === status.EN_COURS) return;
    let ok = confirm("Voulez-vous effacer toutes les modifications?");
    if (!ok) return;
    console.log('clear');
    this.currentStatus = status.EN_COURS;
    document.getElementById("viewerDiv").style.cursor="wait";
    this.message = "calcul en cours";

    fetch(`${this.apiUrl}/patchs/clear?`,
      {
        method: 'PUT',
      }).then((res) => {
        this.cancelCurrentMeasure();
        if (res.status == 200) {
          this.refreshView(['ortho','graph'])
        }
        res.text().then((msg) => {
          this.message = msg
        })
    });
  }
}
