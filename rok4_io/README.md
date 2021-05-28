# ROK4 Module for Python

## Compilation
Tested only on Linux

### Dependencies:

- build-essential 
- python3-dev
- libpng-dev 
- libjpeg-dev
- swig

`apt install build-essential python3-dev libpng-dev libjpeg-dev swig`

### Commands

`python3 setup.py install --user`

The resulting Python module consists of *rok4_io.py* and *_rok4_io.cpython-38-x86_64-linux-gnu.so*, those files are copied to ~/.local folder

To clean all that was generated:

`python3 setup.py clean`

### Usage

`import rok4_io`


