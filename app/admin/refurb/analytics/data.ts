import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { AnalyticsInput } from '@/lib/refurbAnalytics';

export async function loadAnalyticsInput(): Promise<AnalyticsInput> {
  async function all(table: string, columns: string) {
    const rows: unknown[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseAdmin.from(table).select(columns).order('id', { ascending: true }).range(from, from + pageSize - 1);
      if (error) throw Error('Analytics kon niet volledig worden geladen. Probeer opnieuw.');
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < pageSize) return rows;
    }
  }
  const [receptions, items, models, statuses, transitions, suppliers] = await Promise.all([
    all('refurb_receptions', 'id,reception_number,supplier,supplier_id,reception_date'),
    all('refurb_reception_items', 'id,reception_id,refurb_status,description,price_cents,compensation_cents,rma_registered'),
    all('refurb_models', 'id,name,search_keywords'),
    all('refurb_status_options', 'id,value,label'),
    all('refurb_status_transitions', 'id,from_status_id,to_status_id'),
    all('refurb_suppliers', 'id,name'),
  ]);
  return { receptions, items, models, statuses, transitions, suppliers } as AnalyticsInput;
}

