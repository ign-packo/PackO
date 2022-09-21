/* eslint no-underscore-dangle: ["error", { "allow": [__controllers, __li, __select] }] */

class Controller {
  constructor(menuGlobe) {
    this.menuGlobe = menuGlobe;
  }

  getController(name) {
    let controller = null;
    const controllers = this.menuGlobe.__controllers;
    for (let i = 0; i < controllers.length; i += 1) {
      const c = controllers[i];
      if (c.property === name || c.name === name) {
        controller = c;
        break;
      }
    }
    return controller;
  }

  setBackgroundColor(controllerName, color) {
    this.getController(controllerName).__li.style.backgroundColor = color;
  }

  // setVisible(controllerName) {
  //   const controllers = (typeof controllerName === 'string' || controllerName instanceof String)
  //     ? [controllerName] : controllerName;
  //   controllers.forEach((controller) => {
  //     this.getController(controller).__li.style.display = '';
  //   });
  // }

  // hide(controllerName) {
  //   const controllers = (typeof controllerName === 'string' || controllerName instanceof String)
  //     ? [controllerName] : controllerName;
  //   controllers.forEach((controller) => {
  //     this.getController(controller).__li.style.display = 'none';
  //   });
  // }

  // setPatchCtr(branchName) {
  //   this[branchName !== 'orig' ? 'setVisible' : 'hide'](['polygon', 'undo', 'redo']);
  //   if (process.env.NODE_ENV === 'development') {
  //     this[branchName !== 'orig' ? 'setVisible' : 'hide']('clear');
  //   }
  // }

  // setAlertCtr(layerName) {
  //   this[layerName !== '-' ? 'setVisible' : 'hide'](
  //     ['progress', 'id', 'validated', 'uncheck', 'comment']
  //   );
  //   this[layerName === 'Remarques' ? 'setVisible' : 'hide'](['delRemark']);
  // }

  // setOpiCtr(opiName) {
  //   this[opiName === 'none' ? 'hide' : 'setVisible'](['opiName', 'opiDate', 'opiTime']);
  // }

  // refreshDropBox(dropBoxName, listOfValues,
  //   valueToSelect = this.getController(dropBoxName).getValue()) {
  //   // by default if valueToSelect is not given, the current value will be kept
  //   let selectedIndex = 0;
  //   let innerHTML = '';
  //   listOfValues.forEach((element, i) => {
  //     innerHTML += `<option value='${element}'>${element}</option>`;
  //     if (element === valueToSelect) {
  //       selectedIndex = i;
  //     }
  //   });
  //   this.getController(dropBoxName).domElement.children[0].innerHTML = innerHTML;
  //   this.getController(dropBoxName).__select.options.selectedIndex = selectedIndex;
  // }
}

export default Controller;
