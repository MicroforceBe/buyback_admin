import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isSupplierRmaItem, isRefundedRmaItem } from '@/lib/supplierRma';

export type RmaCase = { id: string; code: string; supplier_id: string | null; supplier_name: string; supplier_reference: string; supplier_credit_note: string; reception_id: string | null; stage: string; tracking_reference: string; sent_on: string | null; received_on: string | null; followup_on: string | null; notes: string; version: number; created_at: string; updated_at: string };
export type RmaCaseItem = { id: string; case_id: string; reception_item_id: string; expected_cents: number | null; received_cents: number; notes: string; active: boolean };
export type RmaSource = { id: string; reception_id: string; refurb_status: string | null; description: string | null; imei_sn: string | null; manual_sn: string | null; sku: string | null; price_cents: number | null; compensation_cents: number | null; rma_registered: boolean; rma_defect_description: string | null };
type Reception = { id: string; reception_number: string; supplier_id: string | null; supplier: string; supplier_invoice_nr: string };
type History = { id: string; case_id: string; actor: string; event: string; created_at: string; details: { change?: Record<string, unknown> } };
type StatusHistory = { id: string; reception_item_id: string; old_status: string | null; new_status: string | null; old_compensation_cents: number | null; new_compensation_cents: number | null; created_at: string };
export async function loadSupplierRmaData() {
  async function all<T>(table: string, columns: string): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin.from(table).select(columns).order('id', { ascending: true }).range(offset, offset + 999);
      if (error) throw Error('RMA-gegevens konden niet volledig geladen worden.');
      rows.push(...(data ?? []) as T[]);
      if ((data ?? []).length < 1000) return rows;
    }
  }
  const [cases, caseItems, sourceItems, receptions, statuses, transitions, history, statusHistory] = await Promise.all([
    all<RmaCase>('supplier_rma_cases', 'id,code,supplier_id,supplier_name,supplier_reference,supplier_credit_note,reception_id,stage,tracking_reference,sent_on,received_on,followup_on,notes,version,created_at,updated_at'),
    all<RmaCaseItem>('supplier_rma_items', 'id,case_id,reception_item_id,expected_cents,received_cents,notes,active'),
    all<RmaSource>('refurb_reception_items', 'id,reception_id,refurb_status,description,imei_sn,manual_sn,sku,price_cents,compensation_cents,rma_registered,rma_defect_description'),
    all<Reception>('refurb_receptions', 'id,reception_number,supplier_id,supplier,supplier_invoice_nr'),
    all<{ id: string; value: string; label: string }>('refurb_status_options', 'id,value,label'),
    all<{ from_status_id: string }>('refurb_status_transitions', 'id,from_status_id'),
    all<History>('supplier_rma_history', 'id,case_id,actor,event,details,created_at'),
    all<StatusHistory>('supplier_rma_status_history', 'id,reception_item_id,old_status,new_status,old_compensation_cents,new_compensation_cents,created_at'),
  ]);
  const receptionById = new Map(receptions.map(row => [row.id, row]));
  const sourceById = new Map(sourceItems.map(row => [row.id, row]));
  const activeItems = new Set(caseItems.filter(row => row.active).map(row => row.reception_item_id));
  const outgoing = new Set(transitions.map(row => row.from_status_id));
  const isFinal = (status: string | null) => {
    const value = (status ?? '').trim().toLowerCase();
    const option = statuses.find(row => row.value.toLowerCase() === value || row.label.toLowerCase() === value);
    return transitions.length ? !!option && !outgoing.has(option.id) : ['booked', 'ready to book', 'ready_to_book'].includes(value) || value.includes('finished');
  };
  const candidates = sourceItems.filter(row => isSupplierRmaItem(row, statuses) && !isRefundedRmaItem(row,statuses) && row.compensation_cents != null && !activeItems.has(row.id)).map(row => ({ ...row, reception: receptionById.get(row.reception_id), finished: isFinal(row.refurb_status) })).filter(row => row.reception);
  const suppliers = Array.from(new Map(receptions.map(row => [row.supplier_id || 'name:' + row.supplier.trim().toLowerCase(), { key: row.supplier_id || 'name:' + row.supplier.trim().toLowerCase(), name: row.supplier }])).values()).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  return { cases: cases.sort((a, b) => b.updated_at.localeCompare(a.updated_at)), caseItems, sourceById, receptionById, candidates, suppliers, history, statusHistory };
}
