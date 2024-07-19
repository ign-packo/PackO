/* eslint-disable no-alert */
/* eslint-disable no-console */
import * as THREE from 'three';

const status = {
  RAS: 0,
  SELECTREFOPI: 1,
  POLYGON: 2,
  ENDING: 3,
  WAITING: 4,
  WRITING: 5,
  ADDREMARK: 6,
  SELECTSECOPI: 7,
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

    this.opiRefName = 'none';
    this.opiRefDate = '';
    this.opiRefTime = '';

    this.opiSecName = 'none';
    this.opiSecDate = '';
    this.opiSecTime = '';

    this.typePatchStr = 'none';
    this.typePolygonStr = 'none';

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

      if ((this.currentStatus === status.POLYGON) && this.nbVertices > 0) {
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
    this.viewer.message = 'calcul en cours';
    this.view.controls.setCursor('default', 'wait');
    console.log('update typePatch, currentStatus:', this.typePatchStr, this.currentStatus);
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
            colorRef: this.colorRef,
            opiRefName: this.opiRefName,
            colorSec: (this.typePatchStr === 'manual' ? 'none' : this.colorSec),
            opiSecName: (this.typePatchStr === 'manual' ? 'none' : this.opiSecName),
            patchIsAuto: (this.typePatchStr !== 'manual'),
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
        if (error === undefined) {
          this.viewer.message = "'undefined' error";
        } else {
          this.viewer.message = error.message;
        }
        this.viewer.view.dispatchEvent({
          type: 'error',
          error,
        });
      })
      .finally(() => {
        this.resetCurrentPolygon();
        this.view.controls.setCursor('default', 'auto');
        this.currentStatus = status.RAS;
        this.typePolygonStr = this.typePatchStr === 'manual' ? 'polygon' : 'polygon4Auto';
        this.menu.getController(this.typePolygonStr).setBackgroundColorTo('');
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
      // select Opi ref
      if (e.key === 's') this.selectRefOpi();
      // select Opi sec
      if (e.key === 'w') this.selectSecOpi();
      // start polygon
      if ((e.key === 'p') && (this.branch.active.name !== 'orig')) this.polygon();
      if ((e.key === 't') && (this.branch.active.name !== 'orig')) this.polygon4Auto();
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
      if (this.opiRefName !== 'none' && (e.key === 'Escape')) {
        this.opiRefName = 'none';
        this.menu.getController('opiRefName').setBackgroundColorTo('');
        this.view.dispatchEvent({
          type: 'oref-selected',
          name: 'none',
        });
      } else if (this.opiSecName !== 'none' && (e.key === 'Escape')) {
        this.opiSecName = 'none';
        this.menu.getController('opiSecName').setBackgroundColorTo('');
        this.view.dispatchEvent({
          type: 'osec-selected',
          name: 'none',
        });
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
      if (this.currentStatus === status.SELECTREFOPI) {
        this.menu.getController('selectRefOpi').setBackgroundColorTo('');
      }
      if (this.currentStatus === status.SELECTSECOPI) {
        this.menu.getController('selectSecOpi').setBackgroundColorTo('');
      }
      if (this.currentStatus === status.POLYGON) {
        this.typePolygonStr = this.typePatchStr === 'manual' ? 'polygon' : 'polygon4Auto';
        this.menu.getController(this.typePolygonStr).setBackgroundColorTo('');
        this.resetCurrentPolygon();
        this.typePatchStr = 'none';
      }
      if (this.currentStatus === status.ADDREMARK) {
        this.menu.getController('addRemark').setBackgroundColorTo('');
      }
      this.viewer.message = '';
      this.view.controls.setCursor('default', 'auto');
      this.currentStatus = status.RAS;
    }
    if (this.currentStatus === status.POLYGON) {
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
      if (this.currentStatus === status.ENDING || this.currentStatus === status.POLYGON) {
        this.viewer.message = '???Maj pour terminer';
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
    this.viewer.message = '';

    switch (this.currentStatus) {
      case status.RAS: {
        this.branch.alert.selectFeatureAt(e);
        break;
      }
      case status.SELECTREFOPI: {
        this.viewer.message = 'calcul en cours';
        this.view.controls.setCursor('default', 'wait');
        this.currentStatus = status.WAITING;
        // on selectionne l'Opi de reference
        this.api.getGraph(this.branch.active.id, mousePosition)
          .then((opi) => {
            this.viewer.message = '';
            this.view.controls.setCursor('default', 'auto');
            this.currentStatus = status.RAS;
            this.menu.getController('selectRefOpi').setBackgroundColorTo('');

            this.opiRefName = opi.opiName;
            this.opiRefDate = opi.date;
            this.opiRefTime = opi.time;
            this.colorRef = opi.color;
            this.menu.getController('opiRefName').setBackgroundColorTo(`rgb(${this.colorRef[0]},${this.colorRef[1]},${this.colorRef[2]})`);
            // On modifie la source de la couche OPI
            this.view.changeOpi(this.opiRefName);
            this.view.dispatchEvent({
              type: 'oref-selected',
              name: this.opiRefName,
            });
          })
          .catch((error) => {
            if (error.name === 'Erreur Utilisateur') {
              this.viewer.message = 'en dehors de la zone';
              this.view.controls.setCursor('default', 'crosshair');
              this.currentStatus = status.SELECTREFOPI;
            } else {
              this.viewer.message = 'ORef PB de mise à jour de la BdD';
              this.view.controls.setCursor('default', 'auto');
              this.currentStatus = status.RAS;
              this.menu.getController('selectRefOpi').setBackgroundColorTo('');
              this.view.dispatchEvent({
                type: 'error',
                error,
              });
            }
          });
        break;
      }
      case status.SELECTSECOPI: {
        this.viewer.message = 'calcul en cours';
        this.view.controls.setCursor('default', 'wait');
        this.currentStatus = status.WAITING;
        // on selectionne l'Opi secondaire
        this.api.getGraph(this.branch.active.id, mousePosition)
          .then((opi) => {
            this.viewer.message = '';
            this.view.controls.setCursor('default', 'auto');
            this.currentStatus = status.RAS;
            this.menu.getController('selectSecOpi').setBackgroundColorTo('');

            this.opiSecName = opi.opiName;
            this.opiSecDate = opi.date;
            this.opiSecTime = opi.time;
            this.colorSec = opi.color;
            this.menu.getController('opiSecName').setBackgroundColorTo(`rgb(${this.colorSec[0]},${this.colorSec[1]},${this.colorSec[2]})`);
            // On modifie la source de la couche OPI
            // this.view.changeOpi(this.opiSecName); // pas d'affichage de l'opi sec
            this.view.dispatchEvent({
              type: 'osec-selected',
              name: this.opiSecName,
            });
          })
          .catch((error) => {
            if (error.name === 'Erreur Utilisateur') {
              this.viewer.message = 'en dehors de la zone';
              this.view.controls.setCursor('default', 'crosshair');
              this.currentStatus = status.SELECTSECOPI;
            } else {
              this.viewer.message = 'OSec PB de mise à jour de la BdD';
              this.view.controls.setCursor('default', 'auto');
              this.currentStatus = status.RAS;
              this.menu.getController('selectSecOpi').setBackgroundColorTo('');
              this.view.dispatchEvent({
                type: 'error',
                error,
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

  selectRefOpi() {
    if (this.currentStatus !== status.RAS) return;
    // this.cancelcurrentPolygon();
    console.log('"select ref opi": En attente de sélection');
    this.viewer.message = 'choisir Opi ref';
    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.SELECTREFOPI;
    this.menu.getController('selectRefOpi').setBackgroundColorTo('#BB0000');
  }

  selectSecOpi() {
    if (this.currentStatus !== status.RAS) return;
    // this.cancelcurrentPolygon();
    console.log('"select sec opi": En attente de sélection');
    this.viewer.message = 'choisir Opi sec';
    this.view.controls.setCursor('default', 'crosshair');
    this.currentStatus = status.SELECTSECOPI;
    this.menu.getController('selectSecOpi').setBackgroundColorTo('#725794');
  }

  polygon() {
    if (this.currentStatus === status.WAITING) return;
    if (this.opiRefName === 'none') {
      this.viewer.message = (this.currentStatus === status.SELECTREFOPI)
        ? 'Opi ref pas encore choisie' : 'pas d\'Opi ref sélectionnée';
      return;
    }
    if (this.currentPolygon) {
      this.viewer.message = 'saisie déjà en cours';
      // saisie deja en cours
      return;
    }
    this.viewer.message = "saisie d'un polygon";
    this.view.controls.setCursor('default', 'crosshair');
    this.menu.getController('selectRefOpi').setBackgroundColorTo('');
    this.menu.getController('selectSecOpi').setBackgroundColorTo('');
    this.menu.getController('polygon').setBackgroundColorTo('#BB0000');
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
    this.typePatchStr = 'manual';
    console.log(`saisie d'un polygon -> type patch: '${this.typePatchStr}'`);
    this.nbVertices = 0;
  }

  polygon4Auto() {
    if (this.currentStatus === status.WAITING) return;
    if (this.opiRefName === 'none') {
      this.viewer.message = (this.currentStatus === status.SELECTREFOPI)
        ? 'Opi ref pas encore choisie' : 'pas d\'Opi ref sélectionnée';
      return;
    }
    if (this.opiSecName === 'none') {
      this.viewer.message = (this.currentStatus === status.SELECTSECOPI)
        ? 'Opi sec pas encore choisie' : 'pas d\'Opi sec sélectionnée';
      return;
    }
    if (this.opiSecName === this.opiRefName) {
      this.viewer.message = (this.currentStatus === status.SELECTSECOPI)
        ? 'Opi sec pas encore choisie' : 'Opi sec pas diff Opi ref';
      return;
    }
    if (this.currentPolygon) {
      this.viewer.message = 'saisie déjà en cours';
      // saisie deja en cours
      return;
    }
    this.viewer.message = "saisie d'un polygon auto";
    this.view.controls.setCursor('default', 'crosshair');
    this.menu.getController('selectRefOpi').setBackgroundColorTo('');
    this.menu.getController('selectSecOpi').setBackgroundColorTo('');
    this.menu.getController('polygon4Auto').setBackgroundColorTo('#3456b5');
    const MAX_POINTS = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 1);
    const material = new THREE.LineBasicMaterial({
      color: 0x0000FF,
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
    this.typePatchStr = 'auto';
    console.log(`saisie d'un polygon -> type patch: '${this.typePatchStr}'`);
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
