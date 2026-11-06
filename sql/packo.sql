--
-- PostgreSQL database dump
--

\restrict 8t3Vq6PFsbjGpFxNppPhJwALJ8yJaZ8fqDVD2B7Cb54ccGOQYTsceEIRvdojuWt

-- Dumped from database version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-1.pgdg24.04+2)

-- Started on 2026-09-10 16:48:23 CEST

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

--
-- TOC entry 2 (class 3079 OID 224066)
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- TOC entry 4462 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry, geography, and raster spatial types and functions';


--
-- TOC entry 1660 (class 1247 OID 225148)
-- Name: processes_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.processes_status AS ENUM (
    'running',
    'failed',
    'succeed'
);


ALTER TYPE public.processes_status OWNER TO postgres;

--
-- TOC entry 996 (class 1255 OID 225155)
-- Name: auto_num_layers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_num_layers() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
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
END;$$;


ALTER FUNCTION public.auto_num_layers() OWNER TO postgres;

--
-- TOC entry 827 (class 1255 OID 225156)
-- Name: auto_num_blocks_and_delete_unactive(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_num_blocks_and_delete_unactive() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
	DELETE FROM blocks 
	WHERE 
		id_branch=NEW.id_branch 
		AND 
		active=False;
	NEW.num = (
		SELECT  
	CASE WHEN max(num) IS NULL THEN 1
	ELSE max(num) + 1
	END next_num
	FROM blocks
	WHERE 
		id_branch=NEW.id_branch 
		AND 
		active=True
	);
	RETURN NEW;
END;$$;


ALTER FUNCTION public.auto_num_blocks_and_delete_unactive() OWNER TO postgres;

--
-- TOC entry 635 (class 1255 OID 225157)
-- Name: check_before_block_activation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_before_block_activation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
	IF NEW.num > (
		SELECT min(num) FROM blocks
		WHERE id_branch=NEW.id_branch AND active=False)
	THEN 
		RAISE EXCEPTION 'block activation impossible' USING ERRCODE='20808';
	END IF;
	RETURN NEW;
END;$$;


ALTER FUNCTION public.check_before_block_activation() OWNER TO postgres;

--
-- TOC entry 411 (class 1255 OID 225158)
-- Name: check_before_block_deactivation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_before_block_deactivation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
	IF NEW.num < (
		SELECT max(num) FROM blocks
		WHERE id_branch=NEW.id_branch AND active=True)
	THEN 
		RAISE EXCEPTION 'block desactivation impossible' USING ERRCODE='20808';
	END IF;
	RETURN NEW;
END;$$;


ALTER FUNCTION public.check_before_block_deactivation() OWNER TO postgres;

--
-- TOC entry 944 (class 1255 OID 225159)
-- Name: auto_num_patches(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_num_patches() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
	NEW.num = (
		SELECT  
	CASE WHEN max(num) IS NULL THEN 1
	ELSE max(num) + 1
	END next_num
	FROM patches
	WHERE 
		id_block=NEW.id_block 
	);
	RETURN NEW;
END;$$;


ALTER FUNCTION public.auto_num_patches() OWNER TO postgres;

--
-- TOC entry 313 (class 1255 OID 225160)
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
-- TOC entry 653 (class 1255 OID 225161)
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
-- TOC entry 223 (class 1259 OID 225162)
-- Name: blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.blocks (
    id integer NOT NULL,
    id_branch integer NOT NULL,
    num integer NOT NULL,
    active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.blocks OWNER TO postgres;


--
-- TOC entry 246 (class 1259 OID 225348)
-- Name: blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.blocks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.blocks_id_seq
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 225 (class 1259 OID 225167)
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name character varying NOT NULL,
    id_cache integer NOT NULL
);


ALTER TABLE public.branches OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 225172)
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
-- TOC entry 227 (class 1259 OID 225173)
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
-- TOC entry 228 (class 1259 OID 225178)
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
-- TOC entry 229 (class 1259 OID 225179)
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
-- TOC entry 230 (class 1259 OID 225184)
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
-- TOC entry 231 (class 1259 OID 225185)
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
-- TOC entry 232 (class 1259 OID 225190)
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
-- TOC entry 233 (class 1259 OID 225191)
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
-- TOC entry 234 (class 1259 OID 225196)
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
-- TOC entry 235 (class 1259 OID 225201)
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
-- TOC entry 236 (class 1259 OID 225202)
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
-- TOC entry 237 (class 1259 OID 225209)
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
-- TOC entry 238 (class 1259 OID 225210)
-- Name: patches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patches (
    id integer NOT NULL,
    num integer NOT NULL,
    geom public.geometry NOT NULL,
    id_block integer NOT NULL,
    id_opi integer NOT NULL,
    id_opisec integer,
    is_auto boolean DEFAULT false NOT NULL
);


ALTER TABLE public.patches OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 225216)
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
-- TOC entry 240 (class 1259 OID 225217)
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
-- TOC entry 241 (class 1259 OID 225223)
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
-- TOC entry 242 (class 1259 OID 225224)
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
-- TOC entry 243 (class 1259 OID 225227)
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
-- TOC entry 244 (class 1259 OID 225228)
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
-- TOC entry 245 (class 1259 OID 225233)
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
-- TOC entry 4454 (class 0 OID 225228)
-- Dependencies: 244
-- Data for Name: styles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.styles (id, name, opacity, visibility, style_itowns) FROM stdin;
0	Remarques	1	t	{"fill": {"color": "#ee6d03", "opacity": 0.7}, "point": {"color": "#ee6d03", "radius": 5}, "stroke": {"color": "#ee6d03"}}
\.

--
-- TOC entry 4475 (class 0 OID 0)
-- Dependencies: 245
-- Name: styles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.styles_id_seq', 0, true);


--
-- TOC entry 4222 (class 2606 OID 225236)
-- Name: blocks block_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT block_pkey PRIMARY KEY (id);


--
-- TOC entry 4224 (class 2606 OID 225238)
-- Name: blocks blocks_num_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_num_id_branch_key UNIQUE (num, id_branch);


--
-- TOC entry 4227 (class 2606 OID 225240)
-- Name: branches branches_name_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_name_id_cache_key UNIQUE (name, id_cache);


--
-- TOC entry 4229 (class 2606 OID 225242)
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- TOC entry 4231 (class 2606 OID 225244)
-- Name: caches caches_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.caches
    ADD CONSTRAINT caches_name_key UNIQUE (name);


--
-- TOC entry 4233 (class 2606 OID 225246)
-- Name: caches caches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.caches
    ADD CONSTRAINT caches_pkey PRIMARY KEY (id);


--
-- TOC entry 4235 (class 2606 OID 225248)
-- Name: feature_ctrs feature_ctrs_id_feature_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_id_feature_key UNIQUE (id_feature);


--
-- TOC entry 4237 (class 2606 OID 225250)
-- Name: feature_ctrs feature_ctrs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_pkey PRIMARY KEY (id);


--
-- TOC entry 4239 (class 2606 OID 225252)
-- Name: features features_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- TOC entry 4241 (class 2606 OID 225254)
-- Name: layers layers_name_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_name_id_branch_key UNIQUE (name, id_branch);


--
-- TOC entry 4243 (class 2606 OID 225256)
-- Name: layers layers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_pkey PRIMARY KEY (id);


--
-- TOC entry 4245 (class 2606 OID 225258)
-- Name: opi opi_color_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_color_id_cache_key UNIQUE (color, id_cache);


--
-- TOC entry 4247 (class 2606 OID 225260)
-- Name: opi opi_name_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_name_id_cache_key UNIQUE (name, id_cache);


--
-- TOC entry 4249 (class 2606 OID 225262)
-- Name: opi opi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_pkey PRIMARY KEY (id);


--
-- TOC entry 4253 (class 2606 OID 225264)
-- Name: patches patches_num_id_block_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_num_id_block_key UNIQUE (num, id_block);


--
-- TOC entry 4255 (class 2606 OID 225266)
-- Name: patches patches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_pkey PRIMARY KEY (id);


--
-- TOC entry 4257 (class 2606 OID 225268)
-- Name: processes processes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_pkey PRIMARY KEY (id);


--
-- TOC entry 4260 (class 2606 OID 225270)
-- Name: slabs slabs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.slabs
    ADD CONSTRAINT slabs_pkey PRIMARY KEY (id);


--
-- TOC entry 4262 (class 2606 OID 225272)
-- Name: styles styles_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_name UNIQUE (name);


--
-- TOC entry 4264 (class 2606 OID 225274)
-- Name: styles styles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_pkey PRIMARY KEY (id);


--
-- TOC entry 4225 (class 1259 OID 225275)
-- Name: fki_blocks_id_branch_fkey; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fki_blocks_id_branch_fkey ON public.blocks USING btree (id_branch);


--
-- TOC entry 4250 (class 1259 OID 225276)
-- Name: fki_patches_id_block_fkey; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fki_patches_id_block_fkey ON public.patches USING btree (id_block);


--
-- TOC entry 4251 (class 1259 OID 225277)
-- Name: fki_patches_id_opisec_fkey; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fki_patches_id_opisec_fkey ON public.patches USING btree (id_opisec);


--
-- TOC entry 4258 (class 1259 OID 225278)
-- Name: fki_slabs_id_patch_fkey; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fki_slabs_id_patch_fkey ON public.slabs USING btree (id_patch);


--
-- TOC entry 4276 (class 2620 OID 225280)
-- Name: blocks auto_num_blocks_and_delete_unactive_on_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_num_blocks_and_delete_unactive_on_insert BEFORE INSERT ON public.blocks FOR EACH ROW EXECUTE FUNCTION public.auto_num_blocks_and_delete_unactive();


--
-- TOC entry 4281 (class 2620 OID 225279)
-- Name: layers auto_num_layers; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_num_layers BEFORE INSERT ON public.layers FOR EACH ROW EXECUTE FUNCTION public.auto_num_layers();


--
-- TOC entry 4282 (class 2620 OID 225281)
-- Name: patches auto_num_patches_on_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_num_patches_on_insert BEFORE INSERT ON public.patches FOR EACH ROW EXECUTE FUNCTION public.auto_num_patches();


--
-- TOC entry 4279 (class 2620 OID 225282)
-- Name: branches insert_newbranch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER insert_newbranch AFTER INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION public.create_remarks_layer();


--
-- TOC entry 4280 (class 2620 OID 225283)
-- Name: caches insert_newcache; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER insert_newcache AFTER INSERT ON public.caches FOR EACH ROW EXECUTE FUNCTION public.create_orig_branch();


--
-- TOC entry 4277 (class 2620 OID 225284)
-- Name: blocks on_block_activation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_block_activation BEFORE UPDATE OF active ON public.blocks FOR EACH ROW WHEN ((new.active = true)) EXECUTE FUNCTION public.check_before_block_activation();


--
-- TOC entry 4278 (class 2620 OID 225285)
-- Name: blocks on_block_deactivation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_block_deactivation BEFORE UPDATE OF active ON public.blocks FOR EACH ROW WHEN ((new.active = false)) EXECUTE FUNCTION public.check_before_block_deactivation();


--
-- TOC entry 4265 (class 2606 OID 225286)
-- Name: blocks blocks_id_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_id_branch_fkey FOREIGN KEY (id_branch) REFERENCES public.branches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4266 (class 2606 OID 225291)
-- Name: branches branches_id_cache_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_id_cache_fkey FOREIGN KEY (id_cache) REFERENCES public.caches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4267 (class 2606 OID 225296)
-- Name: feature_ctrs feature_ctrs_id_feature_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_id_feature_fkey FOREIGN KEY (id_feature) REFERENCES public.features(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4268 (class 2606 OID 225301)
-- Name: features features_id_layer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_id_layer_fkey FOREIGN KEY (id_layer) REFERENCES public.layers(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4269 (class 2606 OID 225306)
-- Name: layers layers_id_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_id_branch_fkey FOREIGN KEY (id_branch) REFERENCES public.branches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4270 (class 2606 OID 225311)
-- Name: layers layers_id_style_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_id_style_fkey FOREIGN KEY (id_style) REFERENCES public.styles(id) NOT VALID;


--
-- TOC entry 4271 (class 2606 OID 225316)
-- Name: opi opi_id_cache_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_id_cache_fkey FOREIGN KEY (id_cache) REFERENCES public.caches(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4272 (class 2606 OID 225321)
-- Name: patches patches_id_block_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_block_fkey FOREIGN KEY (id_block) REFERENCES public.blocks(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 4273 (class 2606 OID 225326)
-- Name: patches patches_id_opi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_opi_fkey FOREIGN KEY (id_opi) REFERENCES public.opi(id) NOT VALID;


--
-- TOC entry 4274 (class 2606 OID 225331)
-- Name: patches patches_id_opisec_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_opisec_fkey FOREIGN KEY (id_opisec) REFERENCES public.opi(id) NOT VALID;


--
-- TOC entry 4275 (class 2606 OID 225336)
-- Name: slabs slabs_id_patch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.slabs
    ADD CONSTRAINT slabs_id_patch_fkey FOREIGN KEY (id_patch) REFERENCES public.patches(id) ON DELETE CASCADE NOT VALID;


-- Completed on 2026-09-10 16:48:24 CEST

--
-- PostgreSQL database dump complete
--

\unrestrict 8t3Vq6PFsbjGpFxNppPhJwALJ8yJaZ8fqDVD2B7Cb54ccGOQYTsceEIRvdojuWt

