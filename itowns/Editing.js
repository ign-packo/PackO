/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
import * as THREE from 'three';

const status = {
  RAS: 0,
  SELECT: 1,
  POLYGON: 2,
  ENDING: 3,
  WAITING: 4,
  WRITING: 5,
  ADDREMARK: 6,
};

class Editing {
  constructor(branch) {
    this.branch = branch;
    this.viewer = branch.viewer;
    this.view = this.viewer.view;
    this.api = this.viewer.api;

    this.validClicheSelected = false;
    this.currentStatus = status.RAS;
    this.currentPolygon = null;
    this.nbVertices = 0;
    this.lastPos = null;
    this.mousePosition = null;

    this.STATUS = status;
  }

  pickPoint(event) {
    const pointUnderCursor = new THREE.Vector3();
    const coords = this.view.eventToViewCoords(event);
    this.view.getPickingPositionFromDepth(coords, pointUnderCursor);
    return pointUnderCursor;
  }

  mousemove(e) {
    this.mousePosition = this.pickPoint(e);
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

  resetCurrentPolygon() {
    if (this.currentPolygon) {
      // on annule la saisie en cours
      this.view.scene.remove(this.currentPolygon);
      this.currentPolygon = null;
      this.view.notifyChange(this.currentPolygon);
    }
  }

  keydown(e) {
    if (this.currentStatus === status.WAITING) return;
    switch (this.currentStatus) {
      case status.RAS: {
        // L'utilisateur demande à déselectionner l'OPI
        if (this.validClicheSelected && (e.key === 'Escape')) {
          this.validClicheSelected = false;
          this.opiName = 'none';
          this.controllers.opiName.__li.style.backgroundColor = '';
          this.view.getLayerById('Opi').visible = false;
          this.view.notifyChange(this.view.getLayerById('Opi'), true);
        } else if (this.branch.alert.layerName !== ' -'
                   && this.branch.alert.nbTotal > 0) {
          if (e.key === 'ArrowLeft') {
            this.branch.alert.selectPrevious({ centerOnFeature: true });
          } else if (e.key === 'ArrowRight') {
            this.branch.alert.selectNext({ centerOnFeature: true });
          } else if (e.key === 'ArrowDown') {
            this.branch.alert.selectPrevious({ unviewed: true, centerOnFeature: true });
          } else if (e.key === 'ArrowUp') {
            this.branch.alert.selectNext({ unviewed: true, centerOnFeature: true });
          }
        }
        break;
      }
      case status.SELECT: {
        if (e.key === 'Escape') {
          this.viewer.message = '';
          this.view.controls.setCursor('default', 'auto');
          this.currentStatus = status.RAS;
          this.controllers.select.__li.style.backgroundColor = '';
        }
        break;
      }
      case status.POLYGON: {
        if (e.key === 'Escape') {
          this.viewer.message = '';
          this.resetCurrentPolygon();
          this.view.controls.setCursor('default', 'auto');
          this.currentStatus = status.RAS;
          this.controllers.polygon.__li.style.backgroundColor = '';
        } else if (e.key === 'Shift') {
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
        } else if (e.key === 'Backspace') {
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
        break;
      }
      case status.ADDREMARK: {
        if (e.key === 'Escape') {
          this.viewer.message = '';
          this.view.controls.setCursor('default', 'auto');
          this.currentStatus = status.RAS;
          this.controllers.addRemark.__li.style.backgroundColor = '';
        }
        break;
      }
      default:
    }
  }

  keyup(e) {
    if (this.currentStatus === status.WAITING) return;
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
    // this.viewer.message = '';

    switch (this.currentStatus) {
      case status.RAS: {
        this.branch.alert.selectFeatureAt(e);
        break;
      }
      case status.SELECT: {
        console.log('get OPI');
        this.viewer.message = 'calcul en cours';
        this.view.controls.setCursor('default', 'wait');
        this.currentStatus = status.WAITING;
        // on selectionne le cliche
        this.api.getGraph(this.branch.active.id, mousePosition)
          .then((opi) => {
            this.viewer.message = '';
            this.view.controls.setCursor('default', 'auto');
            this.currentStatus = status.RAS;
            this.controllers.select.__li.style.backgroundColor = '';

            this.validClicheSelected = true;

            this.opiName = opi.cliche;
            this.color = opi.color;
            this.controllers.opiName.__li.style.backgroundColor = `rgb(${this.color[0]},${this.color[1]},${this.color[2]})`;
            // On modifie la couche OPI
            this.view.getLayerById('Opi').source.url = this.view.getLayerById('Opi').source.url.replace(/LAYER=.*&FORMAT/, `LAYER=opi&Name=${opi.cliche}&FORMAT`);
            this.view.getLayerById('Opi').visible = true;
            this.viewer.refresh(['Opi']);
          })
          .catch((error) => {
            if (error.name === 'Server Error') {
              this.viewer.message = 'en dehors de la zone';
            } else {
              this.viewer.message = 'PB de mise à jour de la BdD';
              this.view.dispatchEvent({
                type: 'error',
                msg: error,
              });
            }
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
        const remark = window.prompt('comment:', '');
        if (remark !== null) {
          this.postRemark(mousePosition, remark);
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
    // if (this.currentStatus === status.WAITING) return;
    if (this.currentStatus !== status.RAS) return;
    // this.cancelcurrentPolygon();
    console.log('"select": En attente de sélection');
    this.viewer.message = 'choisir un cliche';
    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.SELECT;
    this.controllers.select.__li.style.backgroundColor = '#BB0000';
  }

  polygon() {
    if (this.currentStatus === status.WAITING) return;
    if (!this.validClicheSelected) {
      this.viewer.message = (this.currentStatus === status.SELECT) ? 'cliché non encore choisi' : 'pas de cliché sélectionné';
      return;
    }
    if (this.currentPolygon) {
      this.viewer.message = 'saisie déjà en cours';
      // saisie deja en cours
      return;
    }
    console.log("saisie d'un polygon");
    this.viewer.message = "saisie d'un polygon";
    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.POLYGON;
    this.controllers.select.__li.style.backgroundColor = '';
    this.controllers.polygon.__li.style.backgroundColor = '#BB0000';

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
    this.nbVertices = 0;
    // Pour eviter que l'object disparaisse dans certains cas
    this.currentPolygon.renderOrder = 1;
    this.currentPolygon.maxMarkers = -1;
    this.view.scene.add(this.currentPolygon);
    this.view.notifyChange(this.currentPolygon);
  }

  // PATCHES
  update() {
    console.log('update');
    if (!this.currentPolygon) {
      console.log('pas de polygone');
      return;
    }
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    this.currentStatus = status.WAITING;

    const positions = this.currentPolygon.geometry.attributes.position.array;
    const geojson = {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: { type: 'name', properties: { name: `urn:ogc:def:crs:${this.view.camera.crs.replace(':', '::')}` } },
      features: [
        {
          type: 'Feature',
          properties: { color: this.color, cliche: this.opiName },
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

    // On post le geojson sur l'API
    this.api.postPatch(this.branch.active.id, JSON.stringify(geojson))
      .then(() => {
        // this.viewer.refresh(this.branch.layers);
        this.viewer.refresh(['Ortho', 'Graph', 'Contour', 'Patches']);
        this.viewer.message = '';
      })
      .catch((error) => {
        console.log(error);
        this.viewer.message = error;
        this.viewer.view.dispatchEvent({
          type: 'error',
          msg: error,
        });
      })
      .finally(() => {
        this.resetCurrentPolygon();
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;
        this.controllers.polygon.__li.style.backgroundColor = '';
      });
  }

  undo() {
    // if (this.currentStatus === status.WAITING) return;
    if (this.currentStatus !== status.RAS) return;
    if (this.viewer.dezoom > this.viewer.maxGraphDezoom) {
      this.viewer.message = 'Zoom non valide pour annuler';
      return;
    }
    // this.cancelcurrentPolygon();
    console.log('undo');
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    this.currentStatus = status.WAITING;

    fetch(`${this.api.url}/${this.branch.active.id}/patch/undo?`,
      {
        method: 'PUT',
      }).then((res) => {
      // this.cancelcurrentPolygon();
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;

      if (res.status === 200) {
        // this.viewer.refresh(this.branch.layers);
        this.viewer.refresh(['Ortho', 'Graph', 'Contour', 'Patches']);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
      });
    });
  }

  redo() {
    // if (this.currentStatus === status.WAITING) return;
    if (this.currentStatus !== status.RAS) return;
    if (this.viewer.dezoom > this.viewer.maxGraphDezoom) {
      this.viewer.message = 'Zoom non valide pour refaire';
      return;
    }
    console.log('redo');
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    this.currentStatus = status.WAITING;

    fetch(`${this.api.url}/${this.branch.active.id}/patch/redo?`,
      {
        method: 'PUT',
      }).then((res) => {
      // this.cancelcurrentPolygon();
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;
      if (res.status === 200) {
        // this.viewer.refresh(this.branch.layers);
        this.viewer.refresh(['Ortho', 'Graph', 'Contour', 'Patches']);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
      });
    });
  }

  clear() {
    // if (this.currentStatus === status.WAITING) return;
    if (this.currentStatus !== status.RAS) return;
    const ok = window.confirm('Voulez-vous effacer toutes les modifications?');
    if (!ok) return;
    console.log('clear');
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    this.currentStatus = status.WAITING;

    fetch(`${this.api.url}/${this.branch.active.id}/patches/clear?`,
      {
        method: 'PUT',
      }).then((res) => {
      // this.cancelcurrentPolygon();
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;
      if (res.status === 200) {
        // this.viewer.refresh(this.branch.layers);
        this.viewer.refresh(['Ortho', 'Graph', 'Contour', 'Patches']);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
      });
    });
  }

  // remarques
  addRemark() {
    if (this.currentStatus !== status.RAS) return;
    console.log("saisie d'une remarque");
    this.viewer.message = "saisie d'une remarque";
    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.ADDREMARK;
    this.controllers.addRemark.__li.style.backgroundColor = '#BB0000';
  }

  postRemark(mousePosition, remark) {
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    this.currentStatus = status.WAITING;

    // On post la geometrie sur l'API
    const remarksLayerId = this.view.getLayerById('Remarques').vectorId;

    fetch(`${this.apiUrl}/${remarksLayerId}/feature?x=${mousePosition.x}&y=${mousePosition.y}&comment=${remark}`,
      {
        method: 'PUT',
      }).then((res) => {
      if (res.status === 200) {
        this.viewer.message = '';
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;
        this.controllers.addRemark.__li.style.backgroundColor = '';

        this.viewer.refresh(['Remarques']);

        this.view.dispatchEvent({
          type: 'remark-added',
        });
      } else {
        this.viewer.message = 'remark: error during save';
      }
    });
  }

  delRemark() {
    if (this.currentStatus !== status.RAS) return;
    console.log("suppression d'une remarque");
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    this.currentStatus = status.WAITING;

    // On supprime la geometrie sur l'API
    const remarksLayerId = this.view.getLayerById('Remarques').vectorId;

    const alertFC = this.branch.alert.featureCollection;
    const featureSelectedGeom = alertFC.features[0].geometries[this.branch.alert.featureIndex];
    const remarkId = featureSelectedGeom.properties.id;

    fetch(`${this.api.url}/${remarksLayerId}/feature?id=${remarkId}`,
      {
        method: 'DELETE',
      }).then((res) => {
      if (res.status === 200) {
        this.viewer.message = '';
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;

        this.viewer.refresh(['Remarques']);

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
