-- Import the customers of existing buyback leads into shop_customers (winkelbeheer fase 1).
-- Run after shop-customers.sql: first on the test project, then on production (by a human).
--
-- Rules
-- * One customer per e-mail address (case-insensitive). Profile data comes from the most recent lead.
-- * customer_number = the number in the external package as typed on the leads (4-10 digits).
--   Values such as "open" or notes are ignored. A number is never invented.
-- * Several numbers on the leads of one customer: the number of the most recent lead is used and
--   the customer is marked "te controleren".
-- * A number that appears on the leads of several customers (on any of their leads, not only the
--   most recent) marks all those customers "te controleren". When several customers would get the
--   same number, the customer with the most leads carrying it keeps it (tie: most recent lead);
--   the others get no number.
-- * A number already used by an existing customer is never taken over.
-- * Phone numbers are normalised to E.164 (+32...); unusable numbers are left empty.
-- * No marketing consent is assumed.
-- * Every lead is linked to its customer, with a history event.
-- * E-mail addresses are stored in lowercase, like customers created in the app.
-- * Safe to run again: only leads without a customer are processed and existing active customers
--   (same e-mail address) are reused, never overwritten. An e-mail address that only belongs to an
--   archived customer gets a new active customer; the archived record and its number stay untouched.

-- Phone normalisation, same rules as normalizePhone in lib/customers.ts.
create or replace function public.shop_normalize_phone(raw text, country text) returns text
language plpgsql immutable set search_path=public as $$
declare v text := regexp_replace(coalesce(raw,''),'[[:space:].\-/]','','g');
begin
 if v='' then return null; end if;
 v := regexp_replace(v,'^(\+[0-9]{1,3})\(0\)','\1');
 v := replace(replace(v,'(',''),')','');
 if v like '00%' then v := '+'||substr(v,3);
 elsif v like '0%' then
  if country='NL' then v := '+31'||substr(v,2);
  elsif country='BE' then v := '+32'||substr(v,2);
  elsif country='FR' then v := '+33'||substr(v,2);
  elsif country='LU' then v := '+352'||substr(v,2);
  elsif country='DE' then v := '+49'||substr(v,2);
  else return null; end if;
 end if;
 if v !~ '^\+' then return null; end if;
 v := regexp_replace(v,'^\+(32|31|33|352|49)0','+\1');
 if v !~ '^\+[1-9][0-9]{6,14}$' then return null; end if;
 return v;
end $$;

create or replace function public.shop_customers_import_from_leads() returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 actor constant text := 'import:buyback-leads';
 result jsonb;
 linked integer;
begin
 drop table if exists pg_temp.imp_leads, pg_temp.imp_customers, pg_temp.imp_numbers, pg_temp.imp_created;
 create temp table imp_created(id uuid, customer_number text, review_note text) on commit drop;

 -- Leads that still need a customer.
 create temp table imp_leads on commit drop as
 select l.id, l.created_at, lower(trim(l.email)) as email_key, trim(l.email) as email,
        nullif(trim(l.first_name),'') as first_name, nullif(trim(l.last_name),'') as last_name,
        nullif(trim(l.customer_name),'') as customer_name, l.phone,
        coalesce(nullif(trim(l.street),''),'') as street, coalesce(nullif(trim(l.house_number),''),'') as house_number,
        upper(coalesce(nullif(trim(l.postal_code),''),'')) as postal_code, coalesce(nullif(trim(l.city),''),'') as city,
        case when upper(trim(coalesce(l.country,''))) ~ '^[A-Z]{2}$' then upper(trim(l.country)) else 'BE' end as country,
        l.shop_id,
        case when trim(coalesce(l.customer_number,'')) ~ '^[0-9]{4,10}$' then trim(l.customer_number) end as number
 from public.buyback_leads l
 where l.shop_customer_id is null
   and nullif(trim(l.email),'') is not null
   and lower(trim(l.email)) ~ '^[^@[:space:],()"''\\]+@[^@[:space:],()"''\\]+\.[^@[:space:],()"''\\]+$';

 -- One row per new customer (e-mail not yet known as an active customer).
 create temp table imp_customers on commit drop as
 select distinct on (email_key)
        email_key, email, first_name, last_name, customer_name, phone, street, house_number, postal_code, city, country, shop_id,
        created_at as latest_at,
        min(created_at) over (partition by email_key) as first_at,
        count(*) over (partition by email_key) as lead_count
 from imp_leads
 where not exists (select 1 from public.shop_customers c where lower(c.email)=imp_leads.email_key and c.archived_at is null)
 order by email_key, created_at desc;
 alter table imp_customers add column numbers text[], add column chosen text, add column review text;

 update imp_customers ic set
   numbers = n.numbers,
   chosen = n.latest_number
 from (
   select email_key,
          array_agg(distinct number) filter (where number is not null) as numbers,
          (array_agg(number order by created_at desc) filter (where number is not null))[1] as latest_number
   from imp_leads group by email_key
 ) n where n.email_key = ic.email_key;

 update imp_customers set review = 'Import buyback-leads: verschillende klantnummers op de leads ('
   || array_to_string(numbers, ', ') || '). Gekozen: ' || chosen || ' (meest recente lead). Controleer in het boekhoudpakket.'
 where cardinality(numbers) > 1;

 -- Numbers claimed by several new customers: the customer with most leads carrying it wins (tie: latest).
 create temp table imp_numbers on commit drop as
 select ic.email_key, ic.chosen,
        row_number() over (partition by ic.chosen order by
          (select count(*) from imp_leads il where il.email_key=ic.email_key and il.number=ic.chosen) desc,
          (select max(created_at) from imp_leads il where il.email_key=ic.email_key and il.number=ic.chosen) desc,
          ic.email_key) as rank,
        count(*) over (partition by ic.chosen) as claimants
 from imp_customers ic where ic.chosen is not null;

 -- Any number seen on the leads of more than one e-mail address (on any lead, not only the chosen
 -- number) is ambiguous: every customer involved is marked for review.
 update imp_customers ic set
   review = concat_ws(' ', ic.review, 'Import buyback-leads: klantnummer(s) ' || shared.numbers
     || ' ook gevonden op leads van een andere klant. Controleer of het nummer bij deze klant hoort.')
 from (
   select mine.email_key, string_agg(distinct mine.number, ', ' order by mine.number) as numbers
   from (select distinct email_key, number from imp_leads where number is not null) mine
   where exists (select 1 from imp_leads other where other.number = mine.number and other.email_key <> mine.email_key)
   group by mine.email_key
 ) shared
 where shared.email_key = ic.email_key;

 update imp_customers ic set
   review = concat_ws(' ', ic.review, 'Import buyback-leads: klantnummer ' || ic.chosen
     || ' niet overgenomen, het staat ook op leads van een andere klant die het nummer heeft gekregen. Zoek het juiste nummer op in het boekhoudpakket.'),
   chosen = null
 from imp_numbers n where n.email_key=ic.email_key and n.rank > 1;

 -- Never take a number that an existing customer already has.
 update imp_customers ic set
   review = concat_ws(' ', ic.review, 'Import buyback-leads: klantnummer ' || ic.chosen
     || ' niet overgenomen, het is al gekoppeld aan een bestaande klant. Controleer het nummer.'),
   chosen = null
 where ic.chosen is not null and exists (select 1 from public.shop_customers c where c.customer_number = ic.chosen);

 with ins as (
   insert into public.shop_customers(
     customer_type, first_name, last_name, email, phone, street, house_number, postal_code, city, country,
     preferred_shop_id, customer_number, review_note, marketing_opt_in, created_at, updated_at, created_by, updated_by)
   select 'private',
          left(coalesce(ic.first_name, ''), 80),
          left(coalesce(ic.last_name, case when ic.first_name is null then ic.customer_name end, ''), 80),
          ic.email_key,
          public.shop_normalize_phone(ic.phone, ic.country),
          left(ic.street,160), left(ic.house_number,20), left(ic.postal_code,12), left(ic.city,80), ic.country,
          (select s.id from public.buyback_shops s where s.id = ic.shop_id),
          ic.chosen, left(ic.review, 1000), false, ic.first_at, now(), actor, actor
   from imp_customers ic
   where length(trim(coalesce(ic.first_name,'')||coalesce(ic.last_name,'')||coalesce(ic.customer_name,''))) > 0
   returning id, customer_number, review_note
 )
 insert into imp_created select id, customer_number, review_note from ins;

 -- Link every open lead to the (oldest active) customer with the same e-mail address.
 with links as (
   update public.buyback_leads l set shop_customer_id = c.id
   from imp_leads il
   join lateral (
     select id from public.shop_customers c
     where lower(c.email) = il.email_key and c.archived_at is null
     order by c.created_at, c.id limit 1
   ) c on true
   where l.id = il.id and l.shop_customer_id is null
   returning l.id as lead_id, c.id as customer_id
 )
 insert into public.shop_customer_events(customer_id, event, actor, reference_id)
 select customer_id, 'lead_linked', actor, lead_id from links;

 get diagnostics linked = row_count;

 select jsonb_build_object(
   'customers_created', (select count(*) from imp_created),
   'with_customer_number', (select count(*) from imp_created where customer_number is not null),
   'without_customer_number', (select count(*) from imp_created where customer_number is null),
   'to_review', (select count(*) from imp_created where review_note is not null),
   'leads_linked', linked,
   'leads_still_without_customer', (select count(*) from public.buyback_leads where shop_customer_id is null)
 ) into result;
 return result;
end $$;

revoke all on function public.shop_customers_import_from_leads() from public, anon, authenticated, service_role;
revoke all on function public.shop_normalize_phone(text, text) from public, anon, authenticated;
grant execute on function public.shop_normalize_phone(text, text) to service_role;

-- Run the import and show the summary:
select public.shop_customers_import_from_leads();
