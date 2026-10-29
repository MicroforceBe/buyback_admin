CREATE TABLE IF NOT EXISTS public.erp_distribution_wish_batches(id uuid PRIMARY KEY,payload jsonb NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.erp_distribution_wishes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL REFERENCES public.erp_distribution_wish_batches(id),article_id uuid NOT NULL REFERENCES public.erp_articles(id),
 sku text NOT NULL,title text NOT NULL,model text,destination text NOT NULL CHECK(destination IN ('oudenaarde','antwerpen')),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
 state text NOT NULL DEFAULT 'needs_check' CHECK(state IN ('needs_check','cancelled')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),cancelled_at timestamptz);
CREATE INDEX IF NOT EXISTS erp_distribution_wishes_batch_idx ON public.erp_distribution_wishes(batch_id);
CREATE INDEX IF NOT EXISTS erp_distribution_wishes_article_idx ON public.erp_distribution_wishes(article_id);
CREATE UNIQUE INDEX IF NOT EXISTS erp_distribution_wishes_active_sku_store ON public.erp_distribution_wishes(article_id,destination) WHERE state='needs_check';
ALTER TABLE public.erp_distribution_wish_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_distribution_wishes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_distribution_wish_batches,public.erp_distribution_wishes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.erp_distribution_wish_batches TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.erp_distribution_wishes TO service_role;
CREATE OR REPLACE FUNCTION public.erp_distribution_wish_command(p_command text,p_data jsonb,p_actor text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior public.erp_distribution_wish_batches; wish public.erp_distribution_wishes; row_data jsonb; item record; planned integer; request uuid; target text; cnt integer;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'WISH_ACTOR'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp_distribution',0));
 IF p_command='convert' THEN RAISE EXCEPTION 'WISH_BACKORDERS_UNKNOWN'; END IF;
 IF p_command='cancel' THEN
  SELECT * INTO wish FROM public.erp_distribution_wishes WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR wish.version IS DISTINCT FROM (p_data->>'version')::integer OR wish.state<>'needs_check' THEN RAISE EXCEPTION 'WISH_CONFLICT'; END IF;
  IF coalesce((p_data->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'WISH_CONFIRM'; END IF;
  UPDATE public.erp_distribution_wishes SET state='cancelled',version=version+1,cancelled_at=now() WHERE id=wish.id;
  INSERT INTO public.erp_distribution_history(event,actor,details) VALUES('wish_cancel',p_actor,jsonb_build_object('wish_id',wish.id,'before',to_jsonb(wish)));
  RETURN wish.id;
 END IF;
 IF p_command<>'create' OR p_command IS NULL THEN RAISE EXCEPTION 'WISH_INPUT'; END IF;
 request:=(p_data->>'request_id')::uuid;target:=p_data->>'destination';
 IF request IS NULL OR target IS NULL OR target NOT IN ('oudenaarde','antwerpen') OR length(coalesce(p_data->>'notes',''))>2000 OR coalesce((p_data->>'ack_unknown')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'WISH_INPUT'; END IF;
 SELECT * INTO prior FROM public.erp_distribution_wish_batches WHERE id=request;
 IF FOUND THEN
  IF prior.actor<>p_actor OR prior.payload IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'WISH_REPLAY'; END IF;
  RETURN request;
 END IF;
 IF jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'WISH_INPUT'; END IF;
 cnt:=jsonb_array_length(p_data->'lines');
 IF cnt<1 OR cnt>500 OR (SELECT count(DISTINCT value->>'article_id') FROM jsonb_array_elements(p_data->'lines'))<>cnt THEN RAISE EXCEPTION 'WISH_INPUT'; END IF;
 INSERT INTO public.erp_distribution_wish_batches(id,payload,actor) VALUES(request,p_data,p_actor);
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_data->'lines') LOOP
  IF row_data->>'quantity' IS NULL OR (row_data->>'quantity') !~ '^[1-9][0-9]{0,3}$|^10000$' THEN RAISE EXCEPTION 'WISH_INPUT'; END IF;
  SELECT * INTO item FROM public.erp_article_classified WHERE id=(row_data->>'article_id')::uuid AND missing_from_erp IS FALSE AND article_group_id=nullif((SELECT rules->>'article_group_id' FROM public.erp_distribution_rules WHERE id),'')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'WISH_ARTICLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.erp_distribution_wishes WHERE article_id=item.id AND destination=target AND state='needs_check') THEN RAISE EXCEPTION 'WISH_EXISTS'; END IF;
  SELECT coalesce(sum((line->>'quantity')::integer),0) INTO planned FROM public.erp_distribution_lists l CROSS JOIN LATERAL jsonb_array_elements(l.lines) line WHERE l.state='open' AND l.source='gentbrugge' AND line->>'article_id'=item.id::text;
  planned:=planned+coalesce((SELECT sum(quantity) FROM public.erp_distribution_wishes WHERE article_id=item.id AND state='needs_check'),0);
  IF item.stock_gentbrugge IS NULL OR item.stock_gentbrugge<2 OR (row_data->>'quantity')::integer>item.stock_gentbrugge-1-planned THEN RAISE EXCEPTION 'WISH_STOCK'; END IF;
  INSERT INTO public.erp_distribution_wishes(batch_id,article_id,sku,title,model,destination,quantity,notes,created_by) VALUES(request,item.id,item.sku,coalesce(item.title,item.sku),item.recognized_model,target,(row_data->>'quantity')::integer,coalesce(p_data->>'notes',''),p_actor);
 END LOOP;
 INSERT INTO public.erp_distribution_history(event,actor,details) VALUES('wish_create',p_actor,jsonb_build_object('request_id',request,'count',cnt,'status','needs_check'));
 RETURN request;
END $$;
REVOKE ALL ON FUNCTION public.erp_distribution_wish_command(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_distribution_wish_command(text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.erp_distribution_command(p_command text,p_data jsonb,p_actor text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row_data jsonb; item record; snapshot jsonb:='[]'; current_stock integer; planned integer; result_id uuid; prior public.erp_distribution_lists; config public.erp_distribution_rules; selected_count integer; location text;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'DIST_ACTOR'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp_distribution',0));
 IF p_command='rules' THEN
  SELECT * INTO config FROM public.erp_distribution_rules WHERE id FOR UPDATE;
  IF config.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'DIST_CONFLICT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_article_groups WHERE id=nullif(p_data->'rules'->>'article_group_id','')::uuid AND parent_id IS NULL AND active) THEN RAISE EXCEPTION 'DIST_SCOPE'; END IF;
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
  SELECT * INTO item FROM public.erp_article_classified WHERE id=(row_data->>'article_id')::uuid AND article_group_id=nullif((SELECT rules->>'article_group_id' FROM public.erp_distribution_rules WHERE id),'')::uuid AND missing_from_erp IS FALSE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIST_ARTICLE'; END IF;
  current_stock:=CASE location WHEN 'gentbrugge' THEN item.stock_gentbrugge WHEN 'oudenaarde' THEN item.stock_oudenaarde ELSE item.stock_antwerpen END;
  SELECT coalesce(sum((line->>'quantity')::integer),0) INTO planned FROM public.erp_distribution_lists l CROSS JOIN LATERAL jsonb_array_elements(l.lines) line WHERE l.state='open' AND l.source=location AND line->>'article_id'=item.id::text;
  IF location='gentbrugge' THEN planned:=planned+coalesce((SELECT sum(quantity) FROM public.erp_distribution_wishes WHERE article_id=item.id AND state='needs_check'),0); END IF;
  IF current_stock IS NULL OR current_stock<0 OR (row_data->>'quantity')::integer>current_stock-planned-(CASE WHEN location='gentbrugge' THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'DIST_STOCK'; END IF;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('article_id',item.id,'sku',item.sku,'title',item.title,'model',item.recognized_model,'quantity',(row_data->>'quantity')::integer,'stock',current_stock,'source_updated_at',item.source_updated_at));
 END LOOP;
 result_id:=gen_random_uuid();
 INSERT INTO public.erp_distribution_lists(id,code,request_id,request_data,source,destination,lines,notes,created_by) VALUES(result_id,'VL-'||to_char(now() AT TIME ZONE 'Europe/Brussels','YYYYMMDD')||'-'||upper(left(result_id::text,8)),(p_data->>'request_id')::uuid,p_data,location,p_data->>'destination',snapshot,coalesce(p_data->>'notes',''),p_actor);
 INSERT INTO public.erp_distribution_history(list_id,event,actor,details) VALUES(result_id,'create',p_actor,jsonb_build_object('lines',snapshot));
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.erp_distribution_command(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_distribution_command(text,jsonb,text) TO service_role;
