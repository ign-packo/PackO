/* eslint no-underscore-dangle: ["error", { "allow": [__controllers, __li, __select] }] */

class Controller {
  constructor(menuGlobe, editing) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.editing = editing;
    this.viewer = this.editing.viewer;
    // this.branch = this.editing.branch;
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

  setEditingController(branchName) {
    // const branchName = this.branch.active.name;
    this[branchName !== 'orig' ? 'setVisible' : 'hide'](['polygon', 'undo', 'redo']);
    if (process.env.NODE_ENV === 'development') this[branchName !== 'orig' ? 'setVisible' : 'hide']('clear');
  }

  refreshDropBox(dropBoxName, list, index) {
    let innerHTML = '';
    list.forEach((element) => {
      innerHTML += `<option value='${element}'>${element}</option>`;
    });
    this[dropBoxName].domElement.children[0].innerHTML = innerHTML;
    if (index !== undefined) this[dropBoxName].__select.options.selectedIndex = index;
    // dans le cas ou index n'est pas renseigné on conserve la valeur précedente
  }

  refreshAlert() {
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
