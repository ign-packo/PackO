--
-- PostgreSQL database dump
--

-- Dumped from database version 13.2
-- Dumped by pg_dump version 13.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry, geography, and raster spatial types and functions';


--
-- Name: processes_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.processes_status AS ENUM (
    'running',
    'failed',
    'succeed'
);


ALTER TYPE public.processes_status OWNER TO postgres;

--
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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
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
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name character varying NOT NULL,
    id_cache integer NOT NULL
);


ALTER TABLE public.branches OWNER TO postgres;

--
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
-- Name: caches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.caches (
    id integer NOT NULL,
    name character varying NOT NULL,
    v_packo character varying,
    date date,
    path character varying NOT NULL
);


ALTER TABLE public.caches OWNER TO postgres;

--
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
-- Name: opi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opi (
    id integer NOT NULL,
    id_cache integer NOT NULL,
    date date,
    name character varying NOT NULL,
    color smallint[] NOT NULL
);


ALTER TABLE public.opi OWNER TO postgres;

--
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
-- Name: patches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patches (
    id integer NOT NULL,
    num integer NOT NULL,
    geom public.geometry NOT NULL,
    id_branch integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    id_opi integer NOT NULL
);


ALTER TABLE public.patches OWNER TO postgres;

--
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
-- Name: branches branches_name_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_name_id_cache_key UNIQUE (name, id_cache);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: caches caches_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.caches
    ADD CONSTRAINT caches_name_key UNIQUE (name);


--
-- Name: caches caches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.caches
    ADD CONSTRAINT caches_pkey PRIMARY KEY (id);


--
-- Name: opi opi_color_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_color_id_cache_key UNIQUE (color, id_cache);


--
-- Name: opi opi_name_id_cache_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_name_id_cache_key UNIQUE (name, id_cache);


--
-- Name: opi opi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_pkey PRIMARY KEY (id);


--
-- Name: patches patches_num_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_num_id_branch_key UNIQUE (num, id_branch);


--
-- Name: patches patches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_pkey PRIMARY KEY (id);


--
-- Name: slabs slabs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.slabs
    ADD CONSTRAINT slabs_pkey PRIMARY KEY (id);


--
-- Name: layers layers_name_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_name_id_branch_key UNIQUE (name, id_branch);


--
-- Name: layers layers_num_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_num_id_branch_key UNIQUE (num, id_branch);


--
-- Name: layers layers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: feature_ctrs feature_ctrs_id_feature_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_id_feature_key UNIQUE (id_feature);


--
-- Name: feature_ctrs feature_ctrs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_pkey PRIMARY KEY (id);


--
-- Name: styles styles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_name UNIQUE (name);


--
-- Name: styles styles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_pkey PRIMARY KEY (id);


--
-- Name: caches processes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_pkey PRIMARY KEY (id);


--
-- Name: patches auto_num_patches_and_delete_unactive_on_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_num_patches_and_delete_unactive_on_insert BEFORE INSERT ON public.patches FOR EACH ROW EXECUTE FUNCTION public.auto_num_patches_and_delete_unactive();


--
-- Name: caches insert_newcache; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER insert_newcache AFTER INSERT ON public.caches FOR EACH ROW EXECUTE FUNCTION public.create_orig_branch();


--
-- Name: patches on_patch_activation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_patch_activation BEFORE UPDATE OF active ON public.patches FOR EACH ROW WHEN ((new.active = true)) EXECUTE FUNCTION public.check_before_patch_activation();


--
-- Name: patches on_patch_deactivation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_patch_deactivation BEFORE UPDATE OF active ON public.patches FOR EACH ROW WHEN ((new.active = false)) EXECUTE FUNCTION public.check_before_patch_deactivation();


--
-- Name: layers auto_num_layers; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_num_layers BEFORE INSERT ON public.layers FOR EACH ROW EXECUTE FUNCTION public.auto_num_layers();


----
-- Name: branches branches_id_cache_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_id_cache_fkey FOREIGN KEY (id_cache) REFERENCES public.caches(id) ON DELETE CASCADE NOT VALID;


--
-- Name: opi opi_id_cache_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opi
    ADD CONSTRAINT opi_id_cache_fkey FOREIGN KEY (id_cache) REFERENCES public.caches(id) ON DELETE CASCADE NOT VALID;


--
-- Name: patches patches_id_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_branch_fkey FOREIGN KEY (id_branch) REFERENCES public.branches(id) ON DELETE CASCADE NOT VALID;


--
-- Name: patches patches_id_opi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_opi_fkey FOREIGN KEY (id_opi) REFERENCES public.opi(id) NOT VALID;


--
-- Name: slabs slabs_id_patch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.slabs
    ADD CONSTRAINT slabs_id_patch_fkey FOREIGN KEY (id_patch) REFERENCES public.patches(id) ON DELETE CASCADE NOT VALID;


--
-- Name: layers layers_id_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_id_branch_fkey FOREIGN KEY (id_branch) REFERENCES public.branches(id) ON DELETE CASCADE NOT VALID;


--
-- Name: layers layers_id_style_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_id_style_fkey FOREIGN KEY (id_style) REFERENCES public.styles(id) NOT VALID;


--
-- Name: features features_id_layer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgresn
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_id_layer_fkey FOREIGN KEY (id_layer) REFERENCES public.layers(id) ON DELETE CASCADE NOT VALID;


--
-- Name: feature_ctrs feature_ctrs_id_feature_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feature_ctrs
    ADD CONSTRAINT feature_ctrs_id_feature_fkey FOREIGN KEY (id_feature) REFERENCES public.features(id) ON DELETE CASCADE NOT VALID;


--
-- PostgreSQL database dump complete
--

