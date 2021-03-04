 %module rok4io
 %{
 /* Put header files here or function declarations like below */
#define SWIG_FILE_WITH_INIT
    extern void Jpeg2Rok(const char* nomJpeg, const char* nomRok, int tileWidth, int tileHeight);
    extern void Png2Rok(const char* nomPng, const char* nomRok, int tileWidth, int tileHeight);
    extern void Rok2Jpeg(const char*nomRok, const char*nomJpeg);
    extern void Rok2Png(const char*nomRok, const char*nomPng);


//  extern double My_variable;
//  extern int fact(int n);
//  extern int my_mod(int x, int y);
//  extern char *get_time();
 %}
 
    extern void Jpeg2Rok(const char* nomJpeg, const char* nomRok, int tileWidth, int tileHeight);
    extern void Png2Rok(const char* nomPng, const char* nomRok, int tileWidth, int tileHeight);
    extern void Rok2Jpeg(const char*nomRok, const char*nomJpeg);
    extern void Rok2Png(const char*nomRok, const char*nomPng);
//  extern double My_variable;
//  extern int fact(int n);
//  extern int my_mod(int x, int y);
//  extern char *get_time();