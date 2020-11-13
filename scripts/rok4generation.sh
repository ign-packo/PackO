for nom in $@
do
out=`echo $nom | perl -pe 's/png/tif/g'`
echo $out
work2cache $nom -c lzw $out
cp $nom.aux.xml $out.aux.xml
done
