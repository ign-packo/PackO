--
-- Data for Name: caches; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.caches OVERRIDING SYSTEM VALUE VALUES (0, 'cache_test', NULL, NULL, 'cache_test');


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: postgres
--

--INSERT INTO public.branches OVERRIDING SYSTEM VALUE VALUES (0, 'orig', 0);


--
-- Data for Name: opi; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.opi OVERRIDING SYSTEM VALUE VALUES (0, 0, NULL, '19FD5606Ax00020_16371', '{126,222,76}');
INSERT INTO public.opi OVERRIDING SYSTEM VALUE VALUES (1, 0, NULL, '19FD5606Ax00020_16373', '{240,25,92}');
INSERT INTO public.opi OVERRIDING SYSTEM VALUE VALUES (2, 0, NULL, '19FD5606Ax00020_16372', '{218,145,208}');


--
-- Data for Name: patches; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: slabs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Name: caches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.caches_id_seq', 0, true);


--
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.branches_id_seq', 0, true);


--
-- Name: opi_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.opi_id_seq', 2, true);


--
-- Name: slabs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.slabs_id_seq', 0, false);


--
-- Name: patches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.patches_id_seq', 0, false);

