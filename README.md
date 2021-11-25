# PackO

Outil pour le contrôle et la retouche du mosaïquage, sous licence CECILL-B (voir [LICENSE.md](LICENSE.md)).

4 modules :
- une BD Postgis
- une API
- un client web
- un code python pour la création et mise à jour du cache

## BD

Une base de données est utilisée pour stocker les métadonnées des caches (liste des OPI avec leur date, nom, couleur, ...) ainsi que l'historique sur chaque branche (liste des patches).

La structure de cette base:
![BD Packo](doc/BD_packo.drawio.png)

Il est nécessaire d'avoir un PostGIS version 3.0 au minimum. 

La base de donnée doit être créée avant le lancement de l'API:
```
psql -c "CREATE DATABASE packo"
psql -d packo -f sql/packo.sql
```

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

Ensuite on peut lancer l'API, la doc et l'interface web en spécifiant un port (par défaut le service sera lancé sur le port 8081). Il est possible de le lancer en mode **simple** avec une seule instance ou en mode **cluster** avec plusieurs instances pour exploiter plusieurs coeurs sur le serveur.

Le mode **simple**:

- en mode production
```shell
npm start -- -p [port]
```
- en mode développement (qui autorise la route "clear")
```shell
npm start-dev -- -p [port]
```

Le mode **cluster**:

Dans ce mode, on utilise le module **[PM2](https://pm2.keymetrics.io/)** pour piloter le lancement de plusieurs instances de l'API et la répartition du traitement des requêtes entre ces différentes instances. Cela permet donc d'avoir un serveur plus réactif et rapide, même lorsqu'il y a des requêtes longues et/ou plusieurs utilisateurs.

Dans ce cas, on décrit la configuration (nombre de coeurs, variable d'environement, etc...) dans un fichier **ecosystem.config.js**. Un exemple de fichier de configuration est inclus dans le dossier **ressources**  du projet. Si on le copie à la racine, il permet de lancer un cluster nommé **packo** qui exploite par défaut tous les coeurs de la machine.

Comme dans le cas d'un **npm run start** l'application utilisera les variables d'environnement du système pour connaitre l'adresse du serveur PostGis, l'utilisateur, le mot de passe et le nom de la base (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).

Pour définir le port utilisé par l'API, il faut éditer le paramètre **args** dans le fichier **ecosystem.config.js**: dans l'exemple qui est fourni dans le dossier **ressources** on utilise le port 8081:

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


Pour choisir si on travaille en mode **production** ou en mode **development** (qui autorise la route **clear**), on peut spécifier l'environement à utiliser dans le ligne de commande.

Par exemple, on peut:

- lancer les instances de l'API en mode **production** (le mode par défaut) avec la commande:
```
npx pm2 start
````

- lancer les instances de l'API en mode **development** avec la commande:
```
npx pm2 start --env development
````

- suivre l'état et l'utilisation de ces instances avec la commande:
```
npx pm2 monit
````

- arrêter toutes les instances avec la commande:
```
npx pm2 delete packo
```

Dans les deux cas (mode **simpe** ou **multi coeurs**), l'interface web est alors accesible à l'adresse :  http://[serveur]:[port]/itowns/?serverapi=[serveur]&portapi=[port]&namecache=[namecache]

par défaut:

- serveur: localhost
- port: 8081
- serverapi: la même valeur que le serveur
- portapi: la même valeur que le port
- namecache: pas de valeur par défaut, mais si le paramètre n'est pas renseigné c'est le premier cache mis en base qui sera utilisé

La doc de l'API est publiée directement par le service et est disponible à l'adresse : http://[serveur]:[port]/doc

### Principe de fonctionnement

Ce service propose: 

- un flux WMTS standard pour les couches ortho et graph
- un flux WMTS permettant d'accéder aux OPI: ce flux est déclaré comme une couche unique (opi) et on utilise un paramètre de dimension pour choisir le cliché à afficher. Attention, il faut normalement déclarer explicitement toutes les valeurs de dimension dans le GetCapabilties mais cela ne va pas être possible de déclarer tous les clichés (potientiellement plusieurs milliers).
- une commande permettant de modifier le graphe en donnant: un geojson + une référence de cliché

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
- des outils de retouche du graphe de mosaiquage

## Préparation d'un cache

Un cache PackO se crée à partir d'un graphe de mosaiquage initial (sous forme d'un GeoPackage ou d'une BD) ainsi qu'un dossier contenant les OPI dans un format supporté par GDAL avec leur géoréférencement.

Pour les gros caches, il est préférable de créer une BD à partir du fichier Shapefile, cela peut être fait avec la commande **shp2pgsql**. Il est important de vérifier que le code de projection a bien été renseigné dans le base. Par exemple:
```bash
createdb bd_graphe
psql -d bd_graphe -c 'create extension postgis'
shp2pgsql graphe.shp | psql -d bd_graphe
psql -d bd_graphe -c "SELECT UpdateGeometrySRID('graphe','geom',2154)"
```

Pour le moment, PackO ne gère que des images 3 canaux (RGB), mais des évolutions sont en cours pour gérer des images 4 canaux (RGB+IR).

La création du cache est faite à l'aide du script **create_cache.py**:
````
usage: create_cache.py [-h] -i INPUT [-c CACHE] [-o OVERVIEWS] [-g GEOPACKAGE] [-t TABLE] [-p PROCESSORS] [-v VERBOSE]

optional arguments:
  -h, --help            show this help message and exit
  -i INPUT, --input INPUT
                        input OPI pattern
  -c CACHE, --cache CACHE
                        cache directory (default: cache)
  -o OVERVIEWS, --overviews OVERVIEWS
                        params for the mosaic (default: ressources/LAMB93_5cm.json)
  -g GEOPACKAGE, --geopackage GEOPACKAGE
                        in case the graph base is a GeoPackage and not a postgres base define through env variables
  -t TABLE, --table TABLE
                        graph table (default: graphe_pcrs56_zone_test)
  -p PROCESSORS, --processors PROCESSORS
                        number of processing units to allocate (default: Max_cpu-1)
  -v VERBOSE, --verbose VERBOSE
                        verbose (default: 0)
````


Ce script nécessite deux modules: numpy et gdal (version au moins 3.2). Par exemple, sous Linux, on peut les installer avec les commandes:
````
python -m pip install --upgrade pip
pip install numpy
pip install --global-option=build_ext --global-option="-I/usr/include/gdal" GDAL==`gdal-config --version`
````

Par exemple, pour créer un cache à partir des données incluses dans le dossier **regress**, on peut utiliser la commande suivante depuis la racine du dépôt PackO:
````
python scripts/create_cache.py -i "regress/data/*.tif" -o ressources/LAMB93_5cm.json -c cache_regress -g "regress/data/regress_graphe.gpkg" -t graphe
````

Ce script fonctionne en deux phases:

- on découpe les OPI en dalles respectant une pyramide TMS que l'on stocke sous forme de COG
- on rasterise le graphe de mosaiquage et on exporte pour chaque dalle un COG de graphe (image de graphe avec une couleur par OPI) et un COG de l'ortho assemblée

Le script permet d'obtenir trois arborescences de COG (graph/opi/ortho) et un fichier overviews.json qui décrit la liste des dalles et la liste des OPI avec les métadonnées associées. 

Une fois le cache créé, on peut y ajouter des OPI si nécessaire avec le script **update_cache.py**:

````
usage: update_cache.py [-h] -i INPUT [-c CACHE] [-r REPROCESSING] [-g GEOPACKAGE] [-t TABLE] [-p PROCESSORS] [-v VERBOSE]

optional arguments:
  -h, --help            show this help message and exit
  -i INPUT, --input INPUT
                        input OPI pattern
  -c CACHE, --cache CACHE
                        cache directory (default: cache)
  -r REPROCESSING, --reprocessing REPROCESSING
                        reprocessing of OPI already processed (default: 0, existing OPIs are not reprocessed)
  -g GEOPACKAGE, --geopackage GEOPACKAGE
                        in case the graph base is a GeoPackage and not a postgres base define through env variables
  -t TABLE, --table TABLE
                        graph table (default: graphe_pcrs56_zone_test)
  -p PROCESSORS, --processors PROCESSORS
                        number of processing units to allocate (default: Max_cpu-1)
  -v VERBOSE, --verbose VERBOSE
                        verbose (default: 0)
````

Par exemple, sur les données du dossier **regress**, on peut ajouter l'OPI isolée du dossier **regress/update** dans le cache créé précédemment:
````
python scripts/update_cache.py -i "regress/data/update/*.tif" -c cache_regress -g "regress/data/regress_graphe.gpkg" -t graphe
````

Pour importer un cache dans la BD packo, il faut utiliser la route POST **cache** de l'API: http://[serveur]:[port]/doc/#/cache/post_cache.

Cette route prend en paramètre:

- le nom du cache (il doit être unique dans la base)
- le chemin du dossier contenant les COG créé par le script **create_cache** et correspondant au cache à importer (ex: "cache_test"): soit en absolu, soit en relatif par rapport au dossier de lancement de l'API
- le contenu du fichier **overviews.json** du cache à importer (celui qui a été créé par le script python et qui est à la racine du dossier contenant le cache à importer)

## Travailler à plusieurs sur un chantier

Il ne faut jamais travailler à plusieurs en même temps sur la même branche. Pour l'instant aucune vérification n'est faite au niveau de PackO et cela va conduire à des incohérences (un mécanisme de protection sera ajouté dès que possible).

Pour travailler à plusieurs sur un chantier: chaque personne doit créer une branche et travailler uniquement dans cette branche.

Lorsque le travail est terminé, on peut rassembler les branches pour obtenir le résultat complet. Le principe, se base sur la notion de **rebase** de **git**: on choisit une branche (**B1**) et on demande à faire un **rebase** sur une autre branche (**B2**) en lui donnant un nouveau nom.

En pratique, PackO va effectuer les opérations suivantes:

- création de la nouvelle branche avec le nom choisi
- copie des patchs de **B2** dans cette nouvelle branche: c'est rapide puisque l'historique et les résultats d'application de patch sont simplement copiés
- une fois que cette copie est prête: l'utilisateur reçoit une réponse avec l'Id de la nouvelle branche et l'Id du processus long pour suivre l'avancement du **rebase**
- PackO va ensuite appliquer tous les patchs de **B1** sur cette nouvelle branche. Cela va prendre du temps puisqu'il faut rejouer chaque patch un par un dans l'ordre.
- Lorsque les traitements sont terminés, le processus est mis à jour avec la date de fin et son status est passé à **succeed**

Il n'y a pas d'interface pour faire le **rebase** depuis iTowns, il faut utiliser la doc: 
````
http://[serveur]:[port]/doc/#/branch/post__idBranch__rebase 
````
pour lancer la commande et 
`````
http://[serveur]:[port]/doc/#/process/get_process__id_
`````
pour suivre l'avancement du traitement.

Attention: si les deux branches ont modifié les mêmes zones de l'ortho le résultat peut-être imprévisible puisqu'on applique d'abord les patchs de la branche de base (**B2**), puis ceux de la branche **B1**. Un mécanisme d'alerte sera ajouté dès que possible pour signaler ces cas et permettre à un opérateur de les controler efficacement. En attendant, il est recommandé de définir la zone à traiter pour chaque opérateur et de gérer les cas limites globalement en fin de chantier. 

## Export raster

Une fois les contrôles et retouches effectués, il est possible d'exporter l'ortho résultante à l'aide de commandes gdal en utilisant le flux WMTS proposé par l'API.

Pour cela il faut:

1. identifier l'identifiant de la branche que l'on souhaite exporter. Pour cela on peut demander à l'API la liste des branches en utilisant l'url: 
http://[serveur]:[port]/branches

2. générer un descripteur XML gdal avec la commande **gdal_translate** en indiquant l'identifiant de la branche et la couche souhaitée (ortho ou graph):
````
gdal_translate "WMTS:http://[serveur]:[port]/[idBranch]/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0,layer=ortho" ortho.xml -of WMTS
gdal_translate "WMTS:http://[serveur]:[port]/[idBranch]/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0,layer=graph" graph.xml -of WMTS
`````
3. utiliser n'importe quelle commande gdal pour faire un export à partir du descripteur ainsi obtenu:
````
gdal_translate -of Jpeg ortho.xml ortho.jpg
````


## Export d'un graphe vecteur à partir d'un cache

Le script **vectorise_graphe.py** permet de faire un export vectoriel d'un graphe à partir d'un cache.

Pour le bon fonctionnement du script, il est impératif de mettre la variable d'environnement **GDAL_VRT_ENABLE_PYTHON** à **YES** avant de le lancer.
````
usage: vectorise_graph.py [-h] -i INPUT [-o OUTPUT] [-b BRANCH] -p PATCHES [-t TILESIZE] [-v VERBOSE]

optional arguments:
  -h, --help            show this help message and exit
  -i INPUT, --input INPUT
                        input cache folder
  -o OUTPUT, --output OUTPUT
                        output folder (default : .)
  -b BRANCH, --branch BRANCH
                        id of branch of cache to use as source for patches (default: None)
  -p PATCHES, --patches PATCHES
                        file containing patches on the branch to export
  -t TILESIZE, --tilesize TILESIZE
                        tile size (in pixels) for vectorising graph tiles (default: 100000)
  -v VERBOSE, --verbose VERBOSE
                        verbose (default: 0)
````

La variable "-b" est optionnelle. Si elle n'est pas donnée, alors elle prend la valeur de la branche du fichier json d'export de retouches dans le cas où des retouches ont été effectuées, sinon le calcul se fait sur le graphe initial.


A l'heure actuelle, il faut utiliser des chemins absolus pour que le script fonctionne correctement.

Il est nécessaire de recourir à l'API pour récupérer deux de ces informations :
- l'id de la branche à partir de laquelle on souhaite exporter le graphe vecteur
- et le résultat de la route GET /{idBranch}/patches sur celle-ci (au format json)

Le résultat de l'export est au format GeoPackage.

#### Spécificité pour exécuter ce script sous Windows
L'environnement recommandé pour avoir accès à gdal_polygonize est par le moyen de QGis.

Pour que le script puisse avoir accès à cet exécutable, il faut initialiser l'environnement QGis via le script inclus. Ce script est à l'emplacement : **{QGis_DIR}\bin\o4w_env.bat**

[![IGN](images/logo_ign.png)](https://www.ign.fr)