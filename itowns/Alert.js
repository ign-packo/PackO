class Alert {
  constructor(branch) {
    this.branch = branch;
    this.viewer = this.branch.viewer;
    this.api = this.viewer.api;

    this.layerName = ' -';
    this.featureCollection = null;
    this.featureIndex = 0;

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
        this.featureCollection.features[0]
          .geometries[this.featureIndex].properties[variable] = value;
      })
      .catch(() => {
        this.viewer.message = 'PB with updating the database';
        const err = new Error(`Feature.${variable} NOT modified`);
        err.name = 'Database Error';
        this.viewer.view.dispatchEvent({
          type: 'error',
          msg: err,
        });
      });
  }
}

export default Alert;
