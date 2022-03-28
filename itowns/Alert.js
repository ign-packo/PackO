class Alert {
  constructor(viewer) {
    this.viewer = viewer;
    this.api = this.viewer.api;

    this.reset();
  }

  reset() {
    this.layerName = '-';

    this.featureCollection = null;
    this.featureIndex = null;

    this.nbChecked = 0;
    this.nbTotal = 0;
    this.nbValidated = 0;
    this.progress = 0;
  }

  uncheck() {
    const featureSelectedGeom = this.featureCollection.features[0].geometries[this.featureIndex];
    if (featureSelectedGeom.properties.status === true) {
      this.viewer.message = 'alerte déjà validée';
    } else if (featureSelectedGeom.properties.status === false) {
      // this.postValue(featureSelectedGeom.properties.id, 'status', null);
      this.api.updateAlert(featureSelectedGeom.properties.id, 'status', null)
        .then(() => {
          this.nbChecked -= 1;
          this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
          featureSelectedGeom.properties.status = null;

          this.viewer.view.refresh([this.layerName]);
        })
        .catch(() => {
          this.viewer.message = 'PB with updating the database';
          const err = new Error('Feature.status NOT modified');
          err.name = 'Database Error';
          this.viewer.view.dispatchEvent({
            type: 'error',
            msg: err,
          });
        });
    }
  }

  setValidation(value) {
    const featureSelectedGeom = this.featureCollection.features[0].geometries[this.featureIndex];
    // this.postValue(featureSelectedGeom.properties.id, 'status', value);
    this.api.updateAlert(featureSelectedGeom.properties.id, 'status', value)
      .then(() => {
        if (value === true) {
          this.nbValidated += 1;
          if (featureSelectedGeom.properties.status === null) {
            this.nbChecked += 1;
          }
        } else {
          this.nbValidated -= 1;
        }
        this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
        featureSelectedGeom.properties.status = value;

        this.viewer.view.refresh([this.layerName]);
      })
      .catch(() => {
        this.viewer.message = 'PB with updating the database';
        const err = new Error('Feature.status NOT modified');
        err.name = 'Database Error';
        this.viewer.view.dispatchEvent({
          type: 'error',
          msg: err,
        });
      });
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
    if (featureIndex !== this.featureIndex) {
      const promises = [];
      this.featureIndex = featureIndex;
      const featureSelectedGeom = this.featureCollection.features[0].geometries[this.featureIndex];
      if (featureSelectedGeom.properties.status === null) {
        promises.push(this.api.updateAlert(featureSelectedGeom.properties.id, 'status', false));
        this.nbChecked += 1;
        this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
      }
      Promise.all(promises)
        .then(() => {
          if (promises.length === 1) {
            featureSelectedGeom.properties.status = false;
          }
          this.id = featureIndex;
          this.validated = featureSelectedGeom.properties.status;
          this.comment = featureSelectedGeom.properties.comment;
          this.viewer.view.dispatchEvent({
            type: 'alert-selected',
            option,
            layerName: this.layerName,
            id: featureSelectedGeom.properties.id,
            // featureIndex,
            // properties: featureSelectedGeom.properties,
            featureCenter: featureSelectedGeom.extent.clone()
              .applyMatrix4(this.featureCollection.matrixWorld).center(),
          });
        })
        .catch(() => {
          this.nbChecked -= 1;
          this.progress = `${this.nbChecked}/${this.nbTotal} (${this.nbValidated} validés)`;
          this.viewer.message = 'PB with updating the database';
          const err = new Error('Feature.status NOT modified');
          err.name = 'Database Error';
          this.viewer.view.dispatchEvent({
            type: 'error',
            msg: err,
          });
        });
    }
  }

  async selectFeatureAt(mouseOrEvt) {
    if (this.layerName !== '-') {
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
