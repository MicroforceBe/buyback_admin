begin;
set local role service_role;
do $$
declare sid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();zid uuid;aid uuid;sku text;p jsonb;r jsonb;v integer;scan_id uuid;issue uuid;old_stock integer;
begin
 p:=jsonb_build_object('session_id',sid,'request_id',rid,'title','TEST rollback scannerproef','location','gentbrugge','count_type','cycle','zone','TEST rek');
 r:=public.stock_count_command('counter@example.invalid',false,'create',p);zid:=(r->>'zone_id')::uuid;
 if (r->>'ok')::boolean is not true then raise exception 'probe_create';end if;
 perform public.stock_count_command('counter@example.invalid',false,'create',p);
 if (select count(*) from public.stock_count_sessions where id=sid)<>1 then raise exception 'probe_duplicate_create';end if;
 select article_id,l.sku into aid,sku from public.stock_count_lines l where session_id=sid order by l.sku limit 1;
 scan_id:=gen_random_uuid();p:=jsonb_build_object('session_id',sid,'request_id',scan_id,'zone_id',zid,'code',sku,'quantity',1,'serial','TESTSN001');
 perform public.stock_count_command('counter@example.invalid',false,'scan',p);perform public.stock_count_command('counter@example.invalid',false,'scan',p);
 if (select counted_qty from public.stock_count_lines where session_id=sid and article_id=aid)<>1 then raise exception 'probe_duplicate_request';end if;
 begin
  perform public.stock_count_command('counter@example.invalid',false,'scan',p||jsonb_build_object('request_id',gen_random_uuid()));raise exception 'probe_serial_failed';
 exception when others then if sqlerrm<>'stock_duplicate_serial' then raise;end if;end;
 begin
  perform public.stock_count_command('other@example.invalid',false,'scan',p||jsonb_build_object('request_id',gen_random_uuid(),'serial','TESTSN002'));raise exception 'probe_zone_failed';
 exception when others then if sqlerrm<>'stock_zone_owner' then raise;end if;end;
 perform public.stock_count_command('counter@example.invalid',false,'undo',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'reference',scan_id));
 if (select counted_qty from public.stock_count_lines where session_id=sid and article_id=aid)<>0 then raise exception 'probe_undo';end if;
 perform public.stock_count_command('counter@example.invalid',false,'scan',p||jsonb_build_object('request_id',gen_random_uuid()));
 r:=public.stock_count_command('counter@example.invalid',false,'scan',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid,'code','UNKNOWN-'||gen_random_uuid()::text,'quantity',1));issue:=(r->>'issue_id')::uuid;
 if issue is null or (r->>'ok')::boolean then raise exception 'probe_unknown';end if;
 perform public.stock_count_command('counter@example.invalid',false,'zone_complete',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid));
 select version into v from public.stock_count_sessions where id=sid;
 begin
  perform public.stock_count_command('counter@example.invalid',false,'review',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v));raise exception 'probe_issue_failed';
 exception when others then if sqlerrm<>'stock_open_issues' then raise;end if;end;
 perform public.stock_count_command('counter@example.invalid',false,'resolve',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'reference',issue,'note','Fictieve onbekende scan nagekeken.'));
 select version into v from public.stock_count_sessions where id=sid;
 perform public.stock_count_command('counter@example.invalid',false,'review',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v));
 select version into v from public.stock_count_sessions where id=sid;
 begin
  perform public.stock_count_command('counter@example.invalid',false,'approve',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v,'confirmed',true,'note','Fictieve controle met rollback.'));raise exception 'probe_admin_failed';
 exception when others then if sqlerrm<>'stock_admin_required' then raise;end if;end;
 select stock_gentbrugge into old_stock from public.erp_articles where id=aid;
 update public.erp_articles set stock_gentbrugge=coalesce(old_stock,0)+1 where id=aid;
 begin
  perform public.stock_count_command('admin@example.invalid',true,'approve',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v,'confirmed',true,'note','Fictieve controle met rollback.'));raise exception 'probe_drift_failed';
 exception when others then if sqlerrm<>'stock_erp_changed' then raise;end if;end;
 update public.erp_articles set stock_gentbrugge=old_stock where id=aid;
 perform public.stock_count_command('admin@example.invalid',true,'approve',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v,'confirmed',true,'note','Fictieve controle met rollback.'));
 if (select status from public.stock_count_sessions where id=sid)<>'approved' then raise exception 'probe_approval';end if;
 begin update public.stock_count_lines set counted_qty=4 where session_id=sid and article_id=aid;raise exception 'probe_freeze_failed';exception when others then if sqlerrm<>'stock_closed' then raise;end if;end;
 begin perform public.stock_count_command('counter@example.invalid',false,'scan',p||jsonb_build_object('request_id',gen_random_uuid(),'serial','TESTSN003'));raise exception 'probe_closed_failed';exception when others then if sqlerrm<>'stock_closed' then raise;end if;end;
 if has_table_privilege('anon','public.stock_count_lines','SELECT') or has_function_privilege('authenticated','public.stock_count_command(text,boolean,text,jsonb)','EXECUTE') or has_table_privilege('service_role','public.stock_count_events','UPDATE') then raise exception 'probe_acl';end if;
end $$;

do $test$
declare sid uuid:=gen_random_uuid();zid uuid;aid uuid;aid2 uuid;sku text;sku2 text;r jsonb;issue uuid;v integer;
begin
 r:=public.stock_count_command('counter@example.invalid',false,'create',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'title','TEST hertellen rollback','location','gentbrugge','count_type','cycle','zone','TEST zone'));
 zid:=(r->>'zone_id')::uuid;
 select article_id,l.sku into aid,sku from public.stock_count_lines l where session_id=sid order by l.sku limit 1;
 select article_id,l.sku into aid2,sku2 from public.stock_count_lines l where session_id=sid and article_id<>aid order by l.sku limit 1;
 update public.stock_count_lines set ean='SHARED-PROBE' where session_id=sid and article_id in(aid,aid2);
 r:=public.stock_count_command('counter@example.invalid',false,'scan',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid,'code','SHARED-PROBE','quantity',1));
 issue:=(r->>'issue_id')::uuid;
 if jsonb_array_length(r->'candidates')<>2 or issue is null then raise exception 'probe_ambiguous';end if;
 perform public.stock_count_command('counter@example.invalid',false,'scan',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid,'code','SHARED-PROBE','article_id',aid,'reference',issue,'quantity',1,'serial','RECOUNT001'));
 if exists(select 1 from public.stock_count_open_issues where session_id=sid) then raise exception 'probe_ambiguous_resolution';end if;
 perform public.stock_count_command('counter@example.invalid',false,'zero',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid,'article_id',aid2));
 if (select counted_qty from public.stock_count_lines where session_id=sid and article_id=aid2)<>0 then raise exception 'probe_explicit_zero';end if;
 perform public.stock_count_command('counter@example.invalid',false,'zone_complete',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid));
 select version into v from public.stock_count_sessions where id=sid;
 perform public.stock_count_command('counter@example.invalid',false,'review',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v));
 select version into v from public.stock_count_sessions where id=sid;
 perform public.stock_count_command('admin@example.invalid',true,'recount',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'article_id',aid,'version',v,'note','Gerichte fictieve hertelling.'));
 if (select counted_qty from public.stock_count_lines where session_id=sid and article_id=aid) is not null or (select counted_qty from public.stock_count_lines where session_id=sid and article_id=aid2)<>0 then raise exception 'probe_recount_preserve';end if;
 perform public.stock_count_command('counter@example.invalid',false,'zone_open',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid));
 begin perform public.stock_count_command('counter@example.invalid',false,'scan',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid,'code',sku2,'quantity',1));raise exception 'probe_recount_scope_failed';exception when others then if sqlerrm<>'stock_recount_scope' then raise;end if;end;
 perform public.stock_count_command('counter@example.invalid',false,'scan',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid,'code',sku,'quantity',1,'serial','RECOUNT001'));
 if (select counted_qty from public.stock_count_lines where session_id=sid and article_id=aid)<>1 then raise exception 'probe_recount';end if;
 if (select count(*) from public.stock_count_events where session_id=sid and kind='scan' and article_id=aid)<>2 then raise exception 'probe_recount_history';end if;
end $test$;
do $test$
declare sid uuid:=gen_random_uuid();zid uuid;sku text;r jsonb;v integer;
begin
 r:=public.stock_count_command('counter@example.invalid',false,'create',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'title','TEST full rollback','location','gentbrugge','count_type','full','zone','TEST zone'));
 zid:=(r->>'zone_id')::uuid;
 select l.sku into sku from public.stock_count_lines l where session_id=sid order by l.sku limit 1;
 perform public.stock_count_command('counter@example.invalid',false,'scan',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid,'code',sku,'quantity',1));
 perform public.stock_count_command('counter@example.invalid',false,'zone_complete',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'zone_id',zid));
 select version into v from public.stock_count_sessions where id=sid;
 perform public.stock_count_command('counter@example.invalid',false,'review',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v));
 select version into v from public.stock_count_sessions where id=sid;
 begin perform public.stock_count_command('admin@example.invalid',true,'approve',jsonb_build_object('session_id',sid,'request_id',gen_random_uuid(),'version',v,'confirmed',true,'note','Volledige telling niet compleet.'));raise exception 'probe_full_failed';exception when others then if sqlerrm<>'stock_uncounted' then raise;end if;end;
end $test$;

rollback;