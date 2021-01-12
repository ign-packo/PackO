#include <memory.h>
#include <iostream>
#include <fstream>
#include <map>
#include <vector>
#include <complex>
#include <utility>
#include <algorithm>

#include "jpeglib.h"
#include "png.h"

#include "ImageIO.h"
// Debut de la partie JPG classique
void readImageJPG(char* jpg_buffer, unsigned long jpg_size , unsigned char* &raw_buffer, size_t &nXSize, size_t &nYSize, size_t &nBands){
	// Variables for the decompressor itself
	struct jpeg_decompress_struct cinfo;
	struct jpeg_error_mgr jerr;
	cinfo.err = jpeg_std_error(&jerr);	
	jpeg_create_decompress(&cinfo);
	jpeg_mem_src(&cinfo, (unsigned char*)jpg_buffer, jpg_size);
	jpeg_read_header(&cinfo, TRUE);
	jpeg_start_decompress(&cinfo);
	nXSize = cinfo.output_width;
	nYSize = cinfo.output_height;
	nBands = cinfo.output_components;
	// std::cout << "Image : "<<nXSize<<"x"<<nYSize<<"x"<<nBands<<std::endl;
	raw_buffer = new unsigned char [nXSize*nYSize*nBands];
	size_t row_stride = nXSize * nBands;
	//
	// Now that you have the decompressor entirely configured, it's time
	// to read out all of the scanlines of the jpeg.
	//
	// By default, scanlines will come out in RGBRGBRGB...  order, 
	// but this can be changed by setting cinfo.out_color_space
	//
	// jpeg_read_scanlines takes an array of buffers, one for each scanline.
	// Even if you give it a complete set of buffers for the whole image,
	// it will only ever decompress a few lines at a time. For best 
	// performance, you should pass it an array with cinfo.rec_outbuf_height
	// scanline buffers. rec_outbuf_height is typically 1, 2, or 4, and 
	// at the default high quality decompression setting is always 1.
	// std::cout << "Debut de la decompression"<<std::endl;
	unsigned char *buffer_array[1];
	while (cinfo.output_scanline < cinfo.output_height) {
		buffer_array[0] = raw_buffer + (cinfo.output_scanline) * row_stride;
		jpeg_read_scanlines(&cinfo, buffer_array, 1);
	}
	// std::cout << "Fin de la decompression"<<std::endl;

	jpeg_finish_decompress(&cinfo);
	jpeg_destroy_decompress(&cinfo);
}

void writeImageJPG(char* &jpg_buffer, unsigned long &jpg_size , unsigned char* const &raw_buffer, size_t const &nXSize, size_t const &nYSize, size_t const &nBands, int quality){
	// Variables for the decompressor itself
	struct jpeg_compress_struct cinfo;
	struct jpeg_error_mgr jerr;
	cinfo.err = jpeg_std_error(&jerr);	
	jpeg_create_compress(&cinfo);
	unsigned char * outbuffer;
	jpg_size = 0;
	jpeg_mem_dest(&cinfo, &outbuffer, &jpg_size);	
	cinfo.image_width = nXSize;
	cinfo.image_height = nYSize;
	cinfo.input_components = nBands;
	cinfo.in_color_space = JCS_RGB;
	jpeg_set_defaults(&cinfo);
	jpeg_set_quality(&cinfo, quality, (boolean)0);
	jpeg_start_compress(&cinfo, TRUE);
	unsigned char *buffer_array[1];
	size_t row_stride = nXSize * nBands;
	// std::cout << "debut de la compression "<<nXSize<<" "<<nYSize<<" "<<nBands<<" "<<quality<<std::endl;
	while (cinfo.next_scanline < cinfo.image_height) {
		buffer_array[0] = raw_buffer + (cinfo.next_scanline) * row_stride;
		jpeg_write_scanlines(&cinfo, buffer_array, 1);
	}
	// std::cout << "fin de la compression"<<std::endl;
	jpeg_finish_compress(&cinfo);
	jpeg_destroy_compress(&cinfo);
	jpg_buffer= new char[jpg_size];
	memcpy(jpg_buffer, outbuffer, jpg_size);
	free(outbuffer);
}
// Fin de la partie JPG classique

// Debut de la partie PNG classique
typedef struct {
    png_bytep buffer;
    png_size_t bufsize;
    png_size_t current_pos;
} png_reader_state;

void ReadDataFromMem(png_structp png_ptr, png_bytep outBytes, png_size_t byteCountToRead){
   png_reader_state *io_ptr = (png_reader_state*)png_get_io_ptr(png_ptr);
   if ((io_ptr == NULL) || (byteCountToRead > (io_ptr->bufsize - io_ptr->current_pos))){
	   png_error(png_ptr, "read error in read_data_memory (loadpng)");
	   return;
   }
    memcpy(outBytes, io_ptr->buffer + io_ptr->current_pos, byteCountToRead);
    io_ptr->current_pos += byteCountToRead;
}

void WriteDataToMem(png_structp png_ptr, png_bytep inBytes, png_size_t byteCountToWrite){
   std::vector<png_byte> *io_ptr = (std::vector<png_byte>*)png_get_io_ptr(png_ptr);
   if(io_ptr == NULL)
      return;   // add custom error handling here
   io_ptr->insert(io_ptr->end(), inBytes, inBytes + byteCountToWrite);
}

void FlushOutput(png_structp png_ptr){
}

void readImagePNG(char* png_buffer, unsigned long png_size , unsigned char * &raw_buffer, size_t &nXSize, size_t &nYSize, size_t &nBands){
  char header[8];
  memcpy(header, png_buffer, 8);
//   inputStream.read(header, 8);
  png_structp png_ptr = png_create_read_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
  png_infop info_ptr = png_create_info_struct(png_ptr);
  png_reader_state io_reader;
  io_reader.buffer = (png_bytep) png_buffer;
  io_reader.bufsize = (png_size_t) png_size;
  io_reader.current_pos = 8;
  png_set_read_fn(png_ptr, &io_reader, ReadDataFromMem);
  png_set_sig_bytes(png_ptr, 8);
  png_read_info(png_ptr, info_ptr);
  nXSize = png_get_image_width(png_ptr, info_ptr);
  nYSize = png_get_image_height(png_ptr, info_ptr);
  png_byte color_type = png_get_color_type(png_ptr, info_ptr);
  if (color_type == PNG_COLOR_TYPE_RGB) {
    nBands = 3;
  } else if (color_type == PNG_COLOR_TYPE_GRAY) {
    nBands = 1;
  } else {
    std::cout << "color_type non géré : "<<color_type<<std::endl;
  }
//   png_byte bit_depth = png_get_bit_depth(png_ptr, info_ptr);
  if (raw_buffer == NULL)
  	raw_buffer = new unsigned char[nXSize*nYSize*nBands];

  unsigned char ** row_pointers = new unsigned char* [nYSize];
  for (size_t y=0; y<nYSize; y++)
	row_pointers[y] = raw_buffer + y * nXSize * nBands;
  png_read_image(png_ptr, row_pointers);
  delete[] row_pointers;
}

void writeImagePNG(char* &png_buffer, unsigned long &png_size, unsigned char * const &raw_buffer, size_t nXSize, size_t nYSize, size_t nBands){
		unsigned char ** row_pointers = new unsigned char* [nYSize];
  		for (size_t y=0; y<nYSize; y++)
			row_pointers[y] = raw_buffer + y * nXSize*nBands;
		
		/* initialize stuff */
        png_structp png_ptr = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
        png_infop info_ptr = png_create_info_struct(png_ptr);
		// png_set_compression_buffer_size, par défaut : 8192
		// Si la libpng a besoin de plus, il y aura plusieurs IDAT chunks ce qui n'est pas géré par ROK4
		// Pour etre certain on prend: nXSize x nYSize x nBands
		png_set_compression_buffer_size(png_ptr, nXSize * nYSize * nBands);
        
        // setjmp(png_jmpbuf(png_ptr));
		std::vector<png_byte> io_writer;
        png_set_write_fn(png_ptr, &io_writer, WriteDataToMem, FlushOutput);
        png_byte bit_depth = 8;
        // png_init_io(png_ptr, fp);
        /* write header */
        setjmp(png_jmpbuf(png_ptr));
		int color_type = PNG_COLOR_TYPE_GRAY;
		if (nBands == 3)
			color_type = PNG_COLOR_TYPE_RGB;
        png_set_IHDR(png_ptr, info_ptr, nXSize, nYSize,
                      bit_depth, color_type, PNG_INTERLACE_NONE,
                      PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
        
        png_write_info(png_ptr, info_ptr);
        /* write bytes */
        setjmp(png_jmpbuf(png_ptr));
		// tres important pour la compatibilité ROK4
		png_set_filter(png_ptr, PNG_FILTER_TYPE_BASE, PNG_FILTER_NONE);
        png_write_image(png_ptr, row_pointers);
        /* end write */
        setjmp(png_jmpbuf(png_ptr));
        png_write_end(png_ptr, NULL);
        // fclose(fp);
		delete[] row_pointers;
		png_size = io_writer.size();
		png_buffer = new char[io_writer.size()];
		std::copy(io_writer.begin(), io_writer.end(), png_buffer);
}
// Fin de la partie PNG classique

void ImageROK4::decodeHeader(std::istream & in) {
	char C1, C2;
	in >> C1 >> C2;
	unsigned short tiffFormat;
	in.read((char*)&tiffFormat, sizeof(tiffFormat));
	unsigned short ifdOffset;
	in.read((char*)&ifdOffset, sizeof(ifdOffset));
	in.seekg(ifdOffset);
	unsigned short numDirEntries;
	in.read((char*)&numDirEntries, sizeof(numDirEntries));
	for(size_t i=0; i<numDirEntries;++i){
		in.seekg(ifdOffset + 2 + i*12);
		Tag T(in);
		std::pair<unsigned short, Tag> p(T.tagID, T);
		_tags.insert(p);
	}
}

void ImageROK4::encodeHeader(std::ostream & out, std::vector<Tag> const &tags) {
	// char C1, C2;
	out << 'I' << 'I';
	unsigned short tiffFormat = 42;
	out.write(reinterpret_cast<char*>(&tiffFormat), sizeof(unsigned short));
	unsigned short ifdOffset = 16;
	out.write(reinterpret_cast<char*>(&ifdOffset), sizeof(unsigned short));
	// size_t pos = out.tellp();
	// Je ne sais pas a quoi correspondent les bits suivant
	// debut
	unsigned char uc = 0;
	out.write(reinterpret_cast<char*>(&uc), sizeof(uc));
	out.write(reinterpret_cast<char*>(&uc), sizeof(uc));
	unsigned short us = 8;
	out.write(reinterpret_cast<char*>(&us), sizeof(us));
	out.write(reinterpret_cast<char*>(&us), sizeof(us));
	out.write(reinterpret_cast<char*>(&us), sizeof(us));
	out.write(reinterpret_cast<char*>(&us), sizeof(us));
	// fin 
	unsigned short numDirEntries = tags.size();

	out.write(reinterpret_cast<char*>(&numDirEntries), sizeof(numDirEntries));
	// unsigned int offset_data = 2048;
	for(size_t i=0; i<numDirEntries;++i){
		// tags[i].Info();
		out.seekp(ifdOffset + 2 + i*12);
		tags[i].Export(out);
	}
	out.seekp(ifdOffset + 2 + numDirEntries*12);
}


ImageROK4::ImageROK4(std::string const &nom):_url(nom){
			// Lecture de l'entete Tiff
			_in.open(_url, std::ios::in | std::ios::binary);
			unsigned char C1, C2;
			_in >> C1 >> C2;
			_le = (C1 == 'I') && (C2 == 'I');
			_in.seekg(0, std::ios::beg);
			decodeHeader(_in);
			_nXSize = _tags[256].values_UI[0];
			_nYSize = _tags[257].values_UI[0];
			_nBands = _tags[258].dataCount;
			_tileWidth = _tags[322].values_UI[0];
			_tileHeight = _tags[323].values_UI[0];
			if (_tags[259].values_US[0] == 7)
				_jpg = true;
			else
				_jpg = false;
			_nbTiles = _nXSize / _tileWidth * _nYSize / _tileHeight;
			unsigned char *data = new unsigned char[2 * _nbTiles * 4];
			_in.seekg(2048, std::ios::beg);
			_in.read((char *)data, 2 * _nbTiles * 4);	
			_offsets = new unsigned int[_nbTiles];
			_sizes = new unsigned int[_nbTiles];
			_tileMaxSize = 0;
			for(size_t i=0; i<_nbTiles; ++i) {
				// unsigned int v;
				if (_le) {
					_offsets[i] = (data[4*i+0]<<0) | (data[4*i+1]<<8) | (data[4*i+2]<<16) | (data[4*i+3]<<24);
				} else {
					_offsets[i] = (data[4*i+3]<<0) | (data[4*i+2]<<8) | (data[4*i+1]<<16) | (data[4*i+0]<<24);
				}
			}
			for(size_t i=0; i<_nbTiles; ++i) {
				// unsigned int v;
				if (_le) {
					_sizes[i] = (data[_nbTiles * 4 + 4*i+0]<<0) | (data[_nbTiles * 4 + 4*i+1]<<8) | (data[_nbTiles * 4 + 4*i+2]<<16) | (data[_nbTiles * 4 + 4*i+3]<<24);
				} else {
					_sizes[i] = (data[_nbTiles * 4 + 4*i+3]<<0) | (data[_nbTiles * 4 + 4*i+2]<<8) | (data[_nbTiles * 4 + 4*i+1]<<16) | (data[_nbTiles * 4 + 4*i+0]<<24);
				}
				if (_sizes[i] > _tileMaxSize)
					_tileMaxSize = _sizes[i];
			}
			delete[] data;
		}

ImageROK4::~ImageROK4(){
			_in.close();
			delete[] _offsets;
			delete[] _sizes;
		}

void ImageROK4::getTile(size_t numTile, unsigned char* &buffer, size_t &size)const{
			size = _tileHeight * _tileWidth * _nBands;
			buffer = new unsigned char[size];
			// decodage du PNG de la tuile
			size_t NC, NL, Nbands;
			_in.seekg(_offsets[numTile], std::ios::beg);
			char* input_buffer = new char[_sizes[numTile]];
			_in.read(input_buffer, _sizes[numTile]);			
			if (_jpg){
				readImageJPG(input_buffer, _sizes[numTile], buffer, NC, NL, Nbands);
			}
			else{
				readImagePNG(input_buffer, _sizes[numTile], buffer, NC, NL, Nbands);
			}
			delete[] input_buffer;
		}

void ImageROK4::getEncodedTile(size_t numTile, char* &buffer, size_t &size)const{
			_in.seekg(_offsets[numTile], std::ios::beg);
			size = _sizes[numTile];
			buffer = new char[size];
			_in.read(buffer, size);			
		}

std::vector<unsigned char*> ImageROK4::getTiles(std::vector<size_t> numTiles)const{
			std::vector<unsigned char*> result;
			unsigned int max_buffer_size = 0;
			for(size_t i=0;i<numTiles.size();++i){
				max_buffer_size = std::max(max_buffer_size, _sizes[numTiles[i]]);
			}
			char* input_buffer = new char[max_buffer_size];
			for(size_t i=0;i<numTiles.size();++i){
				size_t numTile = numTiles[i];
				unsigned char *tileBuffer = new unsigned char[_tileHeight * _tileWidth * _nBands];
				// decodage du PNG de la tuile
				size_t NC, NL, Nbands;
				_in.seekg(_offsets[numTile], std::ios::beg);
				_in.read(input_buffer, _sizes[numTile]);
				if (_jpg){
					readImageJPG(input_buffer, _sizes[numTile], tileBuffer, NC, NL, Nbands);
				}
				else{
					readImagePNG(input_buffer, _sizes[numTile] , tileBuffer, NC, NL, Nbands);
				}
				result.push_back(tileBuffer);
			}
			delete[] input_buffer;
			return result;
		}

unsigned char* ImageROK4::getImage(bool interleaved)const{
			unsigned char* buffer = new unsigned char[_nXSize*_nYSize*_nBands];
			unsigned char *tileBuffer = new unsigned char[_tileHeight * _tileWidth * _nBands];
			size_t nbTilesX = _nXSize / _tileWidth;
			size_t nbTilesY = _nYSize / _tileHeight;
			unsigned int max_buffer_size = 0;
			for(size_t i=0; i<_nbTiles; ++i){
				max_buffer_size = std::max(max_buffer_size, _sizes[i]);
			}
			char* input_buffer = new char[max_buffer_size];
			for(size_t j=0;j<nbTilesY;++j){
				for(size_t i=0;i<nbTilesX; ++i){
					// decodage du PNG de la tuile
					size_t nTile = j*nbTilesX + i;
					size_t NC, NL, Nbands;
					_in.seekg(_offsets[nTile], std::ios::beg);
					_in.read(input_buffer, _sizes[nTile]);
					if (_jpg){						
						readImageJPG(input_buffer, _sizes[nTile], tileBuffer, NC, NL, Nbands);
					}
					else{
						readImagePNG(input_buffer, _sizes[nTile], tileBuffer, NC, NL, Nbands);
					}
					if (!interleaved) {
						// On passe de l'entrelace au canal par canal
						size_t offset = j*_tileHeight*_nXSize+i*_tileWidth;
						for(size_t l=0;l<_tileHeight;++l){
							for(size_t c=0;c<_tileWidth;++c){
								for(size_t k=0;k<_nBands;++k){
									buffer[offset + k*_nXSize*_nYSize + l*_nXSize + c] = tileBuffer[l*_tileWidth*_nBands+c*_nBands+k];
								}
							}
						}
					} else {
						// On passe recopie en entrelacé
						size_t offset = j*_tileHeight*_nXSize*_nBands+i*_tileWidth*_nBands;
						for(size_t l=0;l<_tileHeight;++l){
							for(size_t c=0;c<_tileWidth;++c){
								for(size_t k=0;k<_nBands;++k){
									buffer[offset + l*_nXSize*_nBands + c*_nBands + k] = tileBuffer[l*_tileWidth*_nBands+c*_nBands+k];
								}
							}
						}
					}
				}
			}
			delete[] tileBuffer;
			delete[] input_buffer;
			return buffer;
		}


void ImageROK4::setTiles(std::string const &nomImg, std::map<int, unsigned char*> const &mTiles)const{
			if (nomImg == _url){
				std::cout << "ERREUR : Impossible de mettre a jour en place"<<std::endl;
				return;
			}
			std::ofstream out(nomImg, std::ios::out | std::ios::binary);
			// Recopie de l'entete
			char header[2048];
			_in.seekg(std::ios::beg);
			_in.read(header, 2048);
			out.write(header, 2048);
			out.seekp(4096);
			for(size_t i=0; i<_nbTiles; ++i){
				std::map<int, unsigned char*>::const_iterator it = mTiles.find(i);
				char *out_buffer;
				size_t out_size;
				if (it != mTiles.end()){
					// mise a jour
					if (_jpg){
						writeImageJPG(out_buffer, out_size , (*it).second, _tileWidth, _tileHeight, _nBands);
					}
					else {
						writeImagePNG(out_buffer, out_size , (*it).second, _tileWidth, _tileHeight, _nBands);
					}
				} else {
					// recopie
					out_buffer = new char[_sizes[i]];
					out_size = _sizes[i];
					_in.seekg(_offsets[i], std::ios::beg);
					_in.read(out_buffer, _sizes[i]);
				}
				unsigned int deb = out.tellp();
				out.write (out_buffer, out_size);
				delete[] out_buffer;				
				// Mise a jour de l'entete
				out.seekp(2048 + i * 4, std::ios::beg);
				out.write(reinterpret_cast<char*>(&deb), sizeof(unsigned int));
				out.seekp(2048 + (_nbTiles + i) * 4, std::ios::beg);
				out.write(reinterpret_cast<char*>(&out_size), sizeof(unsigned int));
				out.seekp(deb + out_size + 16-out_size%16);
			}
			out.close();
		}


void ImageROK4::Create(	std::string const &nomImg, 
							unsigned char * const buffer, 
							size_t nXSize, size_t nYSize, size_t nBands, 
							bool jpg, bool interleaved,
							size_t tileWidth, size_t tileHeight) {
			std::ofstream out(nomImg, std::ios::out | std::ios::binary);
			size_t nbTilesX = nXSize / tileWidth;
			size_t nbTilesY = nYSize / tileHeight;
			size_t nbTiles = nbTilesX * nbTilesY;
			// Preparation des 11 tags de base
			std::vector<Tag> tags;
			tags.push_back(Tag(256, 4, 1, nXSize));
			tags.push_back(Tag(257, 4, 1, nYSize));
			tags.push_back(Tag(258, 3, nBands, 8));
			if (jpg){
				tags.push_back(Tag(259, 3, 1, 7));
				if (nBands == 3){
					tags.push_back(Tag(262, 3, 1, 6));
				} else {
					tags.push_back(Tag(262, 3, 1, 1));
				}
			}
			else {//png
				tags.push_back(Tag(259, 3, 1, 8));
				if (nBands == 3){
					tags.push_back(Tag(262, 3, 1, 2));
				} else {
					tags.push_back(Tag(262, 3, 1, 1));
				}
			}
			
			tags.push_back(Tag(277, 3, 1, nBands));
			tags.push_back(Tag(322, 4, 1, 256));
			tags.push_back(Tag(323, 4, 1, 256));
			tags.push_back(Tag(324, 4, 256, 2048));
			tags.push_back(Tag(325, 4, 256, 2048 + nbTiles*4));
			tags.push_back(Tag(339, 3, 1, 1));
			encodeHeader(out, tags);
			// ecriture des tuiles
			unsigned char *tileBuffer = new unsigned char[tileHeight * tileWidth * nBands];
			out.seekp(4096);
			for(size_t j=0;j<nbTilesY;++j){
				for(size_t i=0;i<nbTilesX; ++i){
					// encodage de la tuile
					size_t nTile = j*nbTilesX + i;
					size_t NC = tileWidth;
					size_t NL = tileHeight;
					if (!interleaved){
						// On passe du canal par canal a l'entrelace
						size_t offset = j*tileHeight*nXSize+i*tileWidth;
						for(size_t l=0;l<tileHeight;++l){
							for(size_t c=0;c<tileWidth;++c){
								for(size_t k=0;k<nBands;++k){
									tileBuffer[l*tileWidth*nBands+c*nBands+k] = buffer[offset + k*nXSize*nYSize + l*nXSize + c];
								}
							}
						}
					} else {
						// On passe copie le buffer
						size_t offset = j*tileHeight*nXSize*nBands+i*tileWidth*nBands;
						for(size_t l=0;l<tileHeight;++l){
							for(size_t c=0;c<tileWidth;++c){
								for(size_t k=0;k<nBands;++k){
									tileBuffer[l*tileWidth*nBands+c*nBands+k] = buffer[offset + l*nXSize*nBands+c*nBands+k];
								}
							}
						}
					}
					unsigned int deb = out.tellp();
					char *out_buffer=NULL;
					unsigned long out_size=0;
					if (jpg) {	
						writeImageJPG(out_buffer, out_size, tileBuffer, NC, NL, nBands);
					}
					else { // png
						writeImagePNG(out_buffer, out_size, tileBuffer, NC, NL, nBands);
					}
					out.write (out_buffer, out_size);
					delete[] out_buffer;
					
					unsigned int fin = out.tellp();
					unsigned int size = fin-deb;
					// on complete pour rester phaser sur 128bits
					fin += 16-size%16;
					// Mise a jour de l'entete
					out.seekp(2048 + nTile * 4, std::ios::beg);
					out.write(reinterpret_cast<char*>(&deb), sizeof(unsigned int));
					out.seekp(2048 + (nbTiles + nTile) * 4, std::ios::beg);
					out.write(reinterpret_cast<char*>(&size), sizeof(unsigned int));
					out.seekp(fin);
				}
			}
			delete[] tileBuffer;
			out.close();
		}

// Fin de la partie ROK4
