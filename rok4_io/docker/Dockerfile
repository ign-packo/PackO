FROM ubuntu:20.04

RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections

RUN apt-get update -y \
  && apt-get install -y --fix-missing --no-install-recommends \
    python3-gdal build-essential python3-dev swig 

## in order to have the .h for the libpng and libjped
RUN apt-get install -y --fix-missing --no-install-recommends \
    libpng-dev libjpeg-dev
