class Controller {
  constructor(menuGlobe, editing) {
    this.controllers = {};
    this.menuGlobe = menuGlobe;
    this.editing = editing;

    this.layersTable = document.getElementById('layersTable');
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

  setLayerGUI(branch) {
    this.layersTable = document.getElementById('layersTable');
    for (let i = this.layersTable.rows.length - 1; i >= 0; i -= 1) {
      this.layersTable.deleteRow(i);
    }

    const layersBtn = document.getElementById('layers');
    if (branch.vectorList.length > 0) {
      layersBtn.style.visibility = 'visible';
    } else {
      layersBtn.style.visibility = 'hidden';
      document.getElementById('layersGUI').style.visibility = 'hidden';
    }

    branch.vectorList.forEach((element) => {
      this.addLayerInGUI(element);
      // const ligne = this.layersTable.insertRow(-1);
      // const colonne1 = ligne.insertCell(0);
      // colonne1.innerHTML = element.name;
      // const colonne2 = ligne.insertCell(1);
      // colonne2.innerHTML = JSON.parse(element.style_itowns).fill.color;
      // const colonne3 = ligne.insertCell(2);
      // colonne3.innerHTML = `<button id=suppLayer layerid=${element.id}>X</button>`;
    });
  }

  addLayerInGUI(layer) {
    const ligne = this.layersTable.insertRow(-1);
    const colonne1 = ligne.insertCell(0);
    colonne1.innerHTML = layer.name;
    const colonne2 = ligne.insertCell(1);
    colonne2.innerHTML = JSON.parse(layer.style_itowns).fill.color;
    const colonne3 = ligne.insertCell(2);
    colonne3.innerHTML = `<button id=suppLayer layerid=${layer.id}>X</button>`;
  }
}
export default Controller;
