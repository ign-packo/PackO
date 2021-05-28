#!/usr/bin/env python
import distutils
from distutils.core import setup, Extension

setup(name = "ROK4_io",
    version = "0.1",
    url = 'https://github.com/ign-packo/PackO',
    author = "IGN",
    ext_modules = [
        Extension(
            "_rok4_io", sources = ["rok4_io.i", "ImageIO.cpp"],
            swig_opts=['-Wall','-c++','-py3'],
            libraries = ['jpeg', 'png']
        )
    ],
    py_modules = ['rok4_io']
)
