/* eslint no-underscore-dangle: ["error", { "allow": [__controllers, __li, __select] }] */

class Controller {
  constructor(menuGlobe, editing) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.editing = editing;
  }

  getController(name) {
    let controller = null;
    const controllers = this.menuGlobe.gui.__controllers;
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

  resetAlerts(keepName = false) {
    this.editing.alertLayerName = '-';
    if (!keepName) this.alert.__select.options.selectedIndex = 0;
    this.hide(['progress', 'id', 'validated', 'unchecked', 'comment', 'delRemark']);
    if (this.editing.viewer.view.getLayerById('selectedFeature')) {
      this.editing.viewer.view.removeLayer('selectedFeature');
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
