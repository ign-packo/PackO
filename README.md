# PackO

Outil pour le contrôle et la retouche du mosaïquage, sous licence CECILL-B (voir [LICENSE.md](LICENSE.md)).

4 modules :
- une BD Postgis
- une API
- un client web
- un code python pour la création et mise à jour du cache

## BD

Une base de données est utilisée pour stocker les métadonnées des caches (liste des OPI avec leur date, nom, couleur, ...) ainsi que l'historique sur chaque branche (liste des patches).

La structure de cette base :
![BD Packo](doc/BD_packo.drawio.png)

Il est nécessaire d'avoir un PostGIS version 3.0 au minimum. 

La base de donnée doit être créée avant le lancement de l'API :
```
psql -c "CREATE DATABASE packo"
psql -d packo -f sql/packo.sql
```

## API

### Pour installer et lancer le service

La commande classique avec NodeJs :
```shell
npm install
```

Préparer le client web :
- en mode production
```shell
npm run build
```
- en mode développement (avec le menu "clear")
```shell
npm run build-dev
``` 

Ensuite on peut lancer l'API, la doc et l'interface web en spécifiant un port (par défaut le service sera lancé sur le port 8081). Il est possible de le lancer en mode **simple** avec une seule instance ou en mode **cluster** avec plusieurs instances pour exploiter plusieurs coeurs sur le serveur.

Le mode **simple** :

- en mode production
```shell
npm start -- -p [port]
```
- en mode développement (qui autorise la route "clear")
```shell
npm run start-dev -- -p [port]
```

Le mode **cluster** :

Dans ce mode, on utilise le module **[PM2](https://pm2.keymetrics.io/)** pour piloter le lancement de plusieurs instances de l'API et la répartition du traitement des requêtes entre ces différentes instances. Cela permet donc d'avoir un serveur plus réactif et rapide, même lorsqu'il y a des requêtes longues et/ou plusieurs utilisateurs.

Dans ce cas, on décrit la configuration (nombre de coeurs, variable d'environement, etc...) dans un fichier **ecosystem.config.js**. Un exemple de fichier de configuration est inclus dans le dossier **ressources**  du projet. Si on le copie à la racine, il permet de lancer un cluster nommé **packo** qui exploite par défaut tous les coeurs de la machine.

Comme dans le cas d'un **npm run start** l'application utilisera les variables d'environnement du système pour connaitre l'adresse du serveur PostGis, l'utilisateur, le mot de passe et le nom de la base (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).

Pour définir le port utilisé par l'API, il faut éditer le paramètre **args** dans le fichier **ecosystem.config.js** : dans l'exemple qui est fourni dans le dossier **ressources** on utilise le port 8081 :

````
module.exports = {
  apps: [{
    name: 'packo',
    script: 'serveur.js',
    args: '-p 8081',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    env_development: {
      NODE_ENV: 'development',
    }
  }],
};
````


Pour choisir si on travaille en mode **production** ou en mode **development** (qui autorise la route **clear**), on peut spécifier l'environnement à utiliser dans la ligne de commande.

Par exemple, on peut :

- lancer les instances de l'API en mode **production** (le mode par défaut) avec la commande :
```
npx pm2 start
````

- lancer les instances de l'API en mode **development** avec la commande :
```
npx pm2 start --env development
````

- suivre l'état et l'utilisation de ces instances avec la commande :
```
npx pm2 monit
````

- arrêter toutes les instances avec la commande :
```
npx pm2 delete packo
```

Dans les deux cas (mode **simpe** ou **multi coeurs**), l'interface web est alors accesible à l'adresse : http://[serveur]:[port]/itowns/?serverapi=[serveur]&portapi=[port]&namecache=[namecache]

par défaut :

- serveur : localhost
- port : 8081
- serverapi : la même valeur que le serveur
- portapi : la même valeur que le port
- namecache : pas de valeur par défaut, mais si le paramètre n'est pas renseigné ou si il est mal renseigné, choisir un cache dans la liste des caches disponibles

La doc de l'API est publiée directement par le service et est disponible à l'adresse : http://[serveur]:[port]/doc

Attention, l'API utilise une version de GDAL pour la lecture et la création des images du cache. Si une version de GDAL est déjà présente sur la machine, il peut y avoir des problèmes avec la variable d'environnement **PROJ_LIB** qui indique l'emplacement du dossier qui contient la définition des systèmes de coordonnées. Dans ce cas, l'API va signaler une erreur lors de l'application d'une retouche (erreur visible dans la console côté serveur et dans l'interface iTowns côté client). Si cela se produit, il faut supprimer la variable d'environnement **PROJ_LIB** avant de lancer l'API.
Sous MacOS ou Linux, cela peut être fait avec la commande :
```
unset PROJ_LIB
```
Sous Windows :
```
SET PROJ_LIB=
```


### Principe de fonctionnement

Ce service propose: 

- un flux WMTS standard pour les couches ortho et graph
- un flux WMTS permettant d'accéder aux OPI : ce flux est déclaré comme une couche unique (opi) et on utilise un paramètre de dimension pour choisir le cliché à afficher.
- une commande permettant de modifier le graphe en donnant : un geojson + une référence de cliché

Pour le flux WMTS de l'Ortho et des OPI, il est possible de choisir entre RVB, IR ou IRC en spécifiant le style (normal ou RVB pour avoir la couleur, IR pour l'infrarouge seul et IRC pour l'infrarouge coloré). Attention, lorsque le flux demandé n'est pas disponible (par exemple l'IR), la réponse est une image noire.

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
- des outils de retouche du graphe de mosaïquage

## Préparation d'un cache

Un cache PackO se crée à partir d'un graphe de mosaiquage initial (sous forme d'un GeoPackage ou d'une BD) ainsi qu'un dossier contenant les OPI dans un format supporté par GDAL avec leur géoréférencement.

Pour les gros caches, il est préférable de créer une BD à partir du fichier Shapefile, cela peut être fait avec la commande **shp2pgsql**. Il est important de vérifier que le code de projection a bien été renseigné dans la base. Par exemple :
```bash
createdb bd_graphe
psql -d bd_graphe -c 'create extension postgis'
shp2pgsql graphe.shp | psql -d bd_graphe
psql -d bd_graphe -c "SELECT UpdateGeometrySRID('graphe','geom',2154)"
```

PackO peut gérer des images 3 canaux (RGB), 3 + 1 canaux (RGB + IR) ou 1 canal (IR). Attention : toutes les OPI du cache doivent avoir le même type (RGB, IR ou RGB+IR).

Le graphe en entrée doit contenir les métadonnées de date et heure de prise de vue pour chaque image :
- champ DATE avec les données sous le format : *yyyy/mm/dd* ou *yyyy-mm-dd*
- champ HEURE_TU avec format attendu : *HHhMM* (example : 10h45) ou *HH:MM* (example : 10:45)
Si ces champs ne sont pas renseignés, une option permet de lancer le calcul sans les métadonnées (voir plus bas). Dans ce cas, les valeurs seront mises à des valeurs fictives DATE: "1900-01-01", HEURE_TU: "00:00".

Le nom de la table du graphe ne doit pas commencer par un caractère numérique.

La création du cache est faite à l'aide du script **create_cache.py** :
- par défaut, l'option 'running' est à 0, on génère seulement un fichier JSON compatible avec le service gpao de l'IGN, service qui va ensuite lancer la création du cache (multi-threads, mono-machine)
- le mode calcul en local ('running' > 0) permet de lancer la création du cache directement
````
usage: create_cache.py [-h] [-R RGB] [-I IR] [-c CACHE] [-o OVERVIEWS] [-g GRAPH] [-t TABLE] 
                       [-p PROCESSORS] [-r RUNNING] [-s SUBSIZE] [-z ZEROMTD] [-v VERBOSE]

options:
  -h, --help            show this help message and exit
  -R RGB, --rgb RGB     input RGB OPI pattern
  -I IR, --ir IR        input IR OPI pattern
  -c CACHE, --cache CACHE
                        cache directory (default: cache)
  -o OVERVIEWS, --overviews OVERVIEWS
                        params for the mosaic (default: ressources/RGF93_LA93_5cm.json)
  -g GRAPH, --graph GRAPH
                        GeoPackage filename or database connection string 
                        ("PG:host=localhost user=postgres password=postgres dbname=demo")
  -t TABLE, --table TABLE
                        graph table (default: graphe_pcrs56_zone_test)
  -p PROCESSORS, --processors PROCESSORS
                        number of processing units to allocate (default: Max_cpu-1)
  -r RUNNING, --running RUNNING
                        launch the process locally (default: 0, meaning no process launching, 
                        only GPAO project file creation)
  -s SUBSIZE, --subsize SUBSIZE
                        size of the subareas for data processing, in slabs 
                        (default: 2, meaning 2x2 slabs)
  -z ZEROMTD, --zeromtd ZEROMTD
                        allow input graph with no metadata (default: 0, metadata needed)
  -v VERBOSE, --verbose VERBOSE
                        verbose (default: 0, meaning no verbose)
````


Ce script nécessite deux modules : numpy et gdal (version au moins 3.2). Par exemple, sous Linux, on peut les installer avec les commandes :
````
python -m pip install --upgrade pip
pip install numpy
pip install --global-option=build_ext --global-option="-I/usr/include/gdal" GDAL==`gdal-config --version`
````

Par exemple, pour créer un cache à partir des données incluses dans le dossier **regress**, on peut utiliser la commande suivante depuis la racine du dépôt PackO :
````
python scripts/create_cache.py -R "regress/data/RGB/*.tif" -I "regress/data/IR/*.tif" -o ressources/RGF93_LA93_5cm.json -c cache_regress_RGBIR -g "regress/data/regress_graphe.gpkg" -t graphe
````

Ce script fonctionne en deux phases :

- on découpe les OPI en dalles respectant une pyramide TMS que l'on stocke sous forme de COG
- on rasterise le graphe de mosaiquage et on exporte pour chaque dalle un COG de graphe (image de graphe avec une couleur par OPI) et un COG de l'ortho assemblée

Le script permet d'obtenir trois arborescences de COG (graph/opi/ortho) et un fichier overviews.json qui décrit la liste des dalles et la liste des OPI avec les métadonnées associées. 

Une fois le cache créé, on peut y ajouter des OPI si nécessaire avec le script **update_cache.py** :

````
usage: update_cache.py [-h] [-R RGB] [-I IR] [-c CACHE] [-g GRAPH] [-t TABLE] [-p PROCESSORS] 
                       [-r RUNNING] [-s SUBSIZE] [-z ZEROMTD] [-v VERBOSE]

options:
  -h, --help            show this help message and exit
  -R RGB, --rgb RGB     input RGB OPI pattern
  -I IR, --ir IR        input IR OPI pattern
  -c CACHE, --cache CACHE
                        cache directory (default: cache)
  -g GRAPH, --graph GRAPH
                        GeoPackage filename or database connection string 
                        ("PG:host=localhost user=postgres password=postgres dbname=demo")
  -t TABLE, --table TABLE
                        graph table (default: graphe_pcrs56_zone_test)
  -p PROCESSORS, --processors PROCESSORS
                        number of processing units to allocate (default: Max_cpu-1)
  -r RUNNING, --running RUNNING
                        launch the process locally (default: 0, meaning no process launching, 
                        only GPAO project file creation)
  -s SUBSIZE, --subsize SUBSIZE
                        size of the subareas for data processing, in slabs 
                        (default: 2, meaning 2x2 slabs)
  -z ZEROMTD, --zeromtd ZEROMTD
                        allow input graph with no metadata (default: 0, metadata needed)
  -v VERBOSE, --verbose VERBOSE
                        verbose (default: 0, meaning no verbose)
````
Attention, les OPI qui sont ajoutées doivent avoir le même type que celles déjà présentes dans le cache (RGB, IR ou RGB+IR).

Par exemple, sur les données du dossier **regress**, on peut ajouter l'OPI isolée du dossier **regress/update** dans le cache créé précédemment :
````
python scripts/update_cache.py -R "regress/data/update/RGB/*.tif" -I "regress/data/update/IR/*.tif" -c cache_regress_RGBIR -g "regress/data/regress_graphe.gpkg" -t graphe
````

## Import d'un cache dans la base de données
Pour importer un cache dans la BD packo, il faut utiliser :

- la route POST **cache** de l'API : http://[serveur]:[port]/doc/#/cache/post_cache

  Cette route prend en paramètre :

  - le nom du cache (il doit être unique dans la base)
  - le chemin du dossier contenant les COG créés par le script **create_cache** et correspondant au cache à importer (ex : "cache_test") : soit en absolu, soit en relatif par rapport au dossier de lancement de l'API
  - le contenu du fichier **overviews.json** du cache à importer (celui qui a été créé par le script python et qui est à la racine du dossier contenant le cache à importer)

- ou la commande curl équivalente :
  ````
  curl [-v] -X "POST" "http://[serveur]:[PORT]/cache?name=[nom_cache]&path=[chemin_cache]" \
      -H "accept: */*" \
      -H "Content-Type: application/json" \
      -d "@[chemin_overviews]"
  ````
  où :
    - *-v*, *--verbose* : option facultative
    - *nom_cache* : le nom du cache
    - *chemin_cache* : le chemin du dossier du cache
    - *chemin_overviews* : le chemin du fichier **overviews.json** du cache

Si un cache a une taille de dalle (slabSize) différente de 16x16 tuiles ou une taille de tuile (tileSize) différente de 256x256 pixels, il peut y avoir des soucis de visualisation sous iTowns car la gestion de ces tailles n'était pas initialement prévue.


## Préparation des éléments de la vue PackO pour QGIS

Dans le cas d'utilisation d'un client pour PackO basé sur QGIS (version minimale 3.34), on peut créer automatiquement la vue contenant les éléments du chantier en utilisant le script **create_qgis_view.py** :
````
usage: create_qgis_view.py [-h] [-u URL] -c CACHE_ID [-b BRANCH_NAME] [-s {RVB,IR,IRC}] [-o OUTPUT] [-z ZOOM_PIVOT] [--vect VECT] [--bbox BBOX BBOX BBOX BBOX] [-m MACROS] [-v VERBOSE]

options:
  -h, --help            show this help message and exit
  -u URL, --url URL     http://[serveur]:[port] (default: http://localhost:8081)
  -c CACHE_ID, --cache_id CACHE_ID
                        cache id
  -b BRANCH_NAME, --branch_name BRANCH_NAME
                        name of new branch to be created on cache (default: newBranch)
  -s {RVB,IR,IRC}, --style_ortho {RVB,IR,IRC}
                        style for ortho to be exported to xml (default: RVB)
  -o OUTPUT, --output OUTPUT
                        output qgis view path (default: ./view.qgs)
  -z ZOOM_PIVOT, --zoom_pivot ZOOM_PIVOT
                        layer visibility scale for surface graph [1:10000000,1:zoom_pivot] & for contour graph [1:zoom_pivot,1:1] (default:3025)
  --vect VECT           vectors folder path
  --bbox BBOX BBOX BBOX BBOX
                        bounding box defining the view extent (Xmin Ymin Xmax Ymax)
  -m MACROS, --macros MACROS
                        macros file path
  -v VERBOSE, --verbose VERBOSE
                        verbose (default: 0, meaning no verbose)
````
où **-c** est l'identifiant du cache de travail dans la base de données : pour le récupérer, on peut demander à l'API la liste des caches en utilisant l'url `http://[serveur]:[port]/caches` ou la commande curl `curl [-v] -X "GET" "http://[serveur]:[PORT]/caches" -H "accept: */*"`.

Les éléments de la vue générés avec ce script sont :
- une nouvelle branche PackO créée sur le cache indiqué ; le nom de la branche est par défaut "newBranch", nom de branche à indiquer avec **-b**.
- **ortho.xml** et **graphe_surface.xml** : couches ortho et graphe de la nouvelle branche, exportées sous forme de fichiers xml plus des modifications pour QGIS, dans le dossier de sortie (le chemin de la vue à indiquer avec **-o**). Pour l'ortho, si le style est différent de celui par défaut ("RVB"), il faut l'indiquer avec **-s**. L'échelle de visibilité de la couche *graphe_surface* est définie avec l'option **-z** (zoom_pivot, par défaut 3025) : [1:10000000, 1:zoom_pivot].
- **graphe_contour.vrt** : couche contour de graphe générée à partir de graphe_surface.xml avec des ajouts et modifications pour QGIS, dans le dossier de sortie. L'échelle de visibilité de la couche *graphe_contour* : [1:zoom_pivot, 1:1]
- **retouches_graphe.gpkg** : couche vecteur, initialement vide, utilisée pour les retouches du graphe
- **avancement.gpkg** : couche vecteur, initialement vide, utilisée pour garder la trace des zones contrôlées
- **retouches_info.gpkg** : couche vecteur, initialement vide, utilisée pour les retouches infographiques
- **retouches_info_sauv.gpkg** : couche vecteur, initialement vide, utilisée pour les sauvegardes liées aux retouches infographiques
- **remarques.gpkg** : couche vecteur, initialement vide, utilisée pour les remarques sur la vue

Ces éléments sont des couches de la vue PackO pour QGIS (par défaut **view.qgs**), auxquelles s'ajoute une couche OPI générée en important la couche WMTS OPI de la branche du cache.

Des vecteurs externes *.shp* et *.gpkg* peuvent être intégrés à la vue en indiquant le chemin vers le dossier les contenant avec **--vect**.

Dans le cas où l'on veut avoir une emprise pour la vue (emprise de travail) plus petite que l'emprise du chantier (emprise du cache), elle est à indiquer avec **--bbox** Xmin Ymin Xmax Ymax.

Pour intégrer un fichier de macros QGIS à la vue, il faut indiquer le chemin vers le fichier macros prototype avec **-m**. Ce fichier sera adapté au chantier avant d'être intégré à la vue, en remplaçant les clés `__IDBRANCH__`, `__URLSERVER__`, `__TILEMATRIXSET__`, `__STYLE__`, `__CRS__`, `__PIXELSIZEX__`, `__PIXELSIZEY__`  avec les valeurs correspondantes pour le chantier - exemple :

  - Extrait prototype macros, avant adaptation :
    ```
    id_branch = __IDBRANCH__
    url_server = __URLSERVER__
    tile_matrix_set = __TILEMATRIXSET__
    style = __STYLE__
    crs = __CRS__
    pixel_size_x = __PIXELSIZEX__
    pixel_size_y = __PIXELSIZEY__
    ```
  - Extrait macros, après adaptation :
    ```
    id_branch = '32'
    url_server = 'http://localhost:8081/'
    tile_matrix_set = 'RGF93_LA93_20cm'
    style = 'RVB'
    crs = '2154'
    pixel_size_x = 0.2
    pixel_size_y = 0.2
    ```

Un exemple de fichier macros prototype est fourni dans le dossier *ressources*.

Pour le bon fonctionnement dans QGIS, il est impératif de mettre la variable d'environnement **GDAL_VRT_ENABLE_PYTHON** à **YES**. Il faut également définir les variables d'environnement (où `<qgispath>` doit être remplacé par le chemin d'accès au dossier d'installation de QGIS ; exemples de `<qgispath>` sous Linux : **/usr** , sous Windows **C:\Program Files\QGIS XXX\apps\qgis** où 'XXX' est à remplacer avec la version de QGIS) :
- **PYTHONPATH** :
  - sous Linux : `export PYTHONPATH=/<qgispath>/share/qgis/python`
  - sous Windows : `set PYTHONPATH=C:\<qgispath>\python` ; sous windows, si elle n'existe pas, création automatique de cette variable d'environnement à partir de la variable d'environnement OSGEO4W_ROOT.
- **LD_LIBRARY_PATH** :
  - sous Linux : `export LD_LIBRARY_PATH=/<qgispath>/lib`
  - sous Windows: `set PATH=C:\<qgispath>\bin;C:\<qgispath>\apps\<qgisrelease>\bin;%PATH%` (où `<qgisrelease>` devrait être remplacé avec le type de release ciblé (ex : qgis-ltr, qgis, qgis-dev)

Si la vue contient des macros, il faut activer leur utilisation lors du chargement de la vue dans QGIS.

## Traitement d'un chantier

### Connection à un cache

A partir du client web en ajoutant le paramètre namecache={nom du cache en base} (ex : "cache_test"), on peut visualiser le cache choisi et commencer à travailler dessus.

### Import de couches vecteur annexes

A partir de l'interface web, on peut intégrer des couches vecteur (au format geojson ou shapefile) en les glissant directement dans la vue. 
Pour les fichiers shapefile, il faut glisser les fichiers .shp, .shx, .dbf et .prj en même temps.
Pour des soucis d'intégrité, si on désire ajouter plusieurs couches, il faut les ajouter une à une.
Chaque couche ajoutée est sauvegardée dans la base de données.

Actuellement les couches de polygone multipart ne sont pas bien gérées, il faut exploser ces couches en polygone simple avant de les ajouter à la vue itowns.

Les paramètres d'affichage des couches ne sont pas persistants après un changement de branche de saisie ou de rafraîchissement de la page dans le navigateur.

### Gestion des couches d'alertes

Pour naviguer à travers les entités d'une couche annexe préalablement ajoutée, il faut choisir cette couche dans le menu déroulant "Alerts Layer".
A partir du moment où une couche a été sélectionnée, la vue est centrée sur la première entité non encore passée en revue et les champs "Alert id", "Progress", "Validated" ainsi que le bouton "Mark as Unchecked" apparaissent avec leurs valeurs mises à jour.
On peut ensuite naviguer à travers les différentes entités :
- en utilisant les flèches droite et gauche (ou haut et bas),
- en cliquant directement sur l'entité voulue,
- en entrant l'id de l'entité voulue dans le champ "Alert id".

Les champs "Alert id", "Progress", "Validated" (et "Remark" pour la couche 'Remarques') sont rafraichis avec les valeurs de l'entité sélectionnée.

Les flèches haut et bas proposent le même principe que droite et gauche avec pour seule différence de ne naviguer qu'à travers les entités non-vues.

Une entité peut se retrouver sous 3 statuts différents : *non-vu*, *vu* et *validé*. Par défaut le statut de chaque entité est *non-vu*. Dès que celle ci se retrouve sélectionnée (par une des 3 méthodes citées ci-dessus) son statut passe à *vu*. Le bouton "Validated" permet de changer le statut de l'entité à *validé* et le bouton "Mark as unchecked" permet de revenir au statut *non-vu* (ne marche pas si l'entité à déja été validée).


### Couche d'annotation (Remarques)

Sur chaque branche, une couche vecteur 'Remarques' est par défaut créée qui peut être traitée comme une couche d'alerte.
Le bouton "Add remark" permet à tout moment d'ajouter une entité ponctuelle sur la couche 'Remarques", en cliquant sur la vue et de renseigner un texte.
Lorsque la couche de 'Remarques' est choisie comme couche d'alerte, en plus des fonctionnalités propres aux couches d'alerte (voir paragraphe précédent), le champ "Remark" est affiché (contenant le texte entré lors de la création de l'entité) et on peut aussi détruire l'entité sélectionnée avec le bouton "Delete Remark".

### Export d'une couche vecteur

A tout moment, la couche "Remarques" présentée plus haut peut être exportée en geoJson en utilisant l'url `http://[serveur]:[PORT]/[idBranch]/vector?name=Remarques` ou la commande curl correspondante `curl [-v] -X "GET" "http://[serveur]:[PORT]/[idBranch]/vector?name=Remarques" -H "accept: */*" [-o [chemin_json_sortie]]` où **idBranch** est l'identifiant de la branche contenant la couche Remarques à exporter et, pour le récupérer, on peut demander à l'API la liste des branches en utilisant l'url `http://[serveur]:[port]/branches`, l'option *-v* ou *--verbose* est facultative, *-o* ou *--output* - option facultative pour sauvegarder la réponse directement dans un fichier et **chemin_json_sortie** - le chemin du fichier geoJson en sortie.

De manière générale, pour exporter une couche vecteur, on peut utiliser l'url `http://[serveur]:[PORT]/[idBranch]/vector?name=[nom_vecteur]` ou la commande curl : `curl [-v] -X "GET" "http://[serveur]:[PORT]/[idBranch]/vector?name=[nom_vecteur]" -H "accept: */*" [-o [chemin_json_sortie]]`.

Et pour exporter tous les vecteurs d'une branche, on peut utiliser l'url `http://[serveur]:[PORT]/[idBranch]/vectors` ou la commande curl correspondante `curl [-v] -X "GET" "http://[serveur]:[PORT]/[idBranch]/vectors" -H "accept: */*"`.


### Retouches

Les étapes du processus de retouche du graphe de mosaïquage sont :
* choisir la branche de saisie dans le menu déroulant "Active branch" (utiliser "Add new branch" pour créer une nouvelle branche)
* choisir l'OPI de travail avec "Select an OPI"
* démarrer la retouche ("Start polygon"), appuyer sur la touche "Majuscule" du clavier pour fermer la saisie
* annuler ou refaire la retouche en utilisant les outils "undo", "redo"

Les contours des retouches d'un chantier peuvent être affichés en activant l'option "visible" de la couche "Patches".

### Export des retouches

Pour exporter les retouches d'une branche, on peut utiliser l'url `http://[serveur]:[PORT]/[idBranch]/patches` ou la commande curl `curl [-v] -X "GET" "http://[serveur]:[PORT]/[idBranch]/patches" -H "accept: */*" [-o [chemin_json_sortie]]`.

Dans les deux cas, le paramètre **idBranch** représente l'identifiant de la branche contenant les retouches à exporter et, pour le récupérer, on peut demander à l'API la liste des branches en utilisant le url `http://[serveur]:[port]/branches`, comme plus haut.

Les options curl *-v* ou *--verbose* et *-o* ou *--output* sont facultatives. Si on utilise l'option *-o*, **chemin_json_sortie** représente le chemin du fichier geoJson en sortie contenant les retouches.

## Travailler à plusieurs sur un chantier

Il ne faut jamais travailler à plusieurs en même temps sur la même branche. Pour l'instant aucune vérification n'est faite au niveau de PackO et cela va conduire à des incohérences (un mécanisme de protection sera ajouté dès que possible).

Pour travailler à plusieurs sur un chantier : chaque personne doit créer une branche et travailler uniquement dans cette branche.

Lorsque le travail est terminé, on peut rassembler les branches pour obtenir le résultat complet. Le principe, se base sur la notion de **rebase** de **git** : on choisit une branche (**B1**) et on demande à faire un **rebase** sur une autre branche (**B2**) en lui donnant un nouveau nom.

En pratique, PackO va effectuer les opérations suivantes :

- création de la nouvelle branche avec le nom choisi
- copie des patchs de **B2** dans cette nouvelle branche : c'est rapide puisque l'historique et les résultats d'application de patch sont simplement copiés
- une fois que cette copie est prête : l'utilisateur reçoit une réponse avec l'Id de la nouvelle branche et l'Id du processus long pour suivre l'avancement du **rebase**
- PackO va ensuite appliquer tous les patchs de **B1** sur cette nouvelle branche. Cela va prendre du temps puisqu'il faut rejouer chaque patch un par un dans l'ordre.
- Lorsque les traitements sont terminés, le processus est mis à jour avec la date de fin et son statut est passé à **succeed**

Il n'y a pas d'interface pour faire le **rebase** depuis iTowns, il faut utiliser la doc : 
````
http://[serveur]:[port]/doc/#/branch/post__idBranch__rebase 
````
pour lancer la commande et 
`````
http://[serveur]:[port]/doc/#/process/get_process__id_
`````
pour suivre l'avancement du traitement.

Attention : si les deux branches ont modifié les mêmes zones de l'ortho le résultat peut-être imprévisible puisque l'on applique d'abord les patchs de la branche de base (**B2**), puis ceux de la branche **B1**. Un mécanisme d'alerte sera ajouté dès que possible pour signaler ces cas et permettre à un opérateur de les contrôler efficacement. En attendant, il est recommandé de définir la zone à traiter pour chaque opérateur et de gérer les cas limites globalement en fin de chantier. 

## Export raster

Une fois les contrôles et retouches effectués, il est possible d'exporter l'ortho résultante à l'aide de commandes gdal en utilisant le flux WMTS proposé par l'API.

Pour cela il faut :

1. identifier l'identifiant de la branche que l'on souhaite exporter. Pour cela on peut demander à l'API la liste des branches en utilisant l'url : 
http://[serveur]:[port]/branches

2. générer un descripteur XML gdal avec la commande **gdal_translate** en indiquant l'identifiant de la branche et la couche souhaitée (ortho ou graph) et éventuellement le style souhaité (RVB, IRC ou IR) :
````
gdal_translate "WMTS:http://[serveur]:[port]/[idBranch]/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0,layer=ortho,style=[style]" ortho.xml -of WMTS
gdal_translate "WMTS:http://[serveur]:[port]/[idBranch]/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0,layer=graph" graph.xml -of WMTS
`````
3. utiliser n'importe quelle commande gdal pour faire un export à partir du descripteur ainsi obtenu :
````
gdal_translate -of Jpeg ortho.xml ortho.jpg
````

## Export d'un graphe vecteur à partir d'un cache

Le traitement permettant d'exporter un graphe vecteur à partir d'un cache PackO est le script *export_graph.py*.
Ce script va générer un fichier json utilisable par le service de gpao de l'IGN.
Pour le bon fonctionnement de ce script, il est impératif de mettre la variable d'environnement **GDAL_VRT_ENABLE_PYTHON** à **YES** avant de le lancer.

````
usage: export_graph.py [-h] -c CACHE -o OUTPUT -b BRANCH [-u URL] [-t TILESIZE] [--bbox BBOX BBOX BBOX BBOX] [--shapefile SHAPEFILE] [-v VERBOSE]

optional arguments:
  -h, --help            show this help message and exit
  -c CACHE, --cache CACHE
                        path of input cache
  -o OUTPUT, --output OUTPUT
                        output folder
  -b BRANCH, --branch BRANCH
                        id of branch of cache to use as source for patches
  -u URL, --url URL     http://[serveur]:[port] (default: http://localhost:8081)
  -t TILESIZE, --tilesize TILESIZE
                        tile size (in pixels) for vectorising graph tiles (default: 5000)
  --bbox BBOX BBOX BBOX BBOX
                        bbox for export (in meters), xmin ymin xmax ymax
  --shapefile SHAPEFILE
                        filepath of shapefile containing extent of export
  -v VERBOSE, --verbose VERBOSE
                        verbose (default: 0)
````

Les chemins donnés en paramètre doivent être absolus.
Il est nécessaire d'utiliser l'API pour récupérer l'id de la branche à partir de laquelle on souhaite exporter le graphe.

Les options *bbox* et *shapefile* ne peuvent pas être utilisées simultanément.

Sous Windows, l'environnement recommandé pour avoir accès aux scripts Gdal et Gdal/Ogr est par le moyen de QGis (qui contient une version de Gdal supérieure ou égale à la version minimale demandée, voir plus haut).
Il faut initialiser l'environnement QGis via le script qui est à l'emplacement : **{QGis_DIR}\bin\o4w_env.bat**
Pour exécuter *vectorise_graph.py* sous Windows, il est nécessaire d'avoir configuré la variable d'environnement OSGEO4W_ROOT qui doit pointer vers la racine de QGis.
Il est également nécessaire d'ajouter dans le PATH les emplacements des exécutables et scripts utilisant Gdal et Gdal/Ogr de QGis : *%OSGEO4W_ROOT%\bin* ainsi que *%OSGEO4W_ROOT%\apps\Python\*\Scripts*. * étant la version de Python embarqué par QGis.

Le résultat final du calcul gpao de vectorisation, GRAPH_mtd.gpkg, est au format GeoPackage.

## Raccourcis clavier

Les raccourcis clavier disponibles dans l'interface sont :
- Sélectionner une OPI (*Select an OPI*) : **s**
- Démarrer polygone (*Start polygon*) : **p**
- Annuler polygone (*Undo*) : **Ctrl + Z**
- Refaire polygone (*Redo*) : **Ctrl + Y**
- Masquer/Afficher l’Ortho mosaïquée : **m**
- Masquer/Afficher les contours : **g**
- Masquer/Afficher l’Opi sélectionnée : **o**
- Masquer/Afficher tous les vecteurs : **v**
- Basculer l'ortho et l'opi entre RVB/IR/IRC :  **i**
- Valider/Invalider une alerte (*Validated*) : **c**
- Déplacer la vue d'un peu moins qu'un écran à l'aide des quatre flèches, lorsqu'on n'est pas en mode alerte
- Ajouter une remarque (*Add remark*) : **a**
- Supprimer une remarque (*Delete remark*): **d**

[![IGN](images/logo_ign.png)](https://www.ign.fr)
