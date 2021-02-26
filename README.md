# PackO
developpement pour le controle et la retouche du mosaiquage.

3 modules :
- une API
- un client web
- un code python pour la création et mise à jour du cache

## API

### Pour installer et lancer le service

La commande classique avec NodeJs:
```shell
npm install
```

Préparer le client web:
- en mode production
```shell
npm run build
```
- en mode développement (avec le menu "clear")
```shell
npm run build-dev
``` 

Ensuite on peut lancer l'API, la doc et l'interface web
- en mode production
```shell
npm start -- -c mon_cache
```
- en mode développement (qui autorise la route "clear")
```shell
npm start-dev -- -c mon_cache 
```

L'interface web est alors accesible à l'adresse : http://[serveur]:[port]/itowns

par defaut serveur= localhost et port = 8081

La doc de l'API est publiée directement par le service et est disponible à l'adresse : http://[serveur]:[port]/doc

### Principe de fonctionnement

Ce service propose: 

- un flux WMTS standard pour les couches ortho et graph
- un flux WMTS permettant d'accéder aux OPI: ce flux est déclaré comme une couche unique (opi) et on utilise un paramètre de dimension pour choisir le cliché à afficher. Attention, il faut normalement déclarer explicitement toutes les valeurs de dimension dans le GetCapabilties: cela ne va pas être possible de déclarer toutes les clichés. Il va falloir trouver une astuce... 
- une commande permettant de modifier le graphe en donnant: un geojson + une référence de cliché


### Notes

Import du shp de graphe:
```bash
createdb pcrs
psql -d pcrs -c 'create extension postgis'
shp2pgsql /Volumes/PAOT\ 21/ZoneTestPCRS/Graphe/Graphe_PCRS56_ZONE_TEST.shp | psql -d pcrs
psql -d pcrs -c "SELECT UpdateGeometrySRID('graphe_pcrs56_zone_test','geom',2154)"
```

## Client web (uniquement si on souhaite le lancer séparément)

### Installation et lancement

dans le dossier ./itowns
```shell
npm install
```

En phase de développement on lance le service avec :

```shell
npm start
```
qui permettra un redémarrage du serveur automatique à chaque modification de fichier

En production il faut exécuter :
```shell
npm run build
```

### Principe de fonctionnement

Fournir à travers un navigateur web :
- une consultation des données ortho
- des outils de retouche du graph de mosaiquage

