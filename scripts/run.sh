docker run --rm -ti -v /Volumes/PAOT\ 21/ZoneTestPCRS/:/data/ZoneTestPCRS -v `pwd`/..:/data -p 5432:5432/tcp --network host -v /Volumes/PAOT\ 21/ZoneTestPCRS/:/data/ZoneTestPCRS -w /data osgeo/gdal  bash