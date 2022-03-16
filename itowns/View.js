import * as itowns from 'itowns';
import * as THREE from 'three';

let alertUncheckedColor = '';
let alertCheckedColor = '';
let alertValidatedColor = '';

Array.from(document.styleSheets).forEach((sheet) => {
  Array.from(sheet.cssRules).forEach((rule) => {
    if (rule.selectorText === '.alertUnchecked') {
      alertUncheckedColor = rule.style.color;
    } else if (rule.selectorText === '.alertChecked') {
      alertCheckedColor = rule.style.color;
    } else if (rule.selectorText === '.alertValidated') {
      alertValidatedColor = rule.style.color;
    }
  });
});

function coloringAlerts(properties) {
  if (properties.status === false) {
    return alertCheckedColor;
  }
  if (properties.status === true) {
    return alertValidatedColor;
  }
  return alertUncheckedColor;
}

class View extends itowns.PlanarView {
  constructor(viewerDiv, overviews, dezoomInitial) {
    const zoomFactor = 2;// customizable

    // Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
    const crs = `${overviews.crs.type}:${overviews.crs.code}`;
    if (crs !== 'EPSG:4326' && overviews.crs.proj4Definition) {
      itowns.CRS.defs(crs, overviews.crs.proj4Definition);
    } else {
      throw new Error('EPSG proj4.defs not defined in overviews.json');
    }
    // limite du crs
    const xOrigin = overviews.crs.boundingBox.xmin;
    const yOrigin = overviews.crs.boundingBox.ymax;

    const { resolution } = overviews;
    const resolutionLv0 = resolution * 2 ** overviews.level.max;
    const extent = new itowns.Extent(
      crs,
      xOrigin, xOrigin + (overviews.tileSize.width * resolutionLv0),
      yOrigin - (overviews.tileSize.height * resolutionLv0), yOrigin,
    );

    // limite du dataSet
    const xmin = overviews.dataSet.boundingBox.LowerCorner[0];
    const xmax = overviews.dataSet.boundingBox.UpperCorner[0];
    const ymin = overviews.dataSet.boundingBox.LowerCorner[1];
    const ymax = overviews.dataSet.boundingBox.UpperCorner[1];

    const resolInit = resolution * 2 ** dezoomInitial;
    const x0 = (xmin + xmax) * 0.5;
    const y0 = (ymin + ymax) * 0.5;
    const placement = new itowns.Extent(
      crs,
      x0 - viewerDiv.clientWidth * resolInit * 0.5,
      x0 + viewerDiv.clientWidth * resolInit * 0.5,
      y0 - viewerDiv.clientHeight * resolInit * 0.5,
      y0 + viewerDiv.clientHeight * resolInit * 0.5,
    );

    const levelMax = overviews.dataSet.level.max;
    const levelMin = overviews.dataSet.level.min;
    // par défaut, on autorise un sur-ech x2 et on affiche un niveau
    // de plus que la plus faible résolution du cache
    // ce n'est pas très performant mais c'est demandé par les utilisateurs
    // on ajoute 1cm de marge pour éviter les erreurs d'arrondi sur le calcul de la résolution
    // avec le view.getPixelsToMeters() d'iTowns
    const resolLvMax = resolution * 2 ** (overviews.level.max - levelMax - 1) - 0.01;
    const resolLvMin = resolution * 2 ** (overviews.level.max - levelMin) + 0.01;

    // Instanciate PlanarView
    super(viewerDiv, extent, {
      camera: {
        type: itowns.CAMERA_TYPE.ORTHOGRAPHIC,
      },
      placement,
      maxSubdivisionLevel: levelMax,
      minSubdivisionLevel: levelMin,
      controls: {
        enableSmartTravel: false,
        zoomFactor,
        maxResolution: resolLvMax,
        minResolution: resolLvMin,
      },
    });

    this.viewerDiv = viewerDiv;
    this.overviews = overviews;

    this.crs = crs;
    this.x0 = x0;
    this.y0 = y0;
    this.resolution = overviews.resolution;
    this.resolLvMax = resolLvMax;
    this.resolLvMin = resolLvMin;
    this.dezoomInitial = dezoomInitial;

    this.layerIndex = {
      Ortho: 1,
      Opi: 2,
      Graph: 0,
      Contour: 3,
      Patches: 4,
    };
    this.oldStyle = {};

    // on ajoute les dataset.limits pour les layers graph/contour
    // avec uniquement les niveaux correspondants au COG mis à jour par les patchs
    // c'est-a-dire un seul niveau de COG
    // on a donc besoin de connaitre le nombre de niveaux inclus dans un COG
    const slabSize = Math.min(overviews.slabSize.width, overviews.slabSize.height);
    const nbSubLevelsPerCOG = Math.floor(Math.log2(slabSize));
    this.overviews.dataSet.limitsForGraph = {};
    // on copie les limites des (nbSubLevelsPerCOG + 1) derniers niveaux
    for (let l = overviews.dataSet.level.max - nbSubLevelsPerCOG;
      l <= overviews.dataSet.level.max; l += 1) {
      this.overviews.dataSet.limitsForGraph[l] = overviews.dataSet.limits[l];
    }
    this.lvlMinPatch = overviews.dataSet.level.max - nbSubLevelsPerCOG;
    // pour la fonction updateScaleWidget
    this.maxGraphDezoom = 2 ** nbSubLevelsPerCOG;
  }

  cleanUpExtraLayers(menuGlobe) {
    // Clean up of all the extra layers
    const listColorLayer = this.getLayers((l) => l.isColorLayer).map((l) => l.id);
    listColorLayer.forEach((layerName) => {
      if (!['Ortho', 'Opi', 'Graph', 'Contour', 'Patches'].includes(layerName)) {
        this.removeLayer(layerName);
        menuGlobe.removeLayersGUI(layerName);
        delete this.layerIndex[layerName];
      }
    });
  }

  refresh(layerList) {
    const layerNames = [];
    layerList.forEach((layer) => {
      layerNames.push(typeof layer === 'string' ? layer : layer.name);
    });

    layerNames.forEach((layerName) => {
      let newLayer;
      let config = {};

      if (this.getLayerById(layerName)) {
        // la couche existe avant le refresh

        newLayer = this.getLayerById(layerName);
        config = {
          source: newLayer.source,
          transparent: newLayer.transparent,
          // opacity: newLayer.opacity,
          style: newLayer.style,
          zoom: newLayer.zoom,
        };

        if (newLayer.source.isVectorSource) {
          // Attendre itowns pour evolution ?
          config.source = new itowns.FileSource({
            url: newLayer.source.url,
            fetcher: itowns.Fetcher.json,
            crs: newLayer.source.crs,
            parser: itowns.GeoJsonParser.parse,
          });

          if (this.oldStyle[layerName]) {
            config.style = this.oldStyle[layerName];
          }
          if (newLayer.isAlert === true) {
            this.oldStyle[layerName] = newLayer.style.clone();
            /* eslint-disable no-param-reassign */
            config.style.fill.color = coloringAlerts;
            config.style.point.color = coloringAlerts;
            config.style.stroke.color = coloringAlerts;
            /* eslint-enable no-param-reassign */
          }
        }
        this.removeLayer(layerName);
      } else {
        // nouvelle couche
        [newLayer] = layerList.filter((l) => l.name === layerName);
        if (newLayer.type === 'raster') {
          config.source = new itowns.WMTSSource({
            url: newLayer.url,
            crs: newLayer.crs ? newLayer.crs : this.crs,
            format: 'image/png',
            name: layerName !== 'Contour' ? layerName.toLowerCase() : 'graph',
            tileMatrixSet: this.overviews.identifier,
            tileMatrixSetLimits:
              (layerName === 'Contour') || (layerName === 'Graph')
                ? this.overviews.dataSet.limitsForGraph : this.overviews.dataSet.limits,
          });
        } else if (newLayer.type === 'vector') {
          config.source = new itowns.FileSource({
            url: newLayer.url,
            fetcher: itowns.Fetcher.json,
            crs: newLayer.crs ? newLayer.crs : this.crs,
            parser: itowns.GeoJsonParser.parse,
          });

          config.style = new itowns.Style(newLayer.style);
          config.zoom = {
            // min: this.overviews.dataSet.level.min,
            min: layerName === 'Patches' ? this.lvlMinPatch : this.overviews.dataSet.level.min,
            max: this.overviews.dataSet.level.max,
          };
        }

        if (this.layerIndex[layerName] === undefined) {
          this.layerIndex[layerName] = Math.max(...Object.values(this.layerIndex)) + 1;
        }
      }

      // Dans les 2 cas
      config.opacity = newLayer.opacity;
      const colorLayer = new itowns.ColorLayer(
        layerName,
        config,
      );

      colorLayer.visible = newLayer.visible;

      if (layerName === 'Contour') {
        colorLayer.effect_type = itowns.colorLayerEffects.customEffect;
        colorLayer.effect_parameter = 1.0;
        colorLayer.magFilter = THREE.NearestFilter;
        colorLayer.minFilter = THREE.NearestFilter;
      }

      this.addLayer(colorLayer);

      if (colorLayer.vectorId === undefined) {
        colorLayer.vectorId = newLayer.vectorId;
      }
      if (colorLayer.isAlert === undefined) {
        colorLayer.isAlert = newLayer.isAlert;
      }

      // this.addLayer(colorLayer);

      itowns.ColorLayersOrdering.moveLayerToIndex(
        this,
        layerName,
        this.layerIndex[layerName] === undefined
          ? Math.max(...Object.values(this.layerIndex)) + 1 : this.layerIndex[layerName],
      );
    });
  }

  removeVectorLayer(layerName) {
    if (layerName === undefined) return;
    const layerId = this.getLayerById(layerName).vectorId;
    this.removeLayer(layerName);
    delete this.layerIndex[layerName];
    this.dispatchEvent({
      type: 'vectorLayer-removed',
      layerId,
      layerName,
    });
  }

  highlightSelectedFeature(alert) {
    const alertFC = alert.featureCollection;
    const featureGeometry = alertFC.features[0].geometries[alert.featureIndex];
    const { type } = alertFC.features[0];
    const layerFeatureSelected = this.getLayerById('selectedFeature');
    if (layerFeatureSelected) {
      this.removeLayer('selectedFeature');
    }
    const layerTest = this.getLayerById(alert.layerName);
    const newFeatureCollec = new itowns.FeatureCollection(layerTest);

    const feature = alertFC.requestFeatureByType(type);
    const newFeature = newFeatureCollec.requestFeatureByType(type);
    const newFeatureGeometry = newFeature.bindNewGeometry();

    const coord = new itowns.Coordinates(newFeatureCollec.crs, 0, 0, 0);

    const vector = new THREE.Vector2();
    const vector3 = new THREE.Vector3();
    const { count, offset } = featureGeometry.indices[0];

    newFeatureGeometry.startSubGeometry(count, newFeature);
    const { vertices } = feature;
    for (let v = offset * 2; v < (offset + count) * 2; v += 2) {
      vector.fromArray(vertices, v);
      vector3.copy(vector).setZ(0).applyMatrix4(alertFC.matrixWorld);
      coord.x = vector3.x;
      coord.y = vector3.y;
      newFeatureGeometry.pushCoordinates(coord, newFeature);
    }

    newFeatureGeometry.updateExtent();

    const newColorLayer = new itowns.ColorLayer('selectedFeature', {
      // Use a FileSource to load a single file once
      source: new itowns.FileSource({
        features: newFeatureCollec,
      }),
      transparent: true,
      opacity: 0.7,
      zoom: {
        min: this.overviews.dataSet.level.min,
        max: this.overviews.dataSet.level.max,
      },
      style: new itowns.Style({
        stroke: {
          color: 'yellow',
          width: 5,
        },
        point: {
          color: '#66666600',
          radius: 7,
          line: 'yellow',
          width: 5,
        },
      }),
    });

    this.addLayer(newColorLayer);
  }
}
export default View;
