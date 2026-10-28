begin;
set local role service_role;
do $$
declare root uuid; sub uuid; other uuid; aid uuid; rowdata record; failed boolean; r1 uuid; r2 uuid;
begin
 insert into public.erp_article_groups(name,updated_by) values('ROLLBACK Refurb','fixture@example.invalid') returning id into root;
 insert into public.erp_article_groups(name,parent_id,updated_by) values('ROLLBACK iPhone',root,'fixture@example.invalid') returning id into sub;
 insert into public.erp_article_groups(name,updated_by) values('ROLLBACK Other','fixture@example.invalid') returning id into other;
 failed:=false;begin insert into public.erp_article_groups(name,parent_id,updated_by) values('No third level',sub,'fixture@example.invalid');exception when others then failed:=true;end;if not failed then raise exception 'third level accepted';end if;
 insert into public.erp_article_prefixes(prefix,group_id,updated_by) values('991',sub,'fixture@example.invalid'),('992',sub,'fixture@example.invalid');
 failed:=false;begin insert into public.erp_article_prefixes(prefix,group_id,updated_by) values('991',other,'fixture@example.invalid');exception when unique_violation then failed:=true;end;if not failed then raise exception 'duplicate prefix accepted';end if;
 insert into public.erp_article_model_rules(group_id,name,include_terms,exclude_terms,updated_by) values
 (sub,'iPhone 14',array['iPhone','14'],array['pro','plus'],'fixture@example.invalid'),
 (sub,'iPhone 14 Pro',array['iPhone','14','pro'],array['max'],'fixture@example.invalid'),
 (sub,'iPhone 14 Pro Max',array['iPhone','14','pro','max'],'{}','fixture@example.invalid');
 if public.erp_recognize_article_model(sub,'APPLE IPHONE 14 PRO MAX 256GB')->>'name'<>'iPhone 14 Pro Max' then raise exception 'max recognition';end if;
 if public.erp_recognize_article_model(sub,'iPhone 14 Pro 128GB')->>'name'<>'iPhone 14 Pro' then raise exception 'pro recognition';end if;
 if public.erp_recognize_article_model(sub,'iPhone 141 128GB')->>'state'<>'unmatched' then raise exception 'partial numeric match';end if;
 insert into public.erp_articles(sku,title,price_cents,inventory_qty,refurbished_product,core_assortment,active,missing_from_erp) values('991-ROLLBACK','TEST iPhone 14 Pro Max 128GB',12345,7,true,false,true,false) returning id into aid;
 select * into rowdata from public.erp_article_classified where id=aid;
 if rowdata.article_group_id<>root or rowdata.article_subgroup_id<>sub or rowdata.recognized_model<>'iPhone 14 Pro Max' or rowdata.group_origin<>'prefix' then raise exception 'prefix classification';end if;
 insert into public.erp_article_group_assignments(article_id,mode,group_id,updated_by) values(aid,'manual',other,'fixture@example.invalid');
 update public.erp_articles set price_cents=23456,inventory_qty=8 where id=aid;
 select * into rowdata from public.erp_article_classified where id=aid;
 if rowdata.article_group_id<>other or rowdata.price_cents<>23456 or rowdata.inventory_qty<>8 or rowdata.management_group<>'refurb' or rowdata.core_assortment then raise exception 'manual/source preservation';end if;
 update public.erp_article_group_assignments set mode='none',group_id=null,version=version+1 where article_id=aid;
 select * into rowdata from public.erp_article_classified where id=aid;if rowdata.assigned_group_id is not null or rowdata.group_origin<>'excluded' then raise exception 'explicit none';end if;
 update public.erp_article_group_assignments set mode='auto',version=version+1 where article_id=aid;
 select * into rowdata from public.erp_article_classified where id=aid;if rowdata.article_subgroup_id<>sub then raise exception 'auto restoration';end if;
 insert into public.erp_article_model_rules(group_id,name,include_terms,priority,updated_by) values(sub,'Conflict A',array['iPhone','14'],200,'fixture@example.invalid') returning id into r1;
 insert into public.erp_article_model_rules(group_id,name,include_terms,priority,updated_by) values(sub,'Conflict B',array['iPhone','14'],200,'fixture@example.invalid') returning id into r2;
 select * into rowdata from public.erp_article_classified where id=aid;if rowdata.model_origin<>'conflict' or rowdata.recognized_model is not null then raise exception 'conflict not visible';end if;
 perform public.save_erp_article_profile(aid,0,'{"model":"Confirmed model"}','fixture@example.invalid');
 select * into rowdata from public.erp_article_classified where id=aid;if rowdata.model_origin<>'manual' or rowdata.recognized_model<>'Confirmed model' then raise exception 'manual model precedence';end if;
 update public.erp_article_groups set active=false,version=version+1 where id=root;
 select * into rowdata from public.erp_article_classified where id=aid;if rowdata.assigned_group_id is not null then raise exception 'inactive parent still matched';end if;
 if not exists(select 1 from public.erp_article_taxonomy_history where entity_id=root and version=2) then raise exception 'audit absent';end if;
 if has_table_privilege('anon','public.erp_article_groups','SELECT') or has_table_privilege('authenticated','public.erp_article_classified','SELECT') or has_table_privilege('service_role','public.erp_article_taxonomy_history','UPDATE') then raise exception 'ACL wrong';end if;
end $$;
rollback;
