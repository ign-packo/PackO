class Alert {
  constructor(viewer) {
    this.viewer = viewer;
    this.api = this.viewer.api;

    this.layerName = null;
    this.alertFC = null;

    this.nbChecked = 0;
    this.nbTotal = 0;
    this.nbValidated = 0;
    this.progress = 0;
  }

  postValue(idFeature, variable, value) {
    this.api.updateAlert(idFeature, variable, value)
      .then(() => {
        // this.viewer.refresh({ [this.alertLayerName]: this.branch.layers[this.alertLayerName] });
        this.viewer.refresh({ [this.layerName]: this.branch.layers[this.layerName] });
        this.alertFC.features[0].geometries[this.featureIndex].properties[variable] = value;
      })
      .catch((error) => {
        console.log(error);
        this.viewer.message = 'PB with updating the database';
        this.viewer.view.dispatchEvent({
          type: 'error',
          msg: error,
        });
      });
  }
}

export default Alert;
