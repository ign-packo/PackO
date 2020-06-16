docker run --rm -ti -v /Volumes/GMAILLET/DATA/COG/OPI:/data/ZoneTestPCRS -v `pwd`/..:/data -p 5432:5432/tcp --network host -w /data osgeo/gdal  bash
