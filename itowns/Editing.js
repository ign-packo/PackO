/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
import * as THREE from 'three';
// alerts
import * as itowns from 'itowns';

const status = {
  RAS: 0,
  SELECT: 1,
  POLYGON: 2,
  ENDING: 3,
  WAITING: 4,
  WRITING: 5,
  ADDREMARK: 6,
};

function getAllCheckboxes(id, className) {
  const allCheckboxes = [];
  let propEls;
  if (className) {
    propEls = Array.from(document.getElementById(id).getElementsByClassName(className));
  } else propEls = Array(document.getElementById(id));
  if (!propEls) return allCheckboxes;
  propEls.forEach((elProp) => {
    const inputEls = Array.from(elProp.getElementsByTagName('input'));
    const cbx = inputEls.find(((el) => (el.type === 'checkbox')));
    if (cbx) allCheckboxes.push(cbx);
  });
  return allCheckboxes;
}

function nextStyleLayers(listId) {
  if ((!listId) || (listId.length === 0)) return;
  let next;
  listId.forEach((id) => {
    const propEl = document.getElementById(id);
    if (propEl !== undefined) {
      const selEls = Array.from(propEl.getElementsByTagName('select'));
      if (selEls !== undefined) {
        selEls.forEach((selStyle) => {
          if (selStyle.options.length > 1) {
            if (next === undefined) next = (selStyle.selectedIndex + 1) % (selStyle.options.length);
            const nStyle = selStyle.options[next];
            nStyle.selected = true;
            selStyle.dispatchEvent(new Event('change'));
          }
        });
      }
    }
  });
}

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

    this.featureIndex = 0;

    this.STATUS = status;

    this.folderVisibleShortcuts = { Ortho: 'm', Opi: 'o', Contour: 'g' };
    this.folderStyleShortcuts = { Ortho: 'i', Opi: 'i' };
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
          properties: { color: this.color, opiName: this.opiName },
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
        body: JSON.stringify(geojson),
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
      if (key !== 'opiName' && this.controllers[key]) this.controllers[key].__li.style.backgroundColor = '';
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
        min: this.viewer.overviews.dataSet.level.min,
        max: this.viewer.overviews.dataSet.level.max,
      },
      style: new itowns.Style({
        stroke: {
          color: 'yellow',
          width: 5,
        },
        point: {
          color: '#66666600',
          radius: 7,
          line: 'yellow',
          width: 5,
        },
      }),
    });

    this.viewer.view.addLayer(newColorLayer);
  }

  // alerts
  // async centerOnAlertFeature(onlyUnchecked = false, step = 0) {
  //   const layerTest = this.viewer.view.getLayerById(this.alertLayerName);
  //   const fc = await layerTest.source.loadData(undefined, layerTest);

  async postValue(idFeature, variable, value) {
    const res = await fetch(`${this.apiUrl}/vector/${idFeature}?${variable}=${value}`,
      {
        method: 'PUT',
      });
    if (res.status === 200) {
      this.viewer.refresh({ [this.alertLayerName]: this.branch.layers[this.alertLayerName] });
      this.alertFC.features[0].geometries[this.featureIndex].properties[variable] = value;
    } else {
      this.viewer.message = 'PB with validate';
    }
  }

  centerOnAlertFeature() {
    this.viewer.message = '';
    const coordcenter = this.alertFC.features[0].geometries[this.featureIndex].extent.clone()
      .applyMatrix4(this.alertFC.matrixWorld).center();

    this.viewer.centerCamera(coordcenter.x, coordcenter.y);

    this.featureSelectedGeom = this.alertFC.features[0].geometries[this.featureIndex];

    if (this.featureSelectedGeom.properties.status === null) {
      this.postValue(this.featureSelectedGeom.properties.id, 'status', false);
      // this.featureSelectedGeom.properties.status = false;
      this.nbChecked += 1;
      this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
    }

    // this.id = this.featureSelectedGeom.properties.id;
    this.id = this.featureIndex;
    this.controllers.id.updateDisplay();
    this.validated = this.featureSelectedGeom.properties.status;
    this.controllers.validated.updateDisplay();
    // this.viewer.remark = this.featureSelectedGeom.properties.comment;
    this.comment = this.featureSelectedGeom.properties.comment;

    this.highlightSelectedFeature(this.alertFC,
      this.featureSelectedGeom,
      this.alertFC.features[0].type);
  }

  unchecked() {
    if (this.featureSelectedGeom.properties.status === true) {
      this.viewer.message = 'alerte déjà validée';
    } else if (this.featureSelectedGeom.properties.status === false) {
      this.postValue(this.featureSelectedGeom.properties.id, 'status', null);
      this.featureSelectedGeom.properties.status = null;
      this.nbChecked -= 1;
      this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
    }
  }

  keydown(e) {
    if (this.currentStatus === status.WAITING) return;
    console.log(e.key, ' down');
    if (this.currentStatus === status.RAS) {
      // KEYBOARD SHORTCUTS
      // undo CTRL+z
      if (e.ctrlKey && (e.key === 'z')) this.undo();
      // redo CTRL+y
      if (e.ctrlKey && (e.key === 'y')) this.redo();
      // select Opi
      if (e.key === 's') this.select();
      // start polygon
      if (e.key === 'p') this.polygon();
      // change visibility on ColorLayers
      Object.keys(this.folderVisibleShortcuts).forEach((key) => {
        if (e.key === this.folderVisibleShortcuts[key]) {
          console.log(`Change ${key} visibility`);
          getAllCheckboxes(key).forEach((c) => (c.click()));
        }
      });
      // change visibility on ExtraLayers
      if (e.key === 'v') {
        console.log('Change Extra Layers visibility');
        getAllCheckboxes('extraLayers', 'visibcbx').forEach((c) => (c.click()));
      }
      // change alert validation status
      if ((this.alertLayerName !== undefined) && (e.key === 'c')) {
        console.log('Change alert validation status');
        getAllCheckboxes('validatedAlert').forEach((c) => (c.click()));
      }
      // move camera proportional to one screen
      if (this.alertLayerName === undefined) {
        const camera = this.view.camera.camera3D;
        const widthScreen = (camera.right - camera.left) / camera.zoom;
        const heightScreen = (camera.top - camera.bottom) / camera.zoom;
        const prop = 0.9;
        if (e.key === 'ArrowLeft') {
          console.log('Move view left');
          camera.position.x -= widthScreen * prop;
        }
        if (e.key === 'ArrowRight') {
          console.log('Move view right');
          camera.position.x += widthScreen * prop;
        }
        if (e.key === 'ArrowUp') {
          console.log('Move view up');
          camera.position.y += heightScreen * prop;
        }
        if (e.key === 'ArrowDown') {
          console.log('Move view down');
          camera.position.y -= heightScreen * prop;
        }
        this.viewer.centerCamera(camera.position.x, camera.position.y);
      }
      // add remark
      if (e.key === 'a') this.addRemark();
      // delete remark
      if (this.alertLayerName === 'Remarques' && this.alertFC.features.length > 0 && e.key === 'd') this.delRemark();
      // Change Ortho and Opi to next style RVB/IRC/IR
      if (e.key === 'i') nextStyleLayers(['Ortho_chgStyle', 'Opi_chgStyle']);

      // L'utilisateur demande à déselectionner l'OPI
      if (this.validClicheSelected && (e.key === 'Escape')) {
        this.validClicheSelected = false;
        this.opiName = 'none';
        this.controllers.opiName.__li.style.backgroundColor = '';
        this.view.getLayerById('Opi').visible = false;
        this.view.notifyChange(this.view.getLayerById('Opi'), true);
      } else if (this.alertLayerName && this.alertFC.features.length > 0) {
        const { geometries } = this.alertFC.features[0];
        if (e.key === 'ArrowLeft') {
          this.featureIndex -= 1;
          if (this.featureIndex === -1) {
            this.featureIndex = geometries.length - 1;
          }
          this.centerOnAlertFeature();
        } else if (e.key === 'ArrowRight') {
          this.featureIndex += 1;
          if (this.featureIndex === geometries.length) this.featureIndex = 0;
          this.centerOnAlertFeature();
        } else if (e.key === 'ArrowDown') {
          let { featureIndex } = this;
          featureIndex -= 1;
          if (featureIndex === -1) featureIndex = geometries.length - 1;
          while (geometries[featureIndex].properties.status !== null
            && featureIndex !== this.featureIndex) {
            featureIndex -= 1;
            if (featureIndex === -1) featureIndex = geometries.length - 1;
          }
          this.featureIndex = featureIndex;
          this.centerOnAlertFeature();
        } else if (e.key === 'ArrowUp') {
          let { featureIndex } = this;
          featureIndex += 1;
          if (featureIndex === geometries.length) featureIndex = 0;
          while (geometries[featureIndex].properties.status !== null
            && featureIndex !== this.featureIndex) {
            featureIndex += 1;
            if (featureIndex === geometries.length) featureIndex = 0;
          }
          this.featureIndex = featureIndex;
          this.centerOnAlertFeature();
        }
      }
      return;
    }
    if (e.key === 'Escape') {
      this.view.controls.setCursor('default', 'auto');
      this.cancelcurrentPolygon();
    } else if (e.key === 'Shift') {
      if (this.currentStatus === status.POLYGON) {
        if (this.currentPolygon) {
          if (this.branch.active.name === 'orig') {
            this.viewer.message = 'Changer de branche pour continuer';
          } else if (this.viewer.dezoom > this.viewer.maxGraphDezoom) {
            this.viewer.message = 'Zoom non valide pour continuer';
          } else if (this.nbVertices < 3) {
            this.viewer.message = 'Pas assez de points';
          } else {
            this.currentStatus = status.ENDING;
            this.viewer.message = 'Cliquer pour valider la saisie';
            this.view.controls.setCursor('default', 'progress');

            const vertices = this.currentPolygon.geometry.attributes.position;
            vertices.copyAt(this.nbVertices, vertices, 0);
            vertices.needsUpdate = true;

            this.currentPolygon.geometry.setDrawRange(0, this.nbVertices + 1);
            this.currentPolygon.geometry.computeBoundingSphere();
            this.view.notifyChange(this.currentPolygon);
          }
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
            this.opiName = json.opiName;
            this.cancelcurrentPolygon();
            if (res.status === 200) {
              this.color = json.color;
              this.controllers.opiName.__li.style.backgroundColor = `rgb(${this.color[0]},${this.color[1]},${this.color[2]})`;
              // On modifie la couche OPI
              this.view.getLayerById('Opi').source.url = this.view.getLayerById('Opi').source.url.replace(/LAYER=.*&FORMAT/, `LAYER=opi&Name=${this.opiName}&FORMAT`);
              this.view.getLayerById('Opi').visible = true;
              this.viewer.refresh(this.branch.layers);
              this.validClicheSelected = true;
            }
            if (res.status === 201) {
              console.log('out of bounds');
              this.opiName = 'none';
              this.view.getLayerById('Opi').visible = false;
              this.validClicheSelected = false;
              this.controllers.opiName.__li.style.backgroundColor = '';
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
        if (this.branch.active.name === 'orig') {
          this.viewer.message = 'Changer de branche pour continuer';
        } else if (this.viewer.dezoom > this.viewer.maxGraphDezoom) {
          this.viewer.message = 'Zoom non valide pour continuer';
        } else {
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
        }
        break;
      }
      case status.ADDREMARK: {
        this.viewer.message = 'Add new point';

        const remark = window.prompt('comment:', '');

        if (remark !== null) {
          this.currentStatus = status.WAITING;
          this.view.controls.setCursor('default', 'wait');
          this.viewer.message = 'calcul en cours';

          // On post la geometrie sur l'API
          const remarksLayerId = this.branch.vectorList.filter((elem) => elem.name === 'Remarques')[0].id;
          fetch(`${this.apiUrl}/${remarksLayerId}/feature?x=${mousePosition.x}&y=${mousePosition.y}&comment=${encodeURIComponent(remark)}`,
            {
              method: 'PUT',
            }).then(async (res) => {
            if (res.status === 200) {
              this.viewer.refresh({ Remarques: this.branch.layers.Remarques });
              this.view.controls.setCursor('default', 'auto');
              this.currentStatus = status.RAS;
              this.viewer.message = '';
              this.controllers.addRemark.__li.style.backgroundColor = '';

              this.view.dispatchEvent({
                type: 'remark-added',
              });
            } else {
              this.viewer.message = 'remark: error during save';
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
    this.controllers.select.__li.style.backgroundColor = '#BB0000';
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
    this.controllers.polygon.__li.style.backgroundColor = '#BB0000';
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
    if (this.viewer.dezoom > this.viewer.maxGraphDezoom) {
      this.viewer.message = 'Zoom non valide pour annuler';
      return;
    }
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
    if (this.viewer.dezoom > this.viewer.maxGraphDezoom) {
      this.viewer.message = 'Zoom non valide pour refaire';
      return;
    }
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

  // remarques
  addRemark() {
    if (this.currentStatus !== status.RAS) return;

    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.ADDREMARK;
    this.controllers.addRemark.__li.style.backgroundColor = '#BB0000';

    console.log("saisie d'une remarque");
    this.viewer.message = "saisie d'une remarque";
  }

  delRemark() {
    if (this.currentStatus !== status.RAS) return;

    console.log("suppression d'une remarque");

    this.currentStatus = status.WAITING;
    this.view.controls.setCursor('default', 'wait');
    this.viewer.message = 'calcul en cours';

    // On post la geometrie sur l'API
    const remarksLayerId = this.branch.vectorList.filter((elem) => elem.name === 'Remarques')[0].id;
    fetch(`${this.apiUrl}/${remarksLayerId}/feature?id=${this.featureSelectedGeom.properties.id}`,
      {
        method: 'DELETE',
      }).then(async (res) => {
      if (res.status === 200) {
        this.viewer.refresh({ Remarques: this.branch.layers.Remarques });
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;
        this.viewer.message = '';

        this.view.dispatchEvent({
          type: 'remark-deleted',
        });
      } else {
        this.viewer.message = 'remark: error during delete';
      }
    });
  }
}

export default Editing;
