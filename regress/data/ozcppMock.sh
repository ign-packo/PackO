#!/bin/bash
# Boucle sur tous les paramètres donné au fichier pour récupérer que la valeur du paramètre -p le chemin de la siaise
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p) pathJson="$2"; shift 2 ;;
    *)  shift ;;
  esac
done
echo "pathJson: $pathJson"

# Ouverture du fichier geoJson de saisie pour récupérer la valeur de la balise 'name'
name=$(python3 -c "import json,sys; print(json.load(open('$pathJson'))['name'])")
echo "name : $name"
# Extraction de l'id de la Branche présent dans la valeur de 'name'
idBranch=$(echo "$name" | cut -d'_' -f1)
echo "idBranch : $idBranch"

mkdir -p ./cache_test/cache_test_RGBIR/result_ozcpp_idBr${idBranch}/out_graph
mkdir -p ./cache_test/cache_test_RGBIR/result_ozcpp_idBr${idBranch}/out_ortho

cp ./cache_test/cache_test_RGBIR/graph/21/00/00/01/VN/${idBranch}_AQ.tif ./cache_test/cache_test_RGBIR/result_ozcpp_idBr${idBranch}/out_graph/out_${idBranch}_AQ_georef.tif
cp ./cache_test/cache_test_RGBIR/ortho/21/00/00/01/VN/${idBranch}_AQ.tif ./cache_test/cache_test_RGBIR/result_ozcpp_idBr${idBranch}/out_ortho/out_${idBranch}_AQ_georef.tif
cp ./cache_test/cache_test_RGBIR/ortho/21/00/00/01/VN/${idBranch}_AQi.tif ./cache_test/cache_test_RGBIR/result_ozcpp_idBr${idBranch}/out_ortho/out_${idBranch}_AQi_georef.tif