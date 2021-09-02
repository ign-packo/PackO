--
-- PostgreSQL database dump
--

-- Dumped from database version 13.3
-- Dumped by pg_dump version 13.3

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
-- Name: suppr_unactive_pacthes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.suppr_unactive_pacthes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
	DELETE FROM patches 
	WHERE 
		id_branch=NEW.id_branch 
		AND 
		active=False;
	RETURN NEW;
END;$$;


ALTER FUNCTION public.suppr_unactive_pacthes() OWNER TO postgres;

--
-- Name: FUNCTION suppr_unactive_pacthes(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.suppr_unactive_pacthes() IS 'suppression des patchs inactifs de la branche';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.branches OWNER TO postgres;

--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.branches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branches_id_seq
    START WITH 2
    INCREMENT BY 1
    NO MINVALUE
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
-- Name: overlaps_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.slabs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.overlaps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: patches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patches (
    id integer NOT NULL,
    red integer NOT NULL,
    green integer NOT NULL,
    blue integer NOT NULL,
    image character varying NOT NULL,
    num integer NOT NULL,
    geom public.geometry NOT NULL,
    id_branch integer NOT NULL,
    active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.patches OWNER TO postgres;

--
-- Name: patches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.patches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.patches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.branches OVERRIDING SYSTEM VALUE VALUES (1, 'master');


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
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.branches_id_seq', 2, false);


--
-- Name: overlaps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.overlaps_id_seq', 1, false);


--
-- Name: patches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.patches_id_seq', 1, false);


--
-- Name: branches branches_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_name_key UNIQUE (name);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


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
-- Name: patches insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER insert AFTER INSERT ON public.patches FOR EACH ROW EXECUTE FUNCTION public.suppr_unactive_pacthes();


--
-- Name: patches patches_id_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patches
    ADD CONSTRAINT patches_id_branch_fkey FOREIGN KEY (id_branch) REFERENCES public.branches(id) ON DELETE CASCADE NOT VALID;


--
-- Name: slabs slabs_id_patch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.slabs
    ADD CONSTRAINT slabs_id_patch_fkey FOREIGN KEY (id_patch) REFERENCES public.patches(id) ON DELETE CASCADE NOT VALID;


--
-- PostgreSQL database dump complete
--

