#include <napi.h>
#include <iostream>
#include "ImageIO.h"

class NAPI_ImageROK4 : public Napi::ObjectWrap<NAPI_ImageROK4> {
 public:
 static Napi::Object Init(Napi::Env env, Napi::Object exports){
    Napi::Function func = DefineClass(env, "ImageROK4", {
        InstanceMethod<&NAPI_ImageROK4::load>("load"),
        InstanceMethod<&NAPI_ImageROK4::info>("info"),
        InstanceMethod<&NAPI_ImageROK4::image>("image"),
        InstanceMethod<&NAPI_ImageROK4::getTile>("getTile"),
        InstanceMethod<&NAPI_ImageROK4::getEncodedTile>("getEncodedTile"),
        InstanceMethod<&NAPI_ImageROK4::getTiles>("getTiles"),
        InstanceMethod<&NAPI_ImageROK4::setTiles>("setTiles"),
        InstanceMethod<&NAPI_ImageROK4::create>("create"),
    });
    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    exports.Set("ImageROK4", func);
    env.SetInstanceData<Napi::FunctionReference>(constructor);
    return exports;
 }

  NAPI_ImageROK4(const Napi::CallbackInfo& info): ObjectWrap(info), _img(NULL) {
    // std::cout << "NAPI_ImageROK4 constructor"<<std::endl;
    if (info.Length() == 1) {
      _img = new ImageROK4(info[0].As<Napi::String>().Utf8Value());
    }
  }

  ~NAPI_ImageROK4(){
    // std::cout << "NAPI_ImageROK4 destructor"<<std::endl;
    if (_img) delete _img;
  }

  Napi::Value load(const Napi::CallbackInfo& info){
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (_img != NULL){
      deferred.Reject(
        Napi::TypeError::New(env, "image already loaded").Value()
      );
    } else {
      _img = new ImageROK4(info[0].As<Napi::String>().Utf8Value());
      deferred.Resolve(Napi::String::New(env, "Success"));
    }
    return deferred.Promise();
  }

  Napi::Value image(const Napi::CallbackInfo& info){
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (_img == NULL){
      deferred.Reject(
        Napi::TypeError::New(env, "No image").Value()
      );
    } else {
      unsigned char * buffer = _img->getImage(true);
      Napi::Buffer<unsigned char> bufferJS = Napi::Buffer<unsigned char>::Copy(env, buffer, _img->nXSize() * _img->nYSize() * _img->nBands());
      delete[] buffer;
      deferred.Resolve(bufferJS);
    }
    return deferred.Promise();
  }

  Napi::Value getTile(const Napi::CallbackInfo& info){
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (_img == NULL){
      deferred.Reject(
        Napi::TypeError::New(env, "No image").Value()
      );
    } else {
      unsigned char * buffer = NULL;
      size_t size = 0;
      _img->getTile(info[0].As<Napi::Number>().Uint32Value(), buffer, size);
      Napi::Buffer<unsigned char> bufferJS = Napi::Buffer<unsigned char>::Copy(env, buffer, size);
      delete[] buffer;
      deferred.Resolve(bufferJS);
    }
    return deferred.Promise();
  }

  Napi::Value getEncodedTile(const Napi::CallbackInfo& info){
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (_img == NULL){
      deferred.Reject(
        Napi::TypeError::New(env, "No image").Value()
      );
    } else {
      char * buffer = NULL;
      size_t size = 0;
      _img->getEncodedTile(info[0].As<Napi::Number>().Uint32Value(), buffer, size);
      Napi::Buffer<char> bufferJS = Napi::Buffer<char>::Copy(env, buffer, size);
      delete[] buffer;
      deferred.Resolve(bufferJS);
    }
    return deferred.Promise();
  }

  Napi::Value getTiles(const Napi::CallbackInfo& info){
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (_img == NULL){
      deferred.Reject(
        Napi::TypeError::New(env, "No image").Value()
      );
    } else {
      Napi::Array numTiles = info[0].As<Napi::Array>();
      Napi::Array result = Napi::Array::New(env, numTiles.Length());
      for(size_t i=0;i<numTiles.Length();++i){
        Napi::Value N=numTiles[i];
        unsigned char * buffer = NULL;
        size_t size = 0;
        _img->getTile(N.As<Napi::Number>().Uint32Value(), buffer, size);
        result[i] = Napi::Buffer<unsigned char>::Copy(env, buffer, size);
        delete[] buffer;
      }
      deferred.Resolve(result);
    }
    return deferred.Promise();
  }

  Napi::Value setTiles(const Napi::CallbackInfo& info){
    std::cout << "SetTiles"<<std::endl;
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (_img == NULL){
      deferred.Reject(
        Napi::TypeError::New(env, "No image").Value()
      );
    } else {
      std::string nomOut = info[0].As<Napi::String>().Utf8Value();
      std::cout << "nomOut : "<<nomOut<<std::endl;
      Napi::Array numTiles = info[1].As<Napi::Array>();
      Napi::Array bufferTiles = info[2].As<Napi::Array>();
      std::map<int, unsigned char*> mTiles;
      for(size_t i=0;i<numTiles.Length();++i){
        Napi::Value N=numTiles[i];
        Napi::Value B=bufferTiles[i];
        std::pair<int, unsigned char*> t(N.As<Napi::Number>().Uint32Value(), (unsigned char*) B.As<Napi::Buffer<unsigned char>>().Data());
        std::cout << t.first<<std::endl;
        mTiles.insert(t);
      }
      _img->setTiles(nomOut,mTiles);
      deferred.Resolve(Napi::String::New(env, "Success"));
    }
    return deferred.Promise();
  }

  Napi::Value info(const Napi::CallbackInfo& info){
    Napi::Env env = info.Env();
    if (_img == NULL) {
      return Napi::TypeError::New(env, "No image").Value();
    }
    Napi::Array result = Napi::Array::New(env, 5);
    int i=0;
    result[i++] = Napi::Number::New(env, _img->nXSize());
    result[i++] = Napi::Number::New(env, _img->nYSize());
    result[i++] = Napi::Number::New(env, _img->nBands());
    result[i++] = Napi::Number::New(env, _img->tileWidth());
    result[i++] = Napi::Number::New(env, _img->tileHeight());
    return result;
  }

  Napi::Value create(const Napi::CallbackInfo& info){
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    std::string nomImg =  info[0].As<Napi::String>().Utf8Value();
    unsigned char* buffer = (unsigned char*) info[1].As<Napi::Buffer<unsigned char>>().Data();
    size_t nXSize = info[2].As<Napi::Number>().Uint32Value();
    size_t nYSize = info[3].As<Napi::Number>().Uint32Value();
    size_t nBands = info[4].As<Napi::Number>().Uint32Value();
		bool jpg = false;
    bool interleaved = true;
		size_t tileWidth = info[5].As<Napi::Number>().Uint32Value();
    size_t tileHeight = tileWidth;
    ImageROK4::Create(nomImg, buffer, nXSize, nYSize, nBands, jpg, interleaved, tileWidth, tileHeight);
    deferred.Resolve(Napi::String::New(env, "Success"));
    return deferred.Promise();
  }

 private:
  ImageROK4 *_img;
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  NAPI_ImageROK4::Init(env, exports);
  return exports;
}

NODE_API_MODULE(addon, Init)
