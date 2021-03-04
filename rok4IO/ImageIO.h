
#include <complex>
#include <vector>
#include <map>
#include <fstream>

// Gestion du JPG sans GDAL (les buffers sont en entrelaces)
void readImageJPG(char* jpg_buffer, unsigned long jpg_size , unsigned char* &raw_buffer, size_t &nXSize, size_t &nYSize, size_t &nBands);

void writeImageJPG(char* &jpg_buffer, unsigned long &jpg_size , unsigned char* const &raw_buffer, size_t const &nXSize, size_t const &nYSize, size_t const &nBands, int quality=95);

// Gestion du PNG sans GDAL (les buffers sont en entrelaces)
void readImagePNG(char* png_buffer, unsigned long png_size , unsigned char * &raw_buffer, size_t &nXSize, size_t &nYSize, size_t &nBands);

void writeImagePNG(char* &png_buffer, unsigned long &png_size, unsigned char * const &raw_buffer, size_t nXSize, size_t nYSize, size_t nBands);

class Tag{
	public:
	
	Tag(std::istream & in) {
		size_t offset = in.tellg();
		in.read((char*)&tagID, sizeof(tagID));
		in.read((char*)&dataType, sizeof(dataType));
		in.read((char*)&dataCount, sizeof(dataCount));
		in.read((char*)&dataOffset, sizeof(dataOffset));
		// std::cout << tagID << " " << dataType << " " << dataCount<<" "<<dataOffset<<std::endl;
		size_t nbBytes = getNbBytes();
  		if ((nbBytes * dataCount) <= 4) 
		  in.seekg(offset + 8);
		else
			in.seekg(dataOffset);
		switch (dataType) {
    		case 7:
    		case 1:
    		// Byte
			{
				unsigned char * values = new unsigned char[dataCount];
				in.read((char*)values, dataCount * sizeof(unsigned char));
				for(size_t i=0;i<dataCount;++i){
					values_UC.push_back(values[i]);
				}
				delete[] values;
			}		
				break;
    		case 2:
				// Null terminated string
				// values = buffer.readUInt8(offset + 8);
				break;
			case 3:
				// Short
			{
				unsigned short * values = new unsigned short[dataCount];
				in.read((char *)values, dataCount * sizeof(unsigned short));
				for(size_t i=0;i<dataCount;++i){
					values_US.push_back(values[i]);
				}
				delete[] values;
			}
				break;
			case 4:
				// Long
			{
				unsigned int *values = new unsigned int[dataCount];
				in.read((char *)values, dataCount * sizeof(unsigned int));
				for(size_t i=0;i<dataCount;++i){
					values_UI.push_back(values[i]);
				}
				delete[] values;
			}
				break;
			case 5:
				// Rational
			{
				unsigned int *values = new unsigned int[2*dataCount];
				in.read((char *)values, 2 * dataCount * sizeof(unsigned int));
				for(size_t i=0;i<2*dataCount;++i){
					values_UR.push_back(values[i]);
				}
				delete[] values;
			}
				break;
			break;
				case 6:
				// Signed Byte
			{
				char *values = new char[dataCount];
				in.read(values, dataCount * sizeof(char));
				for(size_t i=0;i<dataCount;++i){
					values_SC.push_back(values[i]);
				}
				delete[] values;
			}
				break;
			case 8:
				// Signed Short
			{
				short *values = new short[dataCount];
				in.read((char *)values, dataCount * sizeof(short));
				for(size_t i=0;i<dataCount;++i){
					values_SS.push_back(values[i]);
				}
				delete[] values;
			}		
				break;
			case 9:
				// Signed Long
			{
				int *values = new int[dataCount];
				in.read((char *)values, dataCount * sizeof(int));
				for(size_t i=0;i<dataCount;++i){
					values_SI.push_back(values[i]);
				}
				delete[] values;
			}
				break;
			case 10:
				// Rational
			{
				int *values = new int[2*dataCount];
				in.read((char *)values, 2 * dataCount * sizeof(int));
				for(size_t i=0;i<2*dataCount;++i){
					values_SR.push_back(values[i]);
				}
				delete[] values;
			}
				break;
			case 11:
				// Float
			{
				float *values = new float[dataCount];
				in.read((char *)values, dataCount * sizeof(float));
				for(size_t i=0;i<dataCount;++i){
					values_F.push_back(values[i]);
				}
				delete[] values;
			}
				break;
			case 12:
				// Double
			{
				double *values = new double[dataCount];
				in.read((char*)values, dataCount * sizeof(double));
				for(size_t i=0;i<dataCount;++i){
					values_D.push_back(values[i]);
				}
				delete[] values;
			}
				break;
  		}
	}

	Tag(Tag const &t){
		tagID  = t.tagID;
		dataType = t.dataType;
		dataCount = t.dataCount;
		dataOffset = t.dataOffset;
		
		values_UC = t.values_UC;
		values_SC = t.values_SC;
		values_US = t.values_US;
		values_SS = t.values_SS;
		values_UI = t.values_UI;
		values_SI = t.values_SI;
		values_UR = t.values_UR;
		values_SR = t.values_SR;
		values_F = t.values_F;
		values_D = t.values_D;
	}

	Tag(){
		tagID  = 0;
		dataType = 0;
		dataCount = 0;
		dataOffset = 0;
	}

	Tag(unsigned short const &aTagID,
		unsigned short const &aDataType,
		unsigned int const &aDataCount,
		unsigned int const &aDataOffset){
		tagID  = aTagID;
		dataType = aDataType;
		dataCount = aDataCount;
		dataOffset = aDataOffset;
	}

	~Tag(){
	}

	void Export(std::ostream & out)const {
		// size_t offset = out.tellp();
		out.write(reinterpret_cast<const char*>(&tagID), sizeof(tagID));
		out.write(reinterpret_cast<const char*>(&dataType), sizeof(dataType));
		out.write(reinterpret_cast<const char*>(&dataCount), sizeof(dataCount));
		out.write(reinterpret_cast<const char*>(&dataOffset), sizeof(dataOffset));
	}

	void Info()const {
		std::cout << tagID << " "<<dataType <<" "<<dataCount<<" "<<dataOffset<<std::endl;
		if (values_UC.size()>0){
			std::cout << "unsigned char : ";
			for(size_t i=0;i<values_UC.size();++i){
				std::cout << values_UC[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_SC.size()>0){
			std::cout << "signed char : ";
			for(size_t i=0;i<values_SC.size();++i){
				std::cout << values_SC[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_US.size()>0){
			std::cout << "unsigned short : ";
			for(size_t i=0;i<values_US.size();++i){
				std::cout << values_US[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_SS.size()>0){
			std::cout << "signed short : ";
			for(size_t i=0;i<values_SS.size();++i){
				std::cout << values_SS[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_UI.size()>0){
			std::cout << "unsigned int : ";
			for(size_t i=0;i<values_UI.size();++i){
				std::cout << values_UI[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_SI.size()>0){
			std::cout << "signed int : ";
			for(size_t i=0;i<values_SI.size();++i){
				std::cout << values_SI[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_UR.size()>0){
			for(size_t i=0;i<values_UR.size();++i){
				std::cout << values_UR[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_SR.size()>0){
			for(size_t i=0;i<values_SR.size();++i){
				std::cout << values_SR[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_F.size()>0){
			for(size_t i=0;i<values_F.size();++i){
				std::cout << values_F[i] << " ";
			}
			std::cout << std::endl;
		}
		if (values_D.size()>0){
			for(size_t i=0;i<values_D.size();++i){
				std::cout << values_D[i] << " ";
			}
			std::cout << std::endl;
		}
	}

		unsigned short tagID;
		unsigned short dataType;
		unsigned int dataCount;
		unsigned int dataOffset;
		
		std::vector<unsigned char> 	values_UC;
		std::vector<char> 			values_SC;
		std::vector<unsigned short> values_US;
		std::vector<short> 			values_SS;
		std::vector<unsigned int> 	values_UI;
		std::vector<int> 			values_SI;
		std::vector<unsigned int> 	values_UR;
		std::vector<int> 			values_SR;
		std::vector<float> 			values_F;
		std::vector<double> 		values_D;


	private:
		size_t getNbBytes() const{
			switch (dataType) {
				case 7:
				case 1:
				case 6:
				return 1;
				case 2:
				return 0;
				case 3:
				case 8:
				return 2;
				case 4:
				case 9:
				case 11:
				return 4;
				case 5:
				case 10:
				case 12:
				return 8;
				default:
				return 0;
			}
		}
};

class ImageROK4{
	public:
		ImageROK4(std::string const &nom);

		~ImageROK4();

		void getTile(size_t numTile, unsigned char* &buffer, size_t &size)const;

		void getEncodedTile(size_t numTile, char* &buffer, size_t &size)const;

		std::vector<unsigned char*> getTiles(std::vector<size_t> numTiles)const;

		unsigned char* getImage(bool interleaved)const;

		void setTiles(	std::string const &nomImg, 
						std::map<int, unsigned char*> const &mTiles)const;

		static void Create(	std::string const &nomImg, 
							unsigned char * const buffer, 
							size_t nXSize, size_t nYSize, size_t nBands, 
						 	bool jpg, bool interleaved,
							size_t tileWidth, size_t tileHeight);

	size_t nXSize()const{return _nXSize;}
	size_t nYSize()const{return _nYSize;}
	size_t nBands()const{return _nBands;}
	size_t tileWidth()const{return _tileWidth;}
	size_t tileHeight()const{return _tileHeight;}
	private:

		void decodeHeader(std::istream & in);
		static void encodeHeader(std::ostream & out, std::vector<Tag> const &tags);

		std::string _url;
		mutable std::ifstream _in;
		size_t _tileWidth;
		size_t _tileHeight;
		bool _jpg;
		bool _le;
		size_t _nXSize;
		size_t _nYSize;
		size_t _nBands;
		size_t _nbTiles;
		size_t _tileMaxSize;
		std::map<unsigned short, Tag> _tags;
		unsigned int * _offsets;
		unsigned int * _sizes;
};

void Jpeg2Rok(const char*nomJpeg, const char*nomRok, int tileWidth, int tileHeight);
void Png2Rok(const char *nomPng, const char*nomRok, int tileWidth, int tileHeight);
void Rok2Jpeg(const char*nomRok, const char*nomJpeg);
void Rok2Png(const char*nomRok, const char*nomPng);

