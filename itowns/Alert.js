class Alert {
  constructor(branch) {
    this.branch = branch;
    this.viewer = this.branch.viewer;
    this.api = this.viewer.api;

    this.reset();
  }

  reset() {
    this.layerName = ' -';
    this.featureCollection = null;
    this.featureIndex = null;

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

  uncheck() {
    const featureSelectedGeom = this.featureCollection.features[0].geometries[this.featureIndex];
    if (featureSelectedGeom.properties.status === true) {
      this.viewer.message = 'alerte déjà validée';
    } else if (featureSelectedGeom.properties.status === false) {
      this.postValue(featureSelectedGeom.properties.id, 'status', null);

      this.nbChecked -= 1;
      this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
    }
  }

  selectPrevious(option = { unviewed: false }) {
    const { geometries } = this.featureCollection.features[0];
    let { featureIndex } = this;
    featureIndex -= 1;
    if (featureIndex === -1) featureIndex = this.nbTotal - 1;

    while (option.unviewed === true
      && geometries[featureIndex].properties.status !== null
      && featureIndex !== this.featureIndex) {
      featureIndex -= 1;
      if (featureIndex === -1) featureIndex = this.nbTotal - 1;
    }
    // this.featureIndex = featureIndex;
    this.changeFeature(featureIndex, option);
  }

  selectNext(option = { unviewed: false }) {
    const { geometries } = this.featureCollection.features[0];
    let { featureIndex } = this;
    featureIndex += 1;
    if (featureIndex === this.nbTotal) featureIndex = 0;

    while (option.unviewed === true
      && geometries[featureIndex].properties.status !== null
      && featureIndex !== this.featureIndex) {
      featureIndex += 1;
      if (featureIndex === this.nbTotal) featureIndex = 0;
    }
    // this.featureIndex = featureIndex;
    this.changeFeature(featureIndex, option);
  }

  selectLastViewed(option) {
    const { geometries } = this.featureCollection.features[0];
    let featureIndex = 0;
    if (geometries[featureIndex].properties.status !== null) {
      while (featureIndex < this.nbTotal
      && geometries[featureIndex].properties.status !== null) {
        featureIndex += 1;
      }
      featureIndex -= 1;
    }
    // this.featureIndex = featureIndex;
    this.changeFeature(featureIndex, option);
  }

  changeFeature(featureIndex, option = { centerOnFeature: false }) {
    this.featureIndex = featureIndex;
    const featureSelectedGeom = this.featureCollection.features[0].geometries[this.featureIndex];
    if (featureSelectedGeom.properties.status === null) {
      this.postValue(featureSelectedGeom.properties.id, 'status', false);
      this.nbChecked += 1;
      this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
    }
    this.viewer.view.dispatchEvent({
      type: 'alert-selected',
      option,
      featureCenter: featureSelectedGeom.extent.clone()
        .applyMatrix4(this.featureCollection.matrixWorld).center(),
    });
  }

  async selectFeatureAt(mouseOrEvt) {
    if (this.layerName !== ' -') {
      const layerAlert = this.viewer.view.getLayerById(this.layerName);
      const features = this.viewer.view.pickFeaturesAt(mouseOrEvt, 5, layerAlert.id);

      if (features[layerAlert.id].length > 0) {
        this.featureCollection = await layerAlert.source.loadData(undefined, layerAlert);
        const alertFC = this.featureCollection;

        for (let i = 0; i < this.nbTotal; i += 1) {
          if (alertFC.features[0].geometries[i] === features[layerAlert.id][0].geometry) {
            this.changeFeature(i);
          }
        }
      }
    }
  }
}

export default Alert;
