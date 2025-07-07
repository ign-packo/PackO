/* eslint-disable no-alert */
/* eslint-disable no-console */
import * as THREE from 'three';

const status = {
  RAS: 0,
  SELECT: 1,
  SAISIE: 2,
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

class Editing {
  constructor(branch, menu) {
    this.branch = branch;
    this.viewer = branch.viewer;
    this.view = this.viewer.view;
    this.api = this.viewer.api;
    this.menu = menu;

    this.currentOpi = 0;

    this.opi1Name = 'none';
    this.opi1Date = '';
    this.opi1Time = '';
    this.opi1Color = '';

    this.opi2Name = 'none';
    this.opi2Date = '';
    this.opi2Time = '';
    this.opi2Color = '';

    this.coord = `${this.viewer.xcenter.toFixed(2)},${this.viewer.ycenter.toFixed(2)}`;

    this.currentStatus = status.RAS;
    this.currentPolygon = null;
    this.nbVertices = 0;
    this.lastPos = null;
    this.mousePosition = null;

    this.featureIndex = 0;

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
    if (this.mousePosition) {
      this.coord = `${this.mousePosition.x.toFixed(2)},${this.mousePosition.y.toFixed(2)}`;
      if (this.currentPolygon == null) return;

      if (this.currentStatus === status.SAISIE && this.nbVertices > 0) {
        const vertices = this.currentPolygon.geometry.attributes.position;
        const newPoint = new THREE.Vector3();
        newPoint.subVectors(this.mousePosition, this.currentPolygon.position);
        vertices.set(newPoint.toArray(), 3 * this.nbVertices);
        vertices.copyAt(this.nbVertices + 1, vertices, 0);
        vertices.needsUpdate = true;
        this.currentPolygon.geometry.setDrawRange(0, this.nbVertices + (this.saisie.type === 'polygon' ? 2 : 1));
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
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    console.log('update typePatch, currentStatus:', this.saisie.type, this.currentStatus);
    this.currentStatus = status.WAITING;

    const positions = this.currentPolygon.geometry.attributes.position.array;
    const geojson = {
      type: 'FeatureCollection',
      name: 'annotation',
      crs: { type: 'name', properties: { name: `urn:ogc:def:crs:${this.view.camera.crs.replace(':', '::')}` } },
      features: [
        {
          type: 'Feature',
          properties: {
            colorRef: this.opi1Color,
            opiRefName: this.opi1Name,
            colorSec: (this.saisie.type === 'polygon' ? 'none' : this.opi2Color),
            opiSecName: (this.saisie.type === 'polygon' ? 'none' : this.opi2Name),
            patchIsAuto: (this.saisie.type !== 'polygon'),
          },
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

    // this.view.scene.remove(this.currentPolygon);
    // this.currentStatus = status.WAITING;
    // this.view.controls.setCursor('default', 'wait');
    // this.viewer.message = 'calcul en cours';

    // On post le geojson sur l'API
    this.api.postPatch(this.branch.active.id, JSON.stringify(geojson))
      .then(() => {
        this.viewer.refresh(['Ortho', 'Graph', 'Contour', 'Patches']);
        this.viewer.message = '';
      })
      .catch((error) => {
        console.log(error);
        this.viewer.message = error.message;
        this.viewer.view.dispatchEvent({
          type: 'error',
          error,
        });
      })
      .finally(() => {
        this.resetCurrentPolygon();
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;
        this.menu.getController(this.saisie.type).setBackgroundColorTo('');
      });
  }

  resetCurrentPolygon() {
    if (this.currentPolygon) {
      // on annule la saisie en cours
      this.view.scene.remove(this.currentPolygon);
      this.currentPolygon = null;
      this.view.notifyChange(this.currentPolygon);
    }
  }

  // alerts
  async postValue(idFeature, variable, value) {
    const res = await fetch(`${this.api.url}/vector/${idFeature}?${variable}=${value}`,
      {
        method: 'PUT',
      });
    if (res.status === 200) {
      this.viewer.refresh([this.branch.alert.layerName]);
      this.alertFC.features[0].geometries[this.featureIndex].properties[variable] = value;
    } else {
      this.viewer.message = 'PB with validate';
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
      // select Opi 1
      if (e.key === 's') this.select(1);
      // select Opi 2
      if (e.key === 'w') this.select(2);
      // start polygon
      if ((e.key === 'p') && (this.branch.active.name !== 'orig')) this.saisie('polygon');
      if ((e.key === 't') && (this.branch.active.name !== 'orig')) this.saisie('polyline');
      // change visibility on ColorLayers
      Object.keys(this.viewer.shortCuts.visibleFolder).forEach((key) => {
        if (e.key === this.viewer.shortCuts.visibleFolder[key]) {
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
      if ((e.key === 'c') && (this.branch.alert.nbTotal > 0)) {
        console.log('Change alert validation status');
        this.branch.alert.validated = !this.branch.alert.validated;
        this.branch.alert.setValidation(this.branch.alert.validated);
      }
      // move camera proportional to one screen
      if (this.branch.alert.layerName === '-') {
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
        this.viewer.centerCameraOn(camera.position.x, camera.position.y);
      }
      // add remark
      if (e.key === 'a') this.addRemark();
      // delete remark
      if (this.branch.alert.layerName === 'Remarques' && this.branch.alert.nbTotal > 0 && e.key === 'd') this.delRemark();
      // Change Ortho and Opi to next style RVB/IRC/IR
      if (e.key === 'i') {
        const selectedIndex = this.view.styles.indexOf(this.view.style);
        this.view.style = this.view.styles[(selectedIndex + 1) % this.view.styles.length];
        this.view.Opi.style = this.view.style;
        this.view.changeWmtsStyle(['Opi', 'Ortho'], this.view.style);
      }

      // L'utilisateur demande à déselectionner l'OPI
      if (e.key === 'Escape') {
        if (this.opi2Name !== 'none') {
          this.opi2Name = 'none';
          this.menu.setOpi2DataCtr(this.opi2Name);
          this.menu.getController('opi2Name').setBackgroundColorTo('');
          this.menu.getController('select2').setBackgroundColorTo('');
          this.view.changeOpi(this.opi1Name);
          this.view.dispatchEvent({
            type: 'opi-selected',
            name: this.opi1Name,
            id: 1,
          });
        } else if (this.opi1Name !== 'none') {
          this.opi1Name = 'none';
          this.menu.getController('opi1Name').setBackgroundColorTo('');
          this.view.dispatchEvent({
            type: 'opi-selected',
            name: 'none',
            id: 1,
          });
        }
      } else if (this.branch.alert.layerName !== '-' && this.branch.alert.nbTotal > 0) {
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
      return;
    }
    if (e.key === 'Escape') {
      if (this.currentStatus === status.SELECT) {
        this.menu.getController(`select${this.currentOpi}`).setBackgroundColorTo('');
      }
      if (this.currentStatus === status.SAISIE) {
        this.menu.getController(this.saisie.type).setBackgroundColorTo('');
        this.resetCurrentPolygon();
      }
      if (this.currentStatus === status.ADDREMARK) {
        this.menu.getController('addRemark').setBackgroundColorTo('');
      }
      this.viewer.message = '';
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;
    }
    if (this.currentStatus === status.SAISIE) {
      if (e.key === 'Shift') {
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
    }
  }

  keyup(e) {
    if (this.currentStatus === status.WAITING) return;
    console.log(e.key, ' up');
    if (e.key === 'Shift') {
      if (this.currentStatus === status.ENDING || this.currentStatus === status.SAISIE) {
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
        this.currentStatus = status.SAISIE;
      }
    }
  }

  click(e) {
    if (this.currentStatus === status.WAITING) return;
    const mousePosition = this.pickPoint(e);
    console.log('Click: ', mousePosition.x, mousePosition.y);
    this.viewer.message = '';

    switch (this.currentStatus) {
      case status.RAS: {
        this.branch.alert.selectFeatureAt(e);
        break;
      }
      case status.SELECT: {
        this.viewer.message = 'calcul en cours';
        this.view.controls.setCursor('default', 'wait');
        this.currentStatus = status.WAITING;
        // on selectionne une Opi
        this.api.getGraph(this.branch.active.id, mousePosition)
          .then((opi) => {
            console.log(this.opi1Name);
            if (this.opi1Name !== 'none' && ([this.opi1Name, this.opi2Name].includes(opi.opiName))) {
              this.viewer.message = 'Même opi';
              this.view.controls.setCursor('default', 'crosshair');
              this.currentStatus = status.SELECT;
              return;
            }
            this.viewer.message = '';
            this.view.controls.setCursor('default', 'auto');
            this.currentStatus = status.RAS;
            this.menu.getController(`select${this.currentOpi}`).setBackgroundColorTo('');

            const opiName = `opi${this.currentOpi}Name`;
            const opiColor = `opi${this.currentOpi}Color`;
            this[opiName] = opi.opiName;
            this[`opi${this.currentOpi}Date`] = opi.date;
            this[`opi${this.currentOpi}Time`] = opi.time;
            this[`opi${this.currentOpi}Color`] = opi.color;

            this.menu.getController(opiName)
              .setBackgroundColorTo(`rgb(${opi.color[0]},${opi.color[1]},${opi.color[2]})`);
            // On modifie la source de la couche OPI
            this.view.changeOpi(this[opiName]);
            this.view.dispatchEvent({
              type: 'opi-selected',
              name: this[opiName],
              id: this.currentOpi,
            });
          })
          .catch((error) => {
            if (error.name === 'Erreur Utilisateur') {
              this.viewer.message = 'en dehors de la zone';
              this.view.controls.setCursor('default', 'crosshair');
              this.currentStatus = status.SELECT;
            } else {
              this.viewer.message = `Opi ${this.currentOpi}: PB de BdD`;
              this.view.controls.setCursor('default', 'auto');
              this.currentStatus = status.RAS;
              this.menu.getController(`select${this.currentOpi}`).setBackgroundColorTo('');
              this.view.dispatchEvent({
                type: 'error',
                error,
              });
            }
          });
        break;
      }
      case status.SAISIE: {
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
      // on termine la polyline ou polygon
        this.update();
        break;
      default:
    }
  }

  select(id) {
    if (this.currentStatus === status.SELECT && this.currentOpi !== id) {
      this.viewer.message = `Opi ${this.currentOpi} non encore choisie`;
    }
    if (this.currentStatus !== status.RAS) return;
    console.log('"select": En attente de sélection');
    this.viewer.message = `choisir l'Opi ${id}`;
    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.SELECT;
    this.currentOpi = id;
    this.menu.getController(`select${id}`).setBackgroundColorTo('#BB0000');
  }

  saisie(type) {
    if (this.currentStatus === status.WAITING) return;
    if (this.currentStatus === status.SELECT) {
      this.viewer.message = `Sélection Opi ${this.currentOpi} en cours`;
      return;
    }
    if (this.currentPolygon) {
      this.viewer.message = 'saisie déjà en cours';
      // saisie deja en cours
      return;
    }

    if (type === 'polygon') {
      if (this.opi1Name === 'none') {
        this.viewer.message = "pas d'Opi sélectionnée";
        return;
      }
      if (this.opi2Name !== 'none') {
        this.viewer.message = "2 Opi sélectionnées !";
        return;
      }
    } else if (type === 'polyline') {
      if (this.opi1Name === 'none' || this.opi2Name === 'none') {
        this.viewer.message = "Sélectionnez 2 Opi";
        return;
      }
    }

    this.saisie.type = type;
    console.log("saisie d'un " + type);
    this.viewer.message = "saisie d'un " + type;
    this.view.controls.setCursor('default', 'crosshair');
    this.menu.getController(`select${this.currentOpi}`).setBackgroundColorTo('');
    this.menu.getController(type).setBackgroundColorTo('#BB0000');

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
    this.currentStatus = status.SAISIE;
    this.nbVertices = 0;

  }

  undo() {
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
      this.viewer.message = '';
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;
      if (res.status === 200) {
        this.view.refresh(['Ortho', 'Graph', 'Contour', 'Patches']);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
      });
    });
  }

  redo() {
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
      this.viewer.message = '';
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;
      if (res.status === 200) {
        this.viewer.refresh(this.branch.layers);
      }
      res.text().then((msg) => {
        this.viewer.message = msg;
      });
    });
  }

  clear() {
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
      this.viewer.message = '';
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;
      if (res.status === 200) {
        this.view.refresh(['Ortho', 'Graph', 'Contour', 'Patches']);
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
    this.menu.getController('addRemark').setBackgroundColorTo('#BB0000');
  }

  postRemark(mousePosition, remark) {
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    this.currentStatus = status.WAITING;

    // On post la geometrie sur l'API
    const remarksLayerId = this.view.getLayerById('Remarques').vectorId;
    this.api.putRemark(remarksLayerId, mousePosition, remark)
      .then(() => {
        this.viewer.message = '';
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;
        this.menu.getController('addRemark').setBackgroundColorTo('');

        this.viewer.refresh(['Remarques']);

        this.view.dispatchEvent({
          type: 'remark-added',
        });
      })
      .catch((error) => {
        this.viewer.message = 'remark: error during save';
        this.viewer.view.dispatchEvent({
          type: 'error',
          msg: error,
        });
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
    this.api.delRemark(remarksLayerId, remarkId)
      .then(() => {
        this.viewer.message = '';
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;

        this.view.dispatchEvent({
          type: 'remark-deleted',
        });
      })
      .catch((error) => {
        this.viewer.message = 'remark: error during delete';
        this.viewer.view.dispatchEvent({
          type: 'error',
          msg: error,
        });
      });
  }
}

export default Editing;
