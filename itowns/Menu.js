/* global GuiTools */
class Menu extends GuiTools {
  constructor(viewerDiv, view) {
    super(viewerDiv.id, view);

    this.gui.width = 300;
    this.colorGui.show();
    this.colorGui.open();
    this.vectorGui = this.gui.addFolder('Extra Layers');
    this.vectorGui.open();

    view.addEventListener('layers-order-changed', ((ev) => {
      for (let i = 0; i < ev.new.sequence.length; i += 1) {
        const colorLayer = view.getLayerById(ev.new.sequence[i]);

        this.removeLayersGUI(colorLayer.id);
        this.addImageryLayerGUI(colorLayer);
      }
    }));
  }

  addImageryLayerGUI(layer) {
    /* eslint-disable no-param-reassign */
    let typeGui = 'colorGui';
    if (!['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].includes(layer.id)) {
      typeGui = 'vectorGui';
    }
    if (this[typeGui].hasFolder(layer.id)) { return; }

    const folder = this[typeGui].addFolder(layer.id);
    folder.add({ visible: layer.visible }, 'visible').onChange(((value) => {
      layer.visible = value;

      this.view.notifyChange(layer);
    }));
    folder.add({ opacity: layer.opacity }, 'opacity').min(0.001).max(1.0).onChange(((value) => {
      layer.opacity = value;
      this.view.notifyChange(layer);
    }));
    // Patch pour ajouter la modification de l'epaisseur des contours dans le menu
    if (layer.effect_parameter) {
      folder.add({ thickness: layer.effect_parameter }, 'thickness').min(0.5).max(5.0).onChange(((value) => {
        layer.effect_parameter = value;
        this.view.notifyChange(layer);
      }));
    }
    if (typeGui === 'vectorGui' && layer.id !== 'Remarques' && layer.isAlert === false) {
      folder.add(this.view, 'removeVectorLayer').name('delete').onChange(() => {
        if (layer.isAlert === false) {
          this.view.removeVectorLayer(layer.id);
          this.removeLayersGUI(layer.id);
        }
        // } else {
        //   // eslint-disable-next-line no-underscore-dangle
        //   this.gui.__controllers.filter((controller) => {
        //  // controller.property === 'message')[0].setValue('Couche en edition');
        //   // this.viewer.message = 'Couche en edition';
        // }
      });
    }
  /* eslint-enable no-param-reassign */
  }

  removeLayersGUI(nameLayer) {
    if (this.colorGui.hasFolder(nameLayer)) {
      this.colorGui.removeFolder(nameLayer);
    } else {
      this.vectorGui.removeFolder(nameLayer);
    }
  }
}

export default Menu;
