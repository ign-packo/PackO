class Controleur {
  constructor(menuGlobe, saisie) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.saisie = saisie;
  }

  setSaisieController(name) {
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
      this.controllers.polygon = this.menuGlobe.gui.add(this.saisie, 'polygon');
      this.saisie.controllers.polygon = this.controllers.polygon;
      this.controllers.undo = this.menuGlobe.gui.add(this.saisie, 'undo');
      this.controllers.redo = this.menuGlobe.gui.add(this.saisie, 'redo');
      if (process.env.NODE_ENV === 'development') this.controllers.clear = this.menuGlobe.gui.add(this.saisie, 'clear');
    }
  }
}
export default Controleur;
