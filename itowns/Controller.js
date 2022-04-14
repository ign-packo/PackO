/* eslint no-underscore-dangle: ["error", { "allow": [__controllers, __li, __select] }] */

class Controller {
  constructor(menuGlobe, editing) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.editing = editing;
    this.viewer = this.editing.viewer;
    this.branch = this.editing.branch;
  }

  getController(name) {
    let controller = null;
    const controllers = this.viewer.menuGlobe.gui.__controllers;
    for (let i = 0; i < controllers.length; i += 1) {
      const c = controllers[i];
      if (c.property === name || c.name === name) {
        controller = c;
        break;
      }
    }
    return controller;
  }

  setEditingController() {
    const branchName = this.branch.active.name;
    this[branchName !== 'orig' ? 'setVisible' : 'hide'](['polygon', 'undo', 'redo']);
    if (process.env.NODE_ENV === 'development') this[branchName !== 'orig' ? 'setVisible' : 'hide']('clear');
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
    // delete this.editing.alertLayerName;
    // delete this.viewer.alertLayerName;
    delete this.branch.alert;
    this.alert.__select.options.selectedIndex = 0;
    this.hide(['progress', 'id', 'validated', 'unchecked', 'comment', 'delRemark']);
    if (this.viewer.view.getLayerById('selectedFeature')) {
      this.viewer.view.removeLayer('selectedFeature');
    }
  }

  setVisible(controllerName) {
    const controllers = (typeof controllerName === 'string' || controllerName instanceof String) ? [controllerName] : controllerName;
    controllers.forEach((controller) => {
      this.getController(controller).__li.style.display = '';
    });
  }

  hide(controllerName) {
    const controllers = (typeof controllerName === 'string' || controllerName instanceof String) ? [controllerName] : controllerName;
    controllers.forEach((controller) => {
      this.getController(controller).__li.style.display = 'none';
    });
  }
}
export default Controller;
