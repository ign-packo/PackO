#docker run -ti --rm -v `pwd`/cache:/cache -v `pwd`/scripts:/scripts rok4/rok4generation:3.7.2-buster bash

for nom in $@
do
out=`echo $nom | perl -pe 's/png/tif/g'`
echo $out
work2cache $nom -c lzw $out
done
