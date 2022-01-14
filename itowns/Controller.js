/* eslint no-underscore-dangle: ["error", { "allow": [__controllers, __li, __select] }] */
function getController(gui, name) {
  let controller = null;
  const controllers = gui.__controllers;
  for (let i = 0; i < controllers.length; i += 1) {
    const c = controllers[i];
    if (c.property === name || c.name === name) {
      controller = c;
      break;
    }
  }
  return controller;
}

class Controller {
  constructor(menuGlobe, editing) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.editing = editing;
    this.viewer = this.editing.viewer;
  }

  setEditingController() {
    const brancheName = this.editing.branch.active.name;
    this[brancheName !== 'orig' ? 'setVisible' : 'hide'](['polygon', 'undo', 'redo']);
    if (process.env.NODE_ENV === 'development') this[brancheName !== 'orig' ? 'setVisible' : 'hide']('clear');
  }

  refreshDropBox(dropBoxName, list) {
    let innerHTML = '';
    list.forEach((element) => {
      innerHTML += `<option value='${element}'>${element}</option>`;
    });
    this[dropBoxName].domElement.children[0].innerHTML = innerHTML;
    // this.editing.alert = value;
    this[dropBoxName].updateDisplay();
  }

  resetAlerts() {
    delete this.editing.alertLayerName;
    delete this.viewer.alertLayerName;
    this.alert.__select.options.selectedIndex = 0;
    // this.hide(['nbChecked', 'checked', 'comment']);
    this.hide(['progress', 'id', 'validated', 'unchecked', 'comment']);
    if (this.viewer.view.getLayerById('selectedFeature')) {
      this.viewer.view.removeLayer('selectedFeature');
    }
  }

  setVisible(controllerName) {
    const controllers = (typeof controllerName === 'string' || controllerName instanceof String) ? [controllerName] : controllerName;
    controllers.forEach((controller) => {
      getController(this.viewer.menuGlobe.gui, controller).__li.style.display = '';
    });
  }

  hide(controllerName) {
    const controllers = (typeof controllerName === 'string' || controllerName instanceof String) ? [controllerName] : controllerName;
    controllers.forEach((controller) => {
      getController(this.viewer.menuGlobe.gui, controller).__li.style.display = 'none';
    });
  }
}
export default Controller;
