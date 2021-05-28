%module rok4_io
%{
  extern void Jpeg2Rok(const char*nomJpeg, const char*nomRok, int tileWidth, int tileHeight);
  extern void Png2Rok(const char *nomPng, const char*nomRok, int tileWidth, int tileHeight);
  extern void Rok2Jpeg(const char*nomRok, const char*nomJpeg);
  extern void Rok2Png(const char*nomRok, const char*nomPng);
%}

extern void Jpeg2Rok(const char*nomJpeg, const char*nomRok, int tileWidth, int tileHeight);
extern void Png2Rok(const char *nomPng, const char*nomRok, int tileWidth, int tileHeight);
extern void Rok2Jpeg(const char*nomRok, const char*nomJpeg);
extern void Rok2Png(const char*nomRok, const char*nomPng);

//on import
%pythoncode
%{
print("ROK4 is on!")
%}