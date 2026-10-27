begin;
set local role service_role;
do $$
declare aid uuid; v integer; rejected boolean; result record;
begin
 insert into public.erp_articles(sku,title,price_cents,inventory_qty,active,missing_from_erp,refurbished_product,core_assortment)
 values('TEST-PROFILE-ROLLBACK','Synthetic ERP source',12345,7,true,false,false,true) returning id into aid;
 v:=public.save_erp_article_profile(aid,0,'{"display_name":"Internal name","brand":"Fixture","product_type":"device"}'::jsonb,'fixture@example.invalid');
 if v<>1 then raise exception 'version failed'; end if;
 update public.erp_articles set price_cents=23456,inventory_qty=9,title='New ERP title' where id=aid;
 select * into result from public.erp_article_overview where id=aid;
 if result.title<>'Internal name' or result.source_title<>'New ERP title' or result.price_cents<>23456 or result.inventory_qty<>9 or not result.core_assortment then raise exception 'source separation failed';end if;
 rejected:=false;
 begin perform public.save_erp_article_profile(aid,0,'{}','fixture@example.invalid');exception when others then if sqlerrm='profile_conflict' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'stale write accepted';end if;
 rejected:=false;
 begin perform public.save_erp_article_profile(aid,1,'{"price_cents":1}','fixture@example.invalid');exception when others then if sqlerrm='invalid_fields' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'price overwrite accepted';end if;
 v:=public.save_erp_article_profile(aid,1,'{}','fixture@example.invalid');
 select * into result from public.erp_article_overview where id=aid;
 if result.title<>'New ERP title' or result.profile_version<>2 or result.price_cents<>23456 then raise exception 'inheritance reset failed';end if;
 if (select count(*) from public.erp_article_profile_history where article_id=aid)<>2 then raise exception 'history failed';end if;
 if has_table_privilege('anon','public.erp_article_profiles','SELECT') or has_table_privilege('authenticated','public.erp_article_overview','SELECT') or has_function_privilege('authenticated','public.save_erp_article_profile(uuid,integer,jsonb,text)','EXECUTE') then raise exception 'public grant';end if;
 if has_table_privilege('service_role','public.erp_article_profile_history','UPDATE') or has_table_privilege('service_role','public.erp_article_profiles','DELETE') then raise exception 'unexpected mutation grant';end if;
end $$;
rollback;
