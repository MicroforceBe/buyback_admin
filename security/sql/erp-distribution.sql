CREATE TABLE IF NOT EXISTS public.erp_distribution_rules(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),rules jsonb NOT NULL CHECK(jsonb_typeof(rules)='object'),version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.erp_distribution_rules(id,rules,updated_by) VALUES(true,'{"keep_empty":1,"keep_stock":3,"overrides":[]}'::jsonb,'initial_setup') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.erp_distribution_lists(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,request_id uuid NOT NULL UNIQUE,request_data jsonb NOT NULL,
 source text NOT NULL CHECK(source IN ('gentbrugge','oudenaarde','antwerpen')),destination text NOT NULL CHECK(destination IN ('gentbrugge','oudenaarde','antwerpen')),CHECK(source<>destination),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','archived')),version integer NOT NULL DEFAULT 1 CHECK(version>0),lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 500),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz);
CREATE TABLE IF NOT EXISTS public.erp_distribution_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),list_id uuid REFERENCES public.erp_distribution_lists(id),event text NOT NULL,actor text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS erp_distribution_lists_open_idx ON public.erp_distribution_lists(created_at) WHERE state='open';
ALTER TABLE public.erp_distribution_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_distribution_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_distribution_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_distribution_rules,public.erp_distribution_lists,public.erp_distribution_history FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.erp_distribution_rules,public.erp_distribution_lists TO service_role;
GRANT SELECT,INSERT ON public.erp_distribution_history TO service_role;
CREATE OR REPLACE FUNCTION public.erp_distribution_command(p_command text,p_data jsonb,p_actor text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row_data jsonb; item record; snapshot jsonb:='[]'; current_stock integer; planned integer; result_id uuid; prior public.erp_distribution_lists; config public.erp_distribution_rules; selected_count integer; location text;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'DIST_ACTOR'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp_distribution',0));
 IF p_command='rules' THEN
  SELECT * INTO config FROM public.erp_distribution_rules WHERE id FOR UPDATE;
  IF config.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'DIST_CONFLICT'; END IF;
  IF jsonb_typeof(p_data->'rules') IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'rules'->'overrides') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DIST_INPUT'; END IF;
  UPDATE public.erp_distribution_rules SET rules=p_data->'rules',version=version+1,updated_by=p_actor,updated_at=now() WHERE id;
  INSERT INTO public.erp_distribution_history(event,actor,details) VALUES('rules',p_actor,jsonb_build_object('before',config.rules,'after',p_data->'rules'));
  RETURN NULL;
 ELSIF p_command='archive' THEN
  SELECT * INTO prior FROM public.erp_distribution_lists WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR prior.version IS DISTINCT FROM (p_data->>'version')::integer OR prior.state<>'open' THEN RAISE EXCEPTION 'DIST_CONFLICT'; END IF;
  UPDATE public.erp_distribution_lists SET state='archived',version=version+1,archived_at=now() WHERE id=prior.id;
  INSERT INTO public.erp_distribution_history(list_id,event,actor,details) VALUES(prior.id,'archive',p_actor,'{}');
  RETURN prior.id;
 ELSIF p_command<>'create' OR p_command IS NULL THEN RAISE EXCEPTION 'DIST_INPUT'; END IF;
 SELECT * INTO prior FROM public.erp_distribution_lists WHERE request_id=(p_data->>'request_id')::uuid;
 IF FOUND THEN
  IF prior.created_by<>p_actor OR prior.request_data IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'DIST_REPLAY'; END IF;
  RETURN prior.id;
 END IF;
 location:=p_data->>'source';
 IF location NOT IN ('gentbrugge','oudenaarde','antwerpen') OR location IS NULL OR p_data->>'destination' IS NULL OR p_data->>'destination' NOT IN ('gentbrugge','oudenaarde','antwerpen') OR location=p_data->>'destination' OR length(coalesce(p_data->>'notes',''))>2000 THEN RAISE EXCEPTION 'DIST_INPUT'; END IF;
 IF jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DIST_INPUT'; END IF;
 selected_count:=jsonb_array_length(p_data->'lines');
 IF selected_count<1 OR selected_count>500 OR (SELECT count(DISTINCT value->>'article_id') FROM jsonb_array_elements(p_data->'lines'))<>selected_count THEN RAISE EXCEPTION 'DIST_INPUT'; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_data->'lines') LOOP
  IF (row_data->>'quantity') !~ '^[1-9][0-9]{0,4}$' OR row_data->>'quantity' IS NULL THEN RAISE EXCEPTION 'DIST_INPUT'; END IF;
  SELECT * INTO item FROM public.erp_article_classified WHERE id=(row_data->>'article_id')::uuid AND refurbished_product IS TRUE AND missing_from_erp IS FALSE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIST_ARTICLE'; END IF;
  current_stock:=CASE location WHEN 'gentbrugge' THEN item.stock_gentbrugge WHEN 'oudenaarde' THEN item.stock_oudenaarde ELSE item.stock_antwerpen END;
  SELECT coalesce(sum((line->>'quantity')::integer),0) INTO planned FROM public.erp_distribution_lists l CROSS JOIN LATERAL jsonb_array_elements(l.lines) line WHERE l.state='open' AND l.source=location AND line->>'article_id'=item.id::text;
  IF current_stock IS NULL OR current_stock<0 OR (row_data->>'quantity')::integer>current_stock-planned THEN RAISE EXCEPTION 'DIST_STOCK'; END IF;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('article_id',item.id,'sku',item.sku,'title',item.title,'model',item.recognized_model,'quantity',(row_data->>'quantity')::integer,'stock',current_stock,'source_updated_at',item.source_updated_at));
 END LOOP;
 result_id:=gen_random_uuid();
 INSERT INTO public.erp_distribution_lists(id,code,request_id,request_data,source,destination,lines,notes,created_by) VALUES(result_id,'VL-'||to_char(now() AT TIME ZONE 'Europe/Brussels','YYYYMMDD')||'-'||upper(left(result_id::text,8)),(p_data->>'request_id')::uuid,p_data,location,p_data->>'destination',snapshot,coalesce(p_data->>'notes',''),p_actor);
 INSERT INTO public.erp_distribution_history(list_id,event,actor,details) VALUES(result_id,'create',p_actor,jsonb_build_object('lines',snapshot));
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.erp_distribution_command(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_distribution_command(text,jsonb,text) TO service_role;
