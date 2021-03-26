## Installation Anaconda pour PackO (pour Windows)

Récupérer le setup d'Anaconda et l'installer (les options par défaut sont correctes, inutile d'ajouter des variables au PATH)

Lancer le terminal Anaconda Prompt (Anaconda3), il a toutes les bonnes variables d'environnement initialisées nécessaires au bon fonctionnement d'Anaconda.

### Configuration d'Anaconda

Ajout du canal conda-forge : 
```
conda config --add channels conda-forge
```

Editer le fichier .condarc qui se trouve à l'emplacement suivant : 

```
C:\Utilisateurs\USER\.condarc
```

Il faut y ajouter les informations de proxy dans la partie *proxy_server* si besoin.


De manière optionnelle, on peut également ajouter : 

```
always_yes: true
```

Cela permet de valider automatiquement les installations de paquet dans un environnement

### Création et activation de l'environnement Anaconda
Pour créer un nouvel environnement, il faut utiliser la commande suivante :
```
conda create --name myenv
```
Il faut ensuite activer cet environnement :
````
conda activate myenv
````

Une fois l'environnement activé, il faut maintenant installer les modules nécessaires au bon fonctionnement de PackO :
````
conda install numpy
conda install gdal
````
