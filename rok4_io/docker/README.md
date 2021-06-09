## Création

Création du docker rok4py :

`docker build . -t rok4py`

## Lancement

Lancement du docker en mode intéractif, en montant les volumes nécessaires :

`docker run -ti --rm -v path_packo/:/packo -v path_data/:/Data rok4py bash`

Il faut assurer la connexion à la base de données si nécessaire.

## Suppression de l'image docker
`docker rmi rok4py`
