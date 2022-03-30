/* eslint no-underscore-dangle: ["error", { "allow": [__controllers, __li, __select] }] */

class Controller {
  constructor(menuGlobe, editing) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.editing = editing;
    this.viewer = this.editing.viewer;
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

  resize(controllerName, text) {
    if (controllerName === 'comment') {
      if (text !== undefined) {
        const spanDiv = this.comment.domElement.parentElement.children[0];
        this.comment.domElement.parentElement.parentElement.style.width = `${text.length * 2}em`;
        spanDiv.innerText = text;
        spanDiv.style.width = 'fit-content';

        const width = window.getComputedStyle(spanDiv, null).getPropertyValue('width');
        const sizeDiv = parseFloat(width) * 1.25;

        spanDiv.innerText = 'Comment';
        spanDiv.style.width = 115.19;
        this.comment.domElement.style.width = sizeDiv;
        this.comment.domElement.parentElement.parentElement.style.width = sizeDiv + 115.19;
      } else {
        this.comment.domElement.parentElement.parentElement.style.width = '';
        this.comment.domElement.style.width = '';
        this.comment.domElement.parentElement.children[0].style.width = '';
      }
    }
  }
}
export default Controller;
