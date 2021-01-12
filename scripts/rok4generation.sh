for nom in $(find $1 -name '*.png' ); 
do
echo $nom
out=`echo $nom | perl -pe 's/png/tif/g'`
echo $out
./std2rok $nom $out
cp $nom.aux.xml $out.aux.xml
done
for nom in $(find $1 -name '*.jpg' ); 
do
echo $nom
out=`echo $nom | perl -pe 's/jpg/tif/g'`
echo $out
./std2rok $nom $out
cp $nom.aux.xml $out.aux.xml
done