--
-- PostgreSQL database dump
--

\restrict QAFZyaWc5bQQBoe7FfmzWa5YD3HpYee6W6g2YJtff0gGX0fX42PfAGbDCj9FPjh

-- Dumped from database version 17.12 (Ubuntu 17.12-1.pgdg24.04+1)
-- Dumped by pg_dump version 19.0 (Ubuntu 19.0-1.pgdg24.04+1)

-- Started on 2026-11-20 09:36:20 CET

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
SET TIME ZONE 'UTC';

--
-- TOC entry 2 (class 3079 OID 406102)
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- TOC entry 4494 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry, geography, and raster spatial types and functions';


--
-- TOC entry 1695 (class 1247 OID 407222)
-- Name: processes_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.processes_status AS ENUM (
    'running',
    'failed',
    'succeed'
);


ALTER TYPE public.processes_status OWNER TO postgres;

--
-- TOC entry 417 (class 1255 OID 407229)
-- Name: auto_num_layers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_num_layers() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	NEW.num = (
		SELECT  
	CASE WHEN max(num) IS NULL THEN 1
	ELSE max(num) + 1
	END next_num
	FROM layers
	WHERE 
		id_branch=NEW.id_branch 
	);
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_num_layers() OWNER TO postgres;

--
-- TOC entry 1044 (class 1255 OID 407230)
-- Name: auto_num_patches_and_delete_unactive(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_num_patches_and_delete_unactive() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
	DELETE FROM patches 
	WHERE 
		id_branch=NEW.id_branch 
		AND 
		active=False;
	NEW.num = (
		SELECT  
	CASE WHEN max(num) IS NULL THEN 1
	ELSE max(num) + 1
	END next_num
	FROM patches
	WHERE 
		id_branch=NEW.id_branch 
		AND 
		active=True
	);
	RETURN NEW;
END;$$;


ALTER FUNCTION public.auto_num_patches_and_delete_unactive() OWNER TO postgres;

--
-- TOC entry 471 (class 1255 OID 407231)
-- Name: check_before_patch_activation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_before_patch_activation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF NEW.num > (
		SELECT min(num) FROM patches
		WHERE id_branch=NEW.id_branch AND active=False)
	THEN 
		RAISE EXCEPTION 'patch activation impossible' USING ERRCODE='20808';
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_before_patch_activation() OWNER TO postgres;

--
-- TOC entry 871 (class 1255 OID 407232)
-- Name: check_before_patch_deactivation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_before_patch_deactivation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF NEW.num < (
		SELECT max(num) FROM patches
		WHERE id_branch=NEW.id_branch AND active=True)
	THEN 
		RAISE EXCEPTION 'patch desactivation impossible' USING ERRCODE='20808';
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_before_patch_deactivation() OWNER TO postgres;

--
-- TOC entry 380 (class 1255 OID 407233)
-- Name: create_orig_branch(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_orig_branch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	INSERT INTO branches (name,id_cache)
		VALUES ('orig', NEW.id);
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_orig_branch() OWNER TO postgres;

--
-- TOC entry 698 (class 1255 OID 407234)
-- Name: create_remarks_layer(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_remarks_layer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	INSERT INTO layers (name, crs, id_branch, id_style)
		SELECT 'Remarques', Caches.crs, NEW.id, 0
			FROM Caches
			WHERE Caches.id = NEW.id_cache;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_remarks_layer() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 224 (class 1259 OID 407235)
-- Name: backup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.backup (
    id integer NOT NULL,
    last_included_patch_id integer NOT NULL,
    date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.backup OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 407239)
-- Name: backup_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.backup ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.backup_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 407240)
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name character varying NOT NULL,
    id_cache integer NOT NULL
);


ALTER TABLE public.branches OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 407245)
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.branches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branches_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 228 (class 1259 OID 407246)
-- Name: caches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.caches (
    id integer NOT NULL,
    name character varying NOT NULL,
    crs character varying NOT NULL,
    v_packo character varying,
    date date,
    path character varying NOT NULL
);


ALTER TABLE public.caches OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 407251)
-- Name: caches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.caches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.caches_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 407252)
-- Name: feature_ctrs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feature_ctrs (
    id integer NOT NULL,
    status boolean,
    comment character varying,
    id_feature integer NOT NULL
);


ALTER TABLE public.feature_ctrs OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 407257)
-- Name: feature_ctrs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.feature_ctrs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.feature_ctrs_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 232 (class 1259 OID 407258)
-- Name: features; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.features (
    id integer NOT NULL,
    geom public.geometry NOT NULL,
    properties character varying,
    id_layer integer NOT NULL
);


ALTER TABLE public.features OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 407263)
-- Name: features_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.features ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.features_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 234 (class 1259 OID 407264)
-- Name: layers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.layers (
    id integer NOT NULL,
    name character varying NOT NULL,
    num integer NOT NULL,
    crs character varying NOT NULL,
    id_branch integer NOT NULL,
    id_style integer NOT NULL
);


ALTER TABLE public.layers OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 407269)
-- Name: features_json; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.features_json AS
 SELECT l.id AS id_layer,
    COALESCE(feature_json.features, '[]'::jsonb) AS features
   FROM (public.layers l
     LEFT JOIN ( SELECT t.id_layer,
            jsonb_agg(jsonb_build_object('type', 'Feature', 'geometry', (public.st_asgeojson(t.geom, 9, 0))::jsonb, 'properties', ((to_jsonb(t.*) - 'id_layer'::text) - 'geom'::text))) AS features
           FROM ( SELECT t1.id_layer,
                    t1.id,
                    t1.geom,
                    t1.properties,
                    t1.status,
                    t1.comment
                   FROM ( SELECT f.id_layer,
                            f.id,
                            f.geom,
                            f.properties,
                            fc.status,
                            fc.comment
                           FROM (public.features f
                             LEFT JOIN public.feature_ctrs fc ON ((f.id = fc.id_feature)))
                          ORDER BY f.id) t1) t
          GROUP BY t.id_layer) feature_json ON ((l.id = feature_json.id_layer)));


ALTER VIEW public.features_json OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 407274)
-- Name: layers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.layers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.layers_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 237 (class 1259 OID 407275)
-- Name: opi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opi (
    id integer NOT NULL,
    id_cache integer NOT NULL,
    date date,
    time_ut time without time zone,
    name character varying NOT NULL,
    color smallint[] NOT NULL,
    with_rgb boolean DEFAULT true NOT NULL,
    with_ir boolean DEFAULT false NOT NULL
);


ALTER TABLE public.opi OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 407282)
-- Name: opi_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.opi ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.opi_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 239 (class 1259 OID 407283)
-- Name: patches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patches (
    id integer NOT NULL,
    num integer NOT NULL,
    geom public.geometry NOT NULL,
    id_branch integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    id_opi integer NOT NULL,
    id_opisec integer,
    is_auto boolean DEFAULT false NOT NULL
);


ALTER TABLE public.patches OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 407290)
-- Name: patches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.patches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.patches_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 241 (class 1259 OID 407291)
-- Name: processes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.processes (
    id integer NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    status public.processes_status DEFAULT 'running'::public.processes_status NOT NULL,
    result character varying,
    description character varying
);


ALTER TABLE public.processes OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 407297)
-- Name: processes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.processes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.processes_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 243 (class 1259 OID 407298)
-- Name: slabs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.slabs (
    id integer NOT NULL,
    id_patch integer NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    z integer NOT NULL
);


ALTER TABLE public.slabs OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 407301)
-- Name: slabs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.slabs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.slabs_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 245 (class 1259 OID 407302)
-- Name: styles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.styles (
    id integer NOT NULL,
    name character varying NOT NULL,
    opacity integer NOT NULL,
    visibility boolean NOT NULL,
    style_itowns character varying NOT NULL
);


ALTER TABLE public.styles OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 407307)
-- Name: styles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.styles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.styles_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 4487 (class 0 OID 407302)
-- Dependencies: 245
-- Data for Name: styles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.styles (id, name, opacity, visibility, style_itowns) FROM stdin;
0	Remarques	1	t	{"fill": {"color": "#ee6d03", "opacity": 0.7}, "point": {"color": "#ee6d03", "radius": 5}, "stroke": {"color": "#ee6d03"}}
\.

--
-- TOC entry 4505 (class 0 OID 0)
-- Dependencies: 246
-- Name: styles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT setval('public.styles_id_seq', (SELECT MAX(id) FROM public.styles));


--
-- TOC entry 4257 (class 2606 OID 407341)
-- Name: backup backup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.backup
    ADD CONSTRAINT backup_pkey PRIMARY KEY (id);


--
-- TOC entry 4261 (class 2606 OID 407309)
-- Name: branches branches_name_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_name_id_cache_key UNIQUE (name, id_cache);


--
-- TOC entry 4263 (class 2606 OID 407311)
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- TOC entry 4265 (class 2606 OID 407313)
-- Name: caches caches_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.caches
    ADD CONSTRAINT caches_name_key UNIQUE (name);


--
-- TOC entry 4267 (class 2606 OID 407315)
-- Name: caches caches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.caches
    ADD CONSTRAINT caches_pkey PRIMARY KEY (id);


--
-- TOC entry 4269 (class 2606 OID 407317)
-- Name: feature_ctrs feature_ctrs_id_feature_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_id_feature_key UNIQUE (id_feature);


--
-- TOC entry 4271 (class 2606 OID 407319)
-- Name: feature_ctrs feature_ctrs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_pkey PRIMARY KEY (id);


--
-- TOC entry 4273 (class 2606 OID 407321)
-- Name: features features_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- TOC entry 4259 (class 2606 OID 407349)
-- Name: backup last_included_patch_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.backup
    ADD CONSTRAINT last_included_patch_id_unique UNIQUE (last_included_patch_id);


--
-- TOC entry 4275 (class 2606 OID 407323)
-- Name: layers layers_name_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_name_id_branch_key UNIQUE (name, id_branch);


--
-- TOC entry 4277 (class 2606 OID 407325)
-- Name: layers layers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_pkey PRIMARY KEY (id);


--
-- TOC entry 4279 (class 2606 OID 407327)
-- Name: opi opi_color_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_color_id_cache_key UNIQUE (color, id_cache);


--
-- TOC entry 4281 (class 2606 OID 407329)
-- Name: opi opi_name_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_name_id_cache_key UNIQUE (name, id_cache);


--
-- TOC entry 4283 (class 2606 OID 407331)
-- Name: opi opi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_pkey PRIMARY KEY (id);


--
-- TOC entry 4286 (class 2606 OID 407335)
-- Name: patches patches_id_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_id_branch_key UNIQUE (id, id_branch);


--
-- TOC entry 4288 (class 2606 OID 407333)
-- Name: patches patches_num_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_num_id_branch_key UNIQUE (num, id_branch);


--
-- TOC entry 4290 (class 2606 OID 407337)
-- Name: patches patches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_pkey PRIMARY KEY (id);


--
-- TOC entry 4292 (class 2606 OID 407339)
-- Name: processes processes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_pkey PRIMARY KEY (id);


--
-- TOC entry 4294 (class 2606 OID 407343)
-- Name: slabs slabs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.slabs
    ADD CONSTRAINT slabs_pkey PRIMARY KEY (id);


--
-- TOC entry 4296 (class 2606 OID 407345)
-- Name: styles styles_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_name UNIQUE (name);


--
-- TOC entry 4298 (class 2606 OID 407347)
-- Name: styles styles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_pkey PRIMARY KEY (id);


--
-- TOC entry 4284 (class 1259 OID 407350)
-- Name: fki_patches_id_opisec_fkey; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fki_patches_id_opisec_fkey ON public.patches USING btree (id_opisec);


--
-- TOC entry 4312 (class 2620 OID 407351)
-- Name: layers auto_num_layers; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_num_layers BEFORE INSERT ON public.layers FOR EACH ROW EXECUTE FUNCTION public.auto_num_layers();


--
-- TOC entry 4313 (class 2620 OID 407352)
-- Name: patches auto_num_patches_and_delete_unactive_on_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_num_patches_and_delete_unactive_on_insert BEFORE INSERT ON public.patches FOR EACH ROW EXECUTE FUNCTION public.auto_num_patches_and_delete_unactive();


--
-- TOC entry 4310 (class 2620 OID 407353)
-- Name: branches insert_newbranch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER insert_newbranch AFTER INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION public.create_remarks_layer();


--
-- TOC entry 4311 (class 2620 OID 407354)
-- Name: caches insert_newcache; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER insert_newcache AFTER INSERT ON public.caches FOR EACH ROW EXECUTE FUNCTION public.create_orig_branch();


--
-- TOC entry 4314 (class 2620 OID 407355)
-- Name: patches on_patch_activation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_patch_activation BEFORE UPDATE OF active ON public.patches FOR EACH ROW WHEN ((new.active = true)) EXECUTE FUNCTION public.check_before_patch_activation();


--
-- TOC entry 4315 (class 2620 OID 407356)
-- Name: patches on_patch_deactivation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_patch_deactivation BEFORE UPDATE OF active ON public.patches FOR EACH ROW WHEN ((new.active = false)) EXECUTE FUNCTION public.check_before_patch_deactivation();


--
-- TOC entry 4299 (class 2606 OID 407357)
-- Name: backup backup_id_patch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.backup
    ADD CONSTRAINT backup_id_patch_fkey FOREIGN KEY (last_included_patch_id) REFERENCES public.patches(id) ON DELETE CASCADE;


--
-- TOC entry 4300 (class 2606 OID 407362)
-- Name: branches branches_id_cache_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_id_cache_fkey FOREIGN KEY (id_cache) REFERENCES public.caches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4301 (class 2606 OID 407367)
-- Name: feature_ctrs feature_ctrs_id_feature_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_id_feature_fkey FOREIGN KEY (id_feature) REFERENCES public.features(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4302 (class 2606 OID 407372)
-- Name: features features_id_layer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_id_layer_fkey FOREIGN KEY (id_layer) REFERENCES public.layers(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4303 (class 2606 OID 407377)
-- Name: layers layers_id_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_id_branch_fkey FOREIGN KEY (id_branch) REFERENCES public.branches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4304 (class 2606 OID 407382)
-- Name: layers layers_id_style_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_id_style_fkey FOREIGN KEY (id_style) REFERENCES public.styles(id) NOT VALID;


--
-- TOC entry 4305 (class 2606 OID 407387)
-- Name: opi opi_id_cache_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_id_cache_fkey FOREIGN KEY (id_cache) REFERENCES public.caches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4306 (class 2606 OID 407392)
-- Name: patches patches_id_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_branch_fkey FOREIGN KEY (id_branch) REFERENCES public.branches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4307 (class 2606 OID 407397)
-- Name: patches patches_id_opi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_opi_fkey FOREIGN KEY (id_opi) REFERENCES public.opi(id) NOT VALID;


--
-- TOC entry 4308 (class 2606 OID 407402)
-- Name: patches patches_id_opisec_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_opisec_fkey FOREIGN KEY (id_opisec) REFERENCES public.opi(id) NOT VALID;


--
-- TOC entry 4309 (class 2606 OID 407407)
-- Name: slabs slabs_id_patch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.slabs
    ADD CONSTRAINT slabs_id_patch_fkey FOREIGN KEY (id_patch) REFERENCES public.patches(id) ON DELETE CASCADE NOT VALID;


-- Completed on 2026-11-20 09:36:20 CET

--
-- PostgreSQL database dump complete
--

\unrestrict QAFZyaWc5bQQBoe7FfmzWa5YD3HpYee6W6g2YJtff0gGX0fX42PfAGbDCj9FPjh

