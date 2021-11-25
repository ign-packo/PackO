/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint no-underscore-dangle: ["error", { "allow": [__li] }] */
import * as THREE from 'three';
// alerts
import * as itowns from 'itowns';

const status = {
  RAS: 0,
  SELECT: 1,
  POLYGON: 2,
  ENDING: 3,
  WAITING: 4,
  COMMENT: 5,
  POINT: 6,
};

class Editing {
  constructor(branch, apiUrl) {
    this.branch = branch;
    this.viewer = branch.viewer;
    this.view = this.viewer.view;
    this.apiUrl = apiUrl;

    this.validClicheSelected = false;
    this.currentStatus = status.RAS;
    this.currentPolygon = null;
    this.nbVertices = 0;
    this.lastPos = null;
    this.mousePosition = null;

    this.STATUS = status;
    this.alertLayerName = '';
    this.annotationLayer = {
      name: '',
      id: undefined,
    };
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
    this.viewer.message = '';
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
    this.viewer.message = 'calcul en cours';
    // On post le geojson sur l'API
    fetch(`${this.apiUrl}/${this.branch.active.id}/patch?`,
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
        this.viewer.refresh(this.branch.layers);
      } else {
        res.json().then((json) => {
          this.viewer.message = json.msg;
        });
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
    this.viewer.message = '';

    Object.keys(this.controllers).forEach((key) => {
      if (key !== 'cliche' && this.controllers[key]) this.controllers[key].__li.style.backgroundColor = '';
    });
  }

  // Highlighing selected features
  highlightSelectedFeature(featureCollec, featureGeometry, type) {
    this.featureSelectedGeom = featureGeometry;
    this.type = type;
    // console.log(this.featureSelectedGeom);
    const layerFeatureSelected = this.viewer.view.getLayerById('selectedFeature');
    if (layerFeatureSelected) {
      this.viewer.view.removeLayer('selectedFeature');
    }
    const layerTest = this.viewer.view.getLayerById(this.alertLayerName);
    // const featureCollec = await layerTest.source.loadData(undefined, layerTest);
    const newFeatureCollec = new itowns.FeatureCollection(layerTest);

    // const featureGeometry = featureTemp.geometry;
    // const featureGeometry = fc.features[0].geometries[this.featureIndex];

    const feature = featureCollec.requestFeatureByType(type);
    const newFeature = newFeatureCollec.requestFeatureByType(type);
    const newFeatureGeometry = newFeature.bindNewGeometry();

    const coord = new itowns.Coordinates(newFeatureCollec.crs, 0, 0, 0);

    const vector = new THREE.Vector2();
    const vector3 = new THREE.Vector3();
    const { count, offset } = featureGeometry.indices[0];

    newFeatureGeometry.startSubGeometry(count, newFeature);
    const { vertices } = feature;
    for (let v = offset * 2; v < (offset + count) * 2; v += 2) {
      vector.fromArray(vertices, v);
      vector3.copy(vector).setZ(0).applyMatrix4(featureCollec.matrixWorld);
      coord.x = vector3.x;
      coord.y = vector3.y;
      newFeatureGeometry.pushCoordinates(coord, newFeature);
    }

    newFeatureGeometry.updateExtent();

    const newColorLayer = new itowns.ColorLayer('selectedFeature', {
      // Use a FileSource to load a single file once
      source: new itowns.FileSource({
        features: newFeatureCollec,
      }),
      transparent: true,
      opacity: 0.7,
      zoom: {
        min: this.viewer.zoomMin,
        max: this.viewer.overviews.dataSet.level.max,
      },
      style: new itowns.Style({
        // fill: {
        //   color: '#bbffbb',
        // },
        stroke: {
          color: 'yellow',
          width: 5,
        },
        point: {
          color: '#66666600',
          radius: 5,
          line: 'yellow',
          width: 5,
        },
      }),
    });

    this.viewer.view.addLayer(newColorLayer);
    this.checked = this.featureSelectedGeom.properties.status;
    this.controllers.checked.updateDisplay();
    this.viewer.comment = this.featureSelectedGeom.properties.comment;
    this.controllers.comment.updateDisplay();
  }

  // alerts
  // async centerOnAlertFeature(onlyUnchecked = false, step = 0) {
  //   const layerTest = this.viewer.view.getLayerById(this.alertLayerName);
  //   const fc = await layerTest.source.loadData(undefined, layerTest);

  centerOnAlertFeature() {
    // const fc = this.alertFC;

    // refresh datGUI.nbChecked
    // this.nbValidated = fc.features[0].geometries.filter(
    //   (elem) => elem.properties.status === true,
    // ).length;
    // this.nbTotal = fc.features[0].geometries.length;
    // this.nbChecked = `${this.nbValidated}/${this.nbTotal}`;

    // get index of feature selected
    // if (this.featureIndex === this.alertFC.features[0].geometries.length) this.featureIndex = 0;
    // if (this.featureIndex === -1) {
    //   this.featureIndex = this.alertFC.features[0].geometries.length - 1;
    // }

    // if (onlyUnchecked) {
    //   if (fc.features[0].geometries[this.featureIndex].properties.status === true) {
    //     this.featureIndex += step;
    //     if (this.featureIndex === fc.features[0].geometries.length) this.featureIndex = 0;
    //     if (this.featureIndex === -1) this.featureIndex = fc.features[0].geometries.length - 1;
    //   }
    // }

    // Center on Feature
    const coordcenter = this.alertFC.features[0].geometries[this.featureIndex].extent.clone()
      .applyMatrix4(this.alertFC.matrixWorld).center();

    this.viewer.centerCamera(coordcenter.x, coordcenter.y);

    this.highlightSelectedFeature(this.alertFC,
      this.alertFC.features[0].geometries[this.featureIndex],
      this.alertFC.features[0].type);
  }

  keydown(e) {
    if (this.currentStatus === status.WAITING) return;
    console.log(e.key, ' down');
    if (this.currentStatus === status.RAS) {
      // L'utilisateur demande à déselectionner l'OPI
      if (this.validClicheSelected && (e.key === 'Escape')) {
        this.validClicheSelected = false;
        this.cliche = 'none';
        this.controllers.cliche.__li.style.backgroundColor = '';
        this.view.getLayerById('Opi').visible = false;
        this.view.notifyChange(this.view.getLayerById('Opi'), true);
      } else if (this.alertLayerName && this.alertFC.features.length > 0) {
        if (e.key === 'ArrowLeft') {
          this.featureIndex -= 1;
          if (this.featureIndex === -1) {
            this.featureIndex = this.alertFC.features[0].geometries.length - 1;
          }
          this.centerOnAlertFeature();
        } else if (e.key === 'ArrowRight') {
          this.featureIndex += 1;
          if (this.featureIndex === this.alertFC.features[0].geometries.length) {
            this.featureIndex = 0;
          }
          this.centerOnAlertFeature();
        } else if (e.key === 'ArrowDown') {
          let { featureIndex } = this;
          featureIndex -= 1;
          if (featureIndex === -1) featureIndex = this.alertFC.features[0].geometries.length - 1;
          while (this.alertFC.features[0].geometries[featureIndex].properties.status === true
          && featureIndex !== this.featureIndex) {
            featureIndex -= 1;
            if (featureIndex === -1) featureIndex = this.alertFC.features[0].geometries.length - 1;
          }
          this.featureIndex = featureIndex;
          this.centerOnAlertFeature();
        } else if (e.key === 'ArrowUp') {
          let { featureIndex } = this;
          featureIndex += 1;
          if (featureIndex === this.alertFC.features[0].geometries.length) featureIndex = 0;
          while (this.alertFC.features[0].geometries[featureIndex].properties.status === true
          && featureIndex !== this.featureIndex) {
            featureIndex += 1;
            if (featureIndex === this.alertFC.features[0].geometries.length) featureIndex = 0;
          }
          this.featureIndex = featureIndex;
          this.centerOnAlertFeature(true, 1);
        }
      }
      return;
    }
    if (e.key === 'Escape') {
      this.view.controls.setCursor('default', 'auto');
      this.cancelcurrentPolygon();
    } else if (e.key === 'Shift') {
      if (this.currentStatus === status.POLYGON) {
        if (this.currentPolygon && (this.nbVertices > 2)) {
          if (this.branch.active.name !== 'orig') {
            this.currentStatus = status.ENDING;
            this.viewer.message = 'Cliquer pour valider la saisie';
          } else {
            this.viewer.message = 'Changer de branche pour continuer';
          }

          this.view.controls.setCursor('default', 'progress');

          const vertices = this.currentPolygon.geometry.attributes.position;
          vertices.copyAt(this.nbVertices, vertices, 0);
          vertices.needsUpdate = true;

          this.currentPolygon.geometry.setDrawRange(0, this.nbVertices + 1);
          this.currentPolygon.geometry.computeBoundingSphere();
          this.view.notifyChange(this.currentPolygon);
        } else {
          this.viewer.message = 'Pas assez de points';
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
        this.viewer.message = 'Maj pour terminer';
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
    this.viewer.message = '';

    switch (this.currentStatus) {
      case status.SELECT: {
        console.log('get OPI');
        // on selectionne le cliche
        const pos = this.pickPoint(e);
        this.view.controls.setCursor('default', 'auto');
        fetch(`${this.apiUrl}/${this.branch.active.id}/graph?x=${pos.x}&y=${pos.y}`,
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
              this.view.getLayerById('Opi').source.url = this.view.getLayerById('Opi').source.url.replace(/LAYER=.*&FORMAT/, `LAYER=opi&Name=${json.cliche}&FORMAT`);
              this.view.getLayerById('Opi').visible = true;
              this.viewer.refresh(this.branch.layers);
              this.validClicheSelected = true;
            }
            if (res.status === 201) {
              console.log('out of bounds');
              this.cliche = 'none';
              this.view.getLayerById('Opi').visible = false;
              this.validClicheSelected = false;
              this.controllers.cliche.__li.style.backgroundColor = '';
              this.view.notifyChange(this.view.getLayerById('Opi'), true);
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
        if (this.branch.active.name !== 'orig') {
          // Cas ou l'on est en train de saisir un polygon : on ajoute un point
          this.viewer.message = 'Maj pour terminer';

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
        } else {
          this.viewer.message = 'Changer de branche pour continuer';
        }
        break;
      }
      case status.POINT: {
        this.viewer.message = 'Add new point';

        const annotationComment = window.prompt('comment:', '');

        if (annotationComment !== null) {
          this.currentStatus = status.WAITING;
          this.view.controls.setCursor('default', 'wait');
          this.viewer.message = 'calcul en cours';

          // On post la geometrie sur l'API
          fetch(`${this.apiUrl}/${this.annotationLayer.id}/feature?x=${mousePosition.x}&y=${mousePosition.y}&comment=${annotationComment}`,
            {
              method: 'PUT',
            }).then(async (res) => {
            if (res.status === 200) {
              // const layerAlert = this.viewer.view.getLayerById('azer');
              // console.log(layerAlert.source._featuresCaches[layerAlert.crs])
              this.viewer.refresh(this.branch.layers);
              // const layerAlert2 = this.viewer.view.getLayerById('azer');
              // console.log(layerAlert2.source._featuresCaches[layerAlert2.crs])

              this.view.controls.setCursor('default', 'auto');
              this.currentStatus = status.RAS;
              this.viewer.message = '';
              this.controllers.addPoint.__li.style.backgroundColor = '';

              this.view.dispatchEvent({
                type: 'annotation-added',
              });
            } else {
              this.viewer.message = 'annotation: error during save';
            }
          });
        }
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
    this.controllers.select.__li.style.backgroundColor = '#BB0000FF';
    this.view.controls.setCursor('default', 'crosshair');
    console.log('"select": En attente de sélection');
    this.currentStatus = status.SELECT;
    this.viewer.message = 'choisir un cliche';
  }

  polygon() {
    if (this.currentStatus === status.WAITING) return;
    if (!this.validClicheSelected) {
      this.viewer.message = (this.currentStatus === status.MOVE_POINT) ? 'choisir un cliche valide' : 'cliche non valide';
      return;
    }
    if (this.currentPolygon) {
      this.viewer.message = 'saisie déjà en cours';
      // saisie deja en cours
      return;
    }
    this.controllers.select.__li.style.backgroundColor = '';
    this.controllers.polygon.__li.style.backgroundColor = '#BB0000FF';
    this.view.controls.setCursor('default', 'crosshair');
    console.log("saisie d'un polygon");
    this.viewer.message = "saisie d'un polygon";
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
    this.viewer.message = '';
    console.log('undo');
    this.currentStatus = status.WAITING;
    this.view.controls.setCursor('default', 'wait');
    this.viewer.message = 'calcul en cours';
    fetch(`${this.apiUrl}/${this.branch.active.id}/patch/undo?`,
      {
        method: 'PUT',
      }).then((res) => {
      this.cancelcurrentPolygon();
      if (res.status === 200) {
        this.viewer.refresh(this.branch.layers);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
      });
    });
  }

  redo() {
    if (this.currentStatus === status.WAITING) return;
    this.cancelcurrentPolygon();
    this.viewer.message = '';
    console.log('redo');
    this.currentStatus = status.WAITING;
    this.view.controls.setCursor('default', 'wait');
    this.viewer.message = 'calcul en cours';
    fetch(`${this.apiUrl}/${this.branch.active.id}/patch/redo?`,
      {
        method: 'PUT',
      }).then((res) => {
      this.cancelcurrentPolygon();
      if (res.status === 200) {
        this.viewer.refresh(this.branch.layers);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
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
    this.viewer.message = 'calcul en cours';

    fetch(`${this.apiUrl}/${this.branch.active.id}/patches/clear?`,
      {
        method: 'PUT',
      }).then((res) => {
      this.cancelcurrentPolygon();
      if (res.status === 200) {
        this.viewer.refresh(this.branch.layers);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
      });
    });
  }

  createAnnotation() {
    const annotationLayerName = window.prompt('Choose an annotation layer name:', '');

    fetch(`${this.apiUrl}/${this.branch.active.id}/annotation?name=${annotationLayerName}&crs=${this.viewer.crs}`,
      {
        method: 'PUT',
      }).then((res) => {
      if (res.status === 200) {
        console.log(`annotation layer '${annotationLayerName}' created`);
        // this.vectorList = await itowns.Fetcher.json(`${this.apiUrl}/${this.active.id}/vectors`);

        itowns.Fetcher.json(`${this.apiUrl}/${this.branch.active.id}/vectors`)
          .then((res2) => {
            this.branch.vectorList = res2;
            this.annotationLayer = {
              name: annotationLayerName,
              id: this.branch.vectorList.filter((elem) => elem.name === annotationLayerName)[0].id,
            };
            this.branch.setLayers();
            this.viewer.refresh(this.branch.layers);
            this.view.dispatchEvent({
              type: 'annotationLayer-created',
              name: annotationLayerName,
            });
          });
      }
    });
  }

  addPoint() {
    if (this.currentStatus !== status.RAS) return;

    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.POINT;
    this.controllers.addPoint.__li.style.backgroundColor = '#BB0000FF';

    console.log("saisie d'un point");
    this.viewer.message = "saisie d'un point";
  }
}

export default Editing;
