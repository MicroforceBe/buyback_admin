-- TEST-only, one specifically authorized recipient/lead. Configuration remains preview.
alter table public.buyback_trustpilot_invitations drop constraint buyback_trustpilot_invitations_mode_check;
alter table public.buyback_trustpilot_invitations add constraint buyback_trustpilot_invitations_mode_check check(mode in ('preview','live','test'));
alter table public.buyback_trustpilot_invitations add column test_send_at timestamptz;
create table public.buyback_trustpilot_test_authorization (
 id boolean primary key default true check(id),
 lead_id uuid not null unique references public.buyback_leads(id) on delete restrict,
 recipient_email text not null,
 expires_at timestamptz not null
);
alter table public.buyback_trustpilot_test_authorization enable row level security;
revoke all on public.buyback_trustpilot_test_authorization from public,anon,authenticated,service_role;
grant select on public.buyback_trustpilot_test_authorization to service_role;
create function public.authorize_captured_trustpilot_test() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.mode='preview' and new.status='preview'
 and exists(select 1 from public.buyback_trustpilot_config where id and mode='preview')
 and exists(select 1 from public.buyback_trustpilot_test_authorization a join public.buyback_leads l on l.id=a.lead_id
   where a.id and a.lead_id=new.lead_id and a.recipient_email=new.recipient_email and a.expires_at>now()
   and l.source='trustpilot_e2e_test' and l.order_code='TEST-TRUSTPILOT-E2E-20261027' and l.email=a.recipient_email) then
   new.mode:='test'; new.status:='queued'; new.test_send_at:=now()+interval '3 minutes';new.expected_invite_at:=new.test_send_at;
 end if;
 return new;
end $$;
revoke all on function public.authorize_captured_trustpilot_test() from public,anon,authenticated;
grant execute on function public.authorize_captured_trustpilot_test() to service_role;
create trigger authorize_captured_trustpilot_test before insert on public.buyback_trustpilot_invitations
for each row execute function public.authorize_captured_trustpilot_test();
