/* global dat */

/* eslint-disable no-underscore-dangle */
dat.GUI.prototype.removeFolder = function removeFolder(name) {
  const folder = this.__folders[name];
  if (!folder) return;
  folder.close();
  this.__ul.removeChild(folder.domElement.parentNode);
  delete this.__folders[name];
  this.onResize();
};
dat.GUI.prototype.hasFolder = function hasFolder(name) {
  return this.__folders[name];
};
dat.GUI.prototype.getController = function getController(name) {
  let controller = null;
  const controllers = this.__controllers;
  for (let i = 0; i < controllers.length; i += 1) {
    const c = controllers[i];
    if (c.property === name || c.name === name) {
      controller = c;
      break;
    }
  }
  return controller;
};

dat.controllers.Controller.prototype.show = function show() {
  this.__li.style.display = '';
};
dat.controllers.Controller.prototype.hide = function hide() {
  this.__li.style.display = 'none';
};
dat.controllers.Controller.prototype.selectIndex = function selectIndex(newIndex) {
  this.__select.options.selectedIndex = newIndex;
};
/* eslint-enable no-underscore-dangle */

class Menu extends dat.GUI {
  constructor(menuDiv, viewer, shortCuts) {
    const width = 300;

    super({ autoPlace: false, width });
    this.shortCuts = shortCuts;
    this.viewer = viewer;
    this.view = viewer.view;

    menuDiv.appendChild(this.domElement);

    this.colorGui = this.addFolder('Color Layers');
    this.colorGui.open();
    this.vectorGui = this.addFolder('Extra Layers [v]');
    this.vectorGui.domElement.id = 'extraLayers';
    this.vectorGui.open();

    this.view.addEventListener('refresh-done', ((ev) => {
      ev.layerNames.forEach((layerName) => {
        this.addLayerGUI(layerName);
      });
    }));

    this.view.addEventListener('branch-changed', () => {
      Object.keys(this.vectorGui.getSaveObject().folders).forEach((layerName) => {
        this.removeLayerGUI(layerName);
      });
    });
  }

  setVisible(controllerName) {
    const controllers = (typeof controllerName === 'string' || controllerName instanceof String) ? [controllerName] : controllerName;
    controllers.forEach((controller) => {
      this.getController(controller).show();
    });
  }

  hide(controllerName) {
    const controllers = (typeof controllerName === 'string' || controllerName instanceof String) ? [controllerName] : controllerName;
    controllers.forEach((controller) => {
      this.getController(controller).hide();
    });
  }

  setPatchCtr(branchName) {
    this[branchName !== 'orig' ? 'setVisible' : 'hide'](['polygon', 'undo', 'redo']);
    if (process.env.NODE_ENV === 'development') this[branchName !== 'orig' ? 'setVisible' : 'hide']('clear');
  }

  setAlertCtr(layerName) {
    this[layerName !== '-' ? 'setVisible' : 'hide'](['progress', 'id', 'validated', 'uncheck', 'comment']);
    this[layerName === 'Remarques' ? 'setVisible' : 'hide'](['delRemark']);
  }

  setOpiCtr(opiName) {
    this[opiName === 'none' ? 'hide' : 'setVisible'](['opiName', 'opiDate', 'opiTime']);
  }

  refreshDropBox(dropBoxName, listOfValues,
    valueToSelect = this.getController(dropBoxName).getValue()) {
    // by default if valueToSelect is not given, the current value will be kept
    let selectedIndex = 0;
    let innerHTML = '';
    listOfValues.forEach((element, i) => {
      innerHTML += `<option value='${element}'>${element}</option>`;
      if (element === valueToSelect) {
        selectedIndex = i;
      }
    });
    this.getController(dropBoxName).domElement.children[0].innerHTML = innerHTML;
    this.getController(dropBoxName).selectIndex(selectedIndex);
  }

  addLayerGUI(layerId) {
    const layer = this.view.getLayerById(layerId);
    if (!layer.isColorLayer) return;
    let typeGui = 'colorGui';
    if (!['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].includes(layer.id)) {
      typeGui = 'vectorGui';
    }
    if (this[typeGui].hasFolder(layer.id)) return;
    const folder = this[typeGui].addFolder(layer.id);

    // name folder
    let nameFolder = layer.id;
    if (this.shortCuts.visibleFolder[layer.id] !== undefined) {
      nameFolder += ` [${this.shortCuts.visibleFolder[layer.id]}]`;
    }
    if (this.shortCuts.styleFolder[layer.id] !== undefined) {
      nameFolder += ` [${this.shortCuts.styleFolder[layer.id]}]`;
    }
    folder.name = nameFolder;

    // visibility
    const visib = folder.add({ visible: layer.visible }, 'visible');
    visib.domElement.setAttribute('id', layer.id);
    visib.domElement.classList.add('visibcbx');
    visib
      .onChange(((value) => {
        const newLayer = this.view.getLayerById(layer.id);
        newLayer.visible = value;
        this.view.notifyChange(newLayer);
      }));

    // opacity
    folder.add({ opacity: layer.opacity }, 'opacity').min(0.001).max(1.0)
      .onChange(((value) => {
        const newLayer = this.view.getLayerById(layer.id);
        newLayer.opacity = value;
        this.view.notifyChange(newLayer);
      }));

    // style
    if (['Ortho', 'Opi'].includes(layer.id)) {
      const style = folder.add(layer.id === 'Ortho' ? this.view : this.view.Opi, 'style', this.view.styles);
      style
        .onChange((value) => {
          this.view.changeWmtsStyle(layer.id, value);
        });
    }

    // Patch pour ajouter la modification de l'epaisseur des contours dans le menu
    if (layer.effect_parameter) {
      folder.add({ thickness: layer.effect_parameter }, 'thickness').min(0.5).max(5.0)
        .onChange(((value) => {
          const newLayer = this.view.getLayerById(layer.id);
          newLayer.effect_parameter = value;
          this.view.notifyChange(newLayer);
        }));
    }

    // delete layer
    if (typeGui === 'vectorGui' && layer.id !== 'Remarques' && layer.isAlert === false) {
      folder.add(this.view, 'removeVectorLayer').name('delete')
        .onChange(() => {
          const newLayer = this.view.getLayerById(layer.id);
          if (newLayer.isAlert === false) {
            this.view.removeVectorLayer(layer.id);
            this.removeLayerGUI(layer.id);
          } else {
            this.viewer.message = 'Couche en edition';
          }
        });
    }
  }

  removeLayerGUI(nameLayer) {
    if (this.colorGui.hasFolder(nameLayer)) {
      this.colorGui.removeFolder(nameLayer);
    } else {
      this.vectorGui.removeFolder(nameLayer);
    }
  }
}

export default Menu;
