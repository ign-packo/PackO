/* eslint no-underscore-dangle: ["error", { "allow": [__controllers, __li, __select] }] */

class Controller {
  constructor(menuGlobe) {
    this.menuGlobe = menuGlobe;
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
    this[layerName !== ' -' ? 'setVisible' : 'hide'](['progress', 'id', 'validated', 'unchecked', 'comment']);
    this[layerName === 'Remarques' ? 'setVisible' : 'hide'](['delRemark']);
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
}
export default Controller;
