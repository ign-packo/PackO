import sys
import concurrent.futures
import getopt
import json
import gdal
import numpy as np
import math
import os
import json
import time
from pathlib import Path


# this allows GDAL to throw Python Exceptions
gdal.UseExceptions()
mem_drv = gdal.GetDriverByName('MEM')
jpegDriver = gdal.GetDriverByName( 'Jpeg' )
pngDriver = gdal.GetDriverByName( 'png' )

def update_tile_raster_with_ssech(tile):
    # mise a jour par sous ech 2
    y=tile["y"]
    x=tile["x"]
    z=tile["z"]
    cache=tile["dir"]
    out = {'x': x, 'y': y, 'z':z, 'dir':cache, 'status': 'nok'}

    # copie des images à mettre à jour
    graph_src = gdal.Open(os.path.join(cache,str(z),str(y),str(x),'graph.png'))
    graph = mem_drv.CreateCopy('',graph_src)
    ortho_src = gdal.Open(os.path.join(cache,str(z),str(y),str(x),'ortho.jpg'))
    ortho = mem_drv.CreateCopy('',ortho_src)
    
    # on cherche les 4 tiles filles (A, B, C, D)
    tile_root_A = os.path.join(cache,str(z+1),str(2*y),str(2*x))
    tile_root_B = os.path.join(cache,str(z+1),str(2*y),str(2*x+1))
    tile_root_C = os.path.join(cache,str(z+1),str(2*y+1),str(2*x))
    tile_root_D = os.path.join(cache,str(z+1),str(2*y+1),str(2*x+1))

    # chargement et sous ech2
    dim = (128, 128)
    img_graph_r = np.zeros((256,256), np.uint8)
    img_graph_g = np.zeros((256,256), np.uint8)
    img_graph_b = np.zeros((256,256), np.uint8)
    img_ortho_r = np.zeros((256,256), np.uint8)
    img_ortho_g = np.zeros((256,256), np.uint8)
    img_ortho_b = np.zeros((256,256), np.uint8)
    if (os.path.exists(os.path.join(tile_root_A,'graph.png'))):
        graph_A = gdal.Open(os.path.join(tile_root_A,'graph.png'))
        graph_A_r = graph_A.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_r[0:128, 0:128] = graph_A_r
        graph_A_g = graph_A.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_g[0:128, 0:128] = graph_A_g
        graph_A_b = graph_A.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_b[0:128, 0:128] = graph_A_b
        ortho_A = gdal.Open(os.path.join(tile_root_A,'ortho.jpg'))
        ortho_A_r = ortho_A.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_r[0:128, 0:128] = ortho_A_r
        ortho_A_g = ortho_A.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_g[0:128, 0:128] = ortho_A_g
        ortho_A_b = ortho_A.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_b[0:128, 0:128] = ortho_A_b
    if (os.path.exists(os.path.join(tile_root_B,'graph.png'))):
        graph_B = gdal.Open(os.path.join(tile_root_B,'graph.png'))
        graph_B_r = graph_B.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_r[0:128,128:256] = graph_B_r
        graph_B_g = graph_B.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_g[0:128,128:256] = graph_B_g
        graph_B_b = graph_B.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_b[0:128,128:256] = graph_B_b
        ortho_B = gdal.Open(os.path.join(tile_root_B,'ortho.jpg'))
        ortho_B_r = ortho_B.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_r[0:128,128:256] = ortho_B_r
        ortho_B_g = ortho_B.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_g[0:128,128:256] = ortho_B_g
        ortho_B_b = ortho_B.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_b[0:128,128:256] = ortho_B_b
    if (os.path.exists(os.path.join(tile_root_C,'graph.png'))):
        graph_C = gdal.Open(os.path.join(tile_root_C,'graph.png'))
        graph_C_r = graph_C.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_r[128:256,0:128] = graph_C_r
        graph_C_g = graph_C.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_g[128:256,0:128] = graph_C_g
        graph_C_b = graph_C.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_b[128:256,0:128] = graph_C_b
        ortho_C = gdal.Open(os.path.join(tile_root_C,'ortho.jpg'))
        ortho_C_r = ortho_C.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_r[128:256,0:128] = ortho_C_r
        ortho_C_g = ortho_C.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_g[128:256,0:128] = ortho_C_g
        ortho_C_b = ortho_C.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_b[128:256,0:128] = ortho_C_b
    if (os.path.exists(os.path.join(tile_root_D,'graph.png'))):
        graph_D = gdal.Open(os.path.join(tile_root_D,'graph.png'))
        graph_D_r = graph_D.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_r[128:256,128:256] = graph_D_r
        graph_D_g = graph_D.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_g[128:256,128:256] = graph_D_g
        graph_D_b = graph_D.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_graph_b[128:256,128:256] = graph_D_b
        ortho_D = gdal.Open(os.path.join(tile_root_D,'ortho.jpg'))
        ortho_D_r = ortho_D.GetRasterBand(1).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_r[128:256,128:256] = ortho_D_r
        ortho_D_g = ortho_D.GetRasterBand(2).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_g[128:256,128:256] = ortho_D_g
        ortho_D_b = ortho_D.GetRasterBand(3).ReadAsArray(buf_xsize=128, buf_ysize=128, resample_alg= gdal.GRA_Average)
        img_ortho_b[128:256,128:256] = ortho_D_b

    # ecriture
    graph.GetRasterBand(1).WriteArray(img_graph_r)
    graph.GetRasterBand(2).WriteArray(img_graph_g)
    graph.GetRasterBand(3).WriteArray(img_graph_b)
    pngDriver.CreateCopy(os.path.join(cache,str(z),str(y),str(x),'graph.png'), graph)
    ortho.GetRasterBand(1).WriteArray(img_ortho_r)
    ortho.GetRasterBand(2).WriteArray(img_ortho_g)
    ortho.GetRasterBand(3).WriteArray(img_ortho_b)
    jpegDriver.CreateCopy(os.path.join(cache,str(z),str(y),str(x),'ortho.jpg'), ortho)
  
    out['status']='ok'
    return out

def update_tile_raster_with_rasterize(tile):
    # mise a jour par rasterisation du geojson
    y=tile["y"]
    x=tile["x"]
    z=tile["z"]
    cache=tile["dir"]+"/"+str(z)
    out = {'x': x, 'y': y, 'z':z, 'dir':tile["dir"], 'status': 'nok'}
    geojson=tile["geojson"]
    tile_root = os.path.join(cache,str(y),str(x))
    print('tile_root: ', tile_root)
    print('update_tile_raster')
    color = geojson['features'][0]['properties']['color']
    cliche = ((geojson['features'][0]['properties']['cliche']).split('/')[-1]).split('.')[0]
    print('cliche: ', cliche)
    poly=gdal.OpenEx(json.dumps(geojson))
    graph_src = gdal.Open(tile_root+'/graph.png')
    graph = mem_drv.CreateCopy('',graph_src) 
    print('graph :', graph.GetGeoTransform())
    mask = mem_drv.Create('', 256, 256, 1, gdal.GDT_Byte)
    mask.SetGeoTransform(graph.GetGeoTransform())
    # mask.SetProjection(wktL93)
    debut=time.time()
    gdal.Rasterize(mask, poly, burnValues='255')
    print('Rasterize time: ',time.time()-debut,'s')
    img_mask = mask.GetRasterBand(1).ReadAsArray()
    # on applique le mask sur le graph
    for c in range(3):
        graph_c = graph.GetRasterBand(c+1).ReadAsArray()
        graph_c[(img_mask != 0)] = color[c]
        graph.GetRasterBand(c+1).WriteArray(graph_c)
    pngDriver.CreateCopy(tile_root+"/graph.png", graph)
    # on applique le mask sur l opi
    opi = None
    if Path(tile_root+'/'+cliche+'.jpg').is_file():
        opi = gdal.Open(tile_root+'/'+cliche+'.jpg')
    ortho_src = gdal.Open(tile_root+'/ortho.jpg')
    ortho = mem_drv.CreateCopy('',ortho_src) 
    for c in range(3):
        ortho_c = ortho.GetRasterBand(c+1).ReadAsArray()
        # on met a zero ce qui dans le masque dans l'ortho
        ortho_c[(img_mask != 0)] = 0
        if (opi != None):
            opi_c = opi.GetRasterBand(c+1).ReadAsArray()
            # on met a zero ce qui est hors du masque dans l'opi
            opi_c[(img_mask == 0)] = 0
            # on somme dans l'ortho
            newortho_c = np.add(ortho_c, opi_c)
        else:
            newortho_c = ortho_c
        ortho.GetRasterBand(c+1).WriteArray(newortho_c)
    jpegDriver.CreateCopy(tile_root+"/ortho.jpg", ortho)
    out['status']='ok'
    return out


def list_tiles(geojson, X0, Y0, R, z, dir):
    L=[]
    # on cherche la BBox du geojson
    BBox={'xmin':None, 'ymin':None, 'xmax':None, 'ymax':None}
    for feature in geojson['features']:
        for point in feature['geometry']['coordinates'][0]:
            if (BBox['xmin']):
                BBox['xmin'] = min( BBox['xmin'], point[0])
                BBox['ymin'] = min( BBox['ymin'], point[1])
                BBox['xmax'] = max( BBox['xmax'], point[0])
                BBox['ymax'] = max( BBox['ymax'], point[1])
            else:
                BBox['xmin'] = point[0]
                BBox['ymin'] = point[1]
                BBox['xmax'] = point[0]
                BBox['ymax'] = point[1]
    print('BBox: ',BBox) 

    x0 = math.floor((BBox['xmin']-X0)/(R*256))
    x1 = math.ceil((BBox['xmax']-X0)/(R*256))
    y0 = math.floor((Y0-BBox['ymax'])/(R*256))
    y1 = math.ceil((Y0-BBox['ymin'])/(R*256))
    for y in range(y0,y1):
        for x in range(x0,x1):
            L.append({"y":y,"x":x,"z":z, "geojson":geojson, "dir":dir})
    return L

def patch(cacheDir, geojson):
    print(cacheDir, geojson)
    out={'tiles':[]}
    resolution = 0.05
    for z in range(21, 9, -1):
        L = list_tiles(geojson, 0, 12000000, resolution, z, cacheDir)
        print(z, len(L))
        # method = update_tile_raster_with_rasterize
        method = update_tile_raster_with_ssech
        if (z == 21):
            method = update_tile_raster_with_rasterize
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            Res = executor.map(method, L)
            for res in Res:
                if (res):
                    out['tiles'].append(res)
        resolution *= 2
    print(out)

def usage():
    print('Patch.py -C cacheDir')

def main(argv):
    try:
        opts, args = getopt.getopt(argv, "hC:", ["help", "cacheDir="])
    except getopt.GetoptError:
        usage()
        sys.exit(2)

    cacheDir = "cache"
    for opt, arg in opts:
        if (opt == '-h'):
            usage()
            sys.exit()
        if (opt == '-C'):
            cacheDir = arg
        
    lines = sys.stdin.readlines()
    print(lines)
    print(json.dumps(patch(cacheDir, json.loads(lines[0]))))
    print("END")

if __name__ == "__main__":
    main(sys.argv[1:])