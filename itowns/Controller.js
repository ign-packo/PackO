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

  setPatchCtr(branchName) {
    this[branchName !== 'orig' ? 'setVisible' : 'hide'](['polygon', 'undo', 'redo']);
    if (process.env.NODE_ENV === 'development') this[branchName !== 'orig' ? 'setVisible' : 'hide']('clear');
  }

  setAlertCtr(layerName) {
    this[layerName !== '-' ? 'setVisible' : 'hide'](['progress', 'id', 'validated', 'unchecked', 'comment']);
    this[layerName === 'Remarques' ? 'setVisible' : 'hide'](['delRemark']);
  }

  refreshDropBox(dropBoxName, listOfValues, valueToSelect = this[dropBoxName].getValue()) {
    // by default (valueToSelect = undefined) the value before the refresh is kept
    let selectedIndex = 0;
    let innerHTML = '';
    listOfValues.forEach((element, i) => {
      innerHTML += `<option value='${element}'>${element}</option>`;
      if (element === valueToSelect) {
        selectedIndex = i;
      }
    });
    this[dropBoxName].domElement.children[0].innerHTML = innerHTML;
    this[dropBoxName].__select.options.selectedIndex = selectedIndex;
  }

  resetAlerts() {
    this.editing.alertLayerName = '-';

    if (this.editing.viewer.view.getLayerById('selectedFeature')) {
      this.editing.viewer.view.removeLayer('selectedFeature');
    }
  }
}

export default Controller;
