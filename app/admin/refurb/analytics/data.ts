import {buildReceptionRmaWork} from '@/lib/receptionRmaWork';
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
  const [receptions, items, models, statuses, transitions, suppliers, rmaLines, rmaFollowups, rmaCases] = await Promise.all([
    all('refurb_receptions', 'id,reception_number,supplier,supplier_id,reception_date'),
    all('refurb_reception_items', 'id,reception_id,refurb_status,description,price_cents,compensation_cents,rma_registered'),
    all('refurb_models', 'id,name,search_keywords'),
    all('refurb_status_options', 'id,value,label'),
    all('refurb_status_transitions', 'id,from_status_id,to_status_id'),
    all('refurb_suppliers', 'id,name'),
    all('supplier_rma_items','id,case_id,reception_item_id,expected_cents,received_cents,decision,approved_cents,written_off_cents'),
    all('supplier_rma_followups','id,case_item_id,custody,repair_state'),
    all('supplier_rma_cases','id,code,stage,created_at'),
  ]);
  const stages=new Map((rmaCases as {id:string;stage:string}[]).map(row=>[row.id,row.stage]));
  const rmaCaseItems=(rmaLines as {case_id:string}[]).map(row=>({...row,case_stage:stages.get(row.case_id)}));
  const work=buildReceptionRmaWork(rmaLines as Parameters<typeof buildReceptionRmaWork>[0],rmaFollowups as Parameters<typeof buildReceptionRmaWork>[1],rmaCases as Parameters<typeof buildReceptionRmaWork>[2],items as {id:string;refurb_status:string|null}[]);
  const workById=new Map(work.map(row=>[row.reception_item_id,row.status]));
  const operationalItems=(items as AnalyticsInput['items']).map(item=>({...item,work_status:workById.get(item.id)}));
  return { receptions, items:operationalItems, models, statuses, transitions, suppliers,rmaCaseItems,rmaFollowups } as AnalyticsInput;
}


