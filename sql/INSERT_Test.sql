--INSERT INTO caches (name,path) VALUES ('cache1', '/D/') returning id;
--SELECT * FROM branches WHERE id_cache=18;
--INSERT INTO opi (id_cache, name, color) VALUES (18, 'OPI_TEST','{12,13,14}') returning id;
--INSERT INTO patches (num, id_branch, geom, active, id_opi) VALUES (1, 18, 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))', true, 4) returning id;
--INSERT INTO slabs (id_patch,x,y,z) VALUES (10, 100, 200, 300);
--INSERT INTO branches (name,id_cache) VALUES ('branch1',18) returning id;
INSERT INTO styles (name,opacity,visibility,style_itowns) VALUES ('Remarques',1,true,'{"fill": {"color": "#ee6d03", "opacity": 0.7}, "point": {"color": "#ee6d03", "radius": 5}, "stroke": {"color": "#ee6d03"}}') returning id;