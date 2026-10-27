create table public.buyback_development_backlog(
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 180),
 description text not null default '' check(length(description)<=10000),
 module text not null default '' check(length(module)<=80),
 status text not null default 'idea' check(status in ('idea','planned','in_progress','testing','done','postponed','archived')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by text not null,updated_by text not null
);
create index buyback_development_backlog_updated_idx on public.buyback_development_backlog(updated_at desc);
alter table public.buyback_development_backlog enable row level security;
revoke all on public.buyback_development_backlog from public,anon,authenticated,service_role;
grant select,insert,update on public.buyback_development_backlog to service_role;
insert into public.buyback_development_backlog(title,description,module,status,priority,created_by,updated_by)
values('Persoonlijke werkpc en werkplekbeveiliging','Uitgesteld op verzoek van Olivier. Onderzoeken: persoonlijke aanmelding met Windows Hello of FIDO2-veiligheidskey, toegestane werkpc per medewerker en toegang via het bedrijfsnetwerk. Bestaande accounts en modulerechten behouden. Eerst Microsoft 365/Windows-beheer en gedeelde werkplekken inventariseren; een veiligheidskey alleen bindt geen pc of locatie. Nog geen opdracht tot uitvoering of aankoop.','Beveiliging','postponed','normal','projectsetup','projectsetup');
