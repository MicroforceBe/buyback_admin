alter table public.refurb_reception_items add column battery_percentage integer;
alter table public.refurb_reception_items add constraint refurb_reception_battery_range check (battery_percentage between 0 and 100);
comment on column public.refurb_reception_items.battery_percentage is 'Battery capacity in percent. NULL is shown as - and omitted on reception labels. Smartphones require at least 85 percent for printing.';
