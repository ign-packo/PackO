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


# this allows GDAL to throw Python Exceptions
gdal.UseExceptions()
mem_drv = gdal.GetDriverByName('MEM')
jpegDriver = gdal.GetDriverByName( 'Jpeg' )
pngDriver = gdal.GetDriverByName( 'png' )


def update_tile_raster(tile):
    # print('update_tile_raster:',tile)
    y=tile["y"]
    x=tile["x"]
    cache=tile["dir"]
    # out = {'x': x, 'y': y, 'z':z, 'status': 'nok', 'allChildren': (z==cache['zoom']['max'])}
    geojson=tile["geojson"]
    # cliche=tile["cliche"]
    # restile = cache['resolution']/pow(2,int(z))
    tile_root = os.path.join(cache,str(y),str(x))
    print('tile_root: ', tile_root)
    print('update_tile_raster')
    color = geojson['features'][0]['properties']['color']
    cliche = geojson['features'][0]['properties']['cliche']
    poly=gdal.OpenEx(json.dumps(geojson))
    graph = gdal.Open(tile_root+'/graph.png')
    print('graph :', graph.GetGeoTransform())
    mask = mem_drv.Create('', 256, 256, 1, gdal.GDT_Byte)
    mask.SetGeoTransform(graph.GetGeoTransform())
    # mask.SetProjection(wktL93)
    debut=time.time()
    gdal.Rasterize(mask, poly, burnValues='255')
    print('Rasterize time: ',time.time()-debut,'s')
    img_mask = mask.GetRasterBand(1).ReadAsArray()
    # on applique le mask sur le graph
    graph_r = graph.GetRasterBand(1).ReadAsArray()
    graph_r[(img_mask != 0)] = color[0]
    graph.GetRasterBand(1).WriteArray(graph_r)
    graph_g = graph.GetRasterBand(2).ReadAsArray()
    graph_g[(img_mask != 0)] = color[1]
    graph.GetRasterBand(2).WriteArray(graph_g)
    graph_b = graph.GetRasterBand(3).ReadAsArray()
    graph_b[(img_mask != 0)] = color[2]
    graph.GetRasterBand(3).WriteArray(graph_b)
    pngDriver.CreateCopy(tile_root+"/graph.png", graph)
    # on applique le mask sur l opi
    
    # img_graph = cv.imread(os.path.join(tile_root,'graph.png'))
    # img_graph[(img_mask==255)] = color
    # cv.imwrite(os.path.join(tile_root,'graph.png'), img_graph)
    # # on applique le mask sur l opi
    # opiFile = os.path.join(tile_root,cliche+'.jpg')
    # if (os.path.exists(opiFile)):
    #     img_ortho = cv.imread(os.path.join(tile_root,'ortho.jpg'))
    #     img_opi = cv.imread(opiFile)
    #     img_opi[(img_mask!=255)] = 0
    #     img_ortho[(img_mask==255)] = 0
    #     img_ortho = cv.add(img_opi, img_ortho)
    #     cv.imwrite(os.path.join(tile_root,'ortho.jpg'), img_ortho)
    #     out['status']='ok'
    # return out


def list_tiles(geojson, X0, Y0, R, dir):
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
            L.append({"y":y,"x":x,"geojson":geojson, "dir":dir})
    return L

def patch(cacheDir, geojson):
    print(cacheDir, geojson)
    out={'tiles':[]}
    L = list_tiles(geojson, 0, 12000000, 0.05, cacheDir+"/21")
    print(L)
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        Res = executor.map(update_tile_raster, L)
        for res in Res:
            if (res):
                out['tiles'].append(res)
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