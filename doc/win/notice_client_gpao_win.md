## Utilisation de la GPAOv2 sous Windows ##

Pour pouvoir utiliser la GPAOv2, il est nécessaire de connaître l'adresse du monitor. Une fois sur cette page, il est possible de récupérer l'utilitaire permettant d'ajouter une machine au pool pour pouvoir exécuter des traitements sur celle-ci (*liens -> Client GPAO*).
Il est nécessaire de disposer d'un environnement python avec le module request (voir requirements.txt dans l'archive).
Avant de lancer le client, il faut penser à mettre la bonne adresse de l'API : set URL_API="url_api"
Le script à exécuter pour lancer le client est *start.bat*. **Attention**, ce script est prévu pour être exécuté dans un environnement python natif. Dans le cas où on utilise Anaconda, il faut l'exécuter, puis exécuter *python client.py* pour bien lancer le client.