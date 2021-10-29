class Controller {
  constructor(menuGlobe, editing) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.editing = editing;
  }

  setEditingController(name) {
    if (this.controllers.polygon) {
      this.controllers.polygon.remove();
      delete this.controllers.polygon;
    }
    if (this.controllers.undo) {
      this.controllers.undo.remove();
      delete this.controllers.undo;
    }
    if (this.controllers.redo) {
      this.controllers.redo.remove();
      delete this.controllers.redo;
    }
    if (this.controllers.clear) {
      this.controllers.clear.remove();
      delete this.controllers.clear;
    }
    if (name !== 'orig') {
      this.controllers.polygon = this.menuGlobe.gui.add(this.editing, 'polygon');
      this.editing.controllers.polygon = this.controllers.polygon;
      this.controllers.undo = this.menuGlobe.gui.add(this.editing, 'undo');
      this.controllers.redo = this.menuGlobe.gui.add(this.editing, 'redo');
      if (process.env.NODE_ENV === 'development') this.controllers.clear = this.menuGlobe.gui.add(this.editing, 'clear');
    }
  }

  refreshDropBox(list) {
    let innerHTML = '';
    list.forEach((element) => {
      innerHTML += `<option value='${element}'>${element}</option>`;
    });
    this.alert.domElement.children[0].innerHTML = innerHTML;
    // this.editing.alert = value;
    this.alert.updateDisplay();
  }
}
export default Controller;
