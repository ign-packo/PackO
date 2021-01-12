{
   "targets": [
       {
           "target_name": "rok4IO",
           "sources": [ 
             "rok4IO/rok4IO.cpp", 
             "rok4IO/ImageIO.cpp",
             # LIB JPEG:
            ###########
            "libjpeg/jaricom.c",
            "libjpeg/jcapimin.c",
            "libjpeg/jcapistd.c",
            "libjpeg/jcarith.c",
            "libjpeg/jccoefct.c",
            "libjpeg/jccolor.c",
            "libjpeg/jcdctmgr.c",
            "libjpeg/jchuff.c",
            "libjpeg/jcinit.c",
            "libjpeg/jcmainct.c",
            "libjpeg/jcmarker.c",
            "libjpeg/jcmaster.c",
            "libjpeg/jcomapi.c",
            "libjpeg/jcparam.c",
            "libjpeg/jcprepct.c",
            "libjpeg/jcsample.c",
            "libjpeg/jctrans.c",
            "libjpeg/jdapimin.c",
            "libjpeg/jdapistd.c",
            "libjpeg/jdarith.c",
            "libjpeg/jdatadst.c",
            "libjpeg/jdatasrc.c",
            "libjpeg/jdcoefct.c",
            "libjpeg/jdcolor.c",
            "libjpeg/jddctmgr.c",
            "libjpeg/jdhuff.c",
            "libjpeg/jdinput.c",
            "libjpeg/jdmainct.c",
            "libjpeg/jdmarker.c",
            "libjpeg/jdmaster.c",
            "libjpeg/jdmerge.c",
            "libjpeg/jdpostct.c",
            "libjpeg/jdsample.c",
            "libjpeg/jdtrans.c",
            "libjpeg/jerror.c",
            "libjpeg/jfdctflt.c",
            "libjpeg/jfdctfst.c",
            "libjpeg/jfdctint.c",
            "libjpeg/jidctflt.c",
            "libjpeg/jidctfst.c",
            "libjpeg/jidctint.c",
            "libjpeg/jmemmgr.c",
            "libjpeg/jmemnobs.c",
            "libjpeg/jquant1.c",
            "libjpeg/jquant2.c",
            "libjpeg/jutils.c",
            "libjpeg/rdbmp.c",
            "libjpeg/rdcolmap.c",
            "libjpeg/rdgif.c",
            "libjpeg/rdppm.c",
            "libjpeg/rdrle.c",
            "libjpeg/rdswitch.c",
            "libjpeg/rdtarga.c",
            "libjpeg/transupp.c",
            "libjpeg/wrbmp.c",
            "libjpeg/wrgif.c",
            "libjpeg/wrppm.c",
            "libjpeg/wrrle.c",
            "libjpeg/wrtarga.c",
            # LIB PNG:
            ##########
            "libpng/png.c",
            "libpng/pngerror.c",
            "libpng/pngget.c",
            "libpng/pngmem.c",
            "libpng/pngpread.c",
            "libpng/pngread.c",
            "libpng/pngrio.c",
            "libpng/pngrtran.c",
            "libpng/pngrutil.c",
            "libpng/pngset.c",
            "libpng/pngtrans.c",
            "libpng/pngwio.c",
            "libpng/pngwrite.c",
            "libpng/pngwtran.c",
            "libpng/pngwutil.c",
             ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "rok4IO", "libpng", "libjpeg"
      ],
      "dependencies": [
        "<!@(node -p \"require('node-addon-api').gyp\")"
      ],
      #####
      #
      # Disable N-API C++ wrapper classes to integrate C++/JS exception handling
      #
      #####
      "libraries": [ 
       ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
       }
   ]
}
