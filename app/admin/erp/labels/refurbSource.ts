import 'server-only';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { canPrintRefurbLabel } from '@/lib/refurbLabel';

export async function getRefurbLabelSource(itemId: string) {
  await requirePageAccess('refurb', false);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) return { error: 'Ongeldig receptieartikel.' } as const;
  const {data:item,error} = await supabaseAdmin.from('refurb_reception_items').select('id,reception_id,sku,imei_sn,manual_sn,refurb_status,battery_percentage,description').eq('id',itemId).maybeSingle();
  if (error || !item) return { error: 'Het receptieartikel kon niet worden geladen.' } as const;
  const {data:options,error:statusError} = await supabaseAdmin.from('refurb_status_options').select('value,label');
  if (statusError || !canPrintRefurbLabel(item.refurb_status, options ?? [])) return { error: 'Een verpakkingslabel is alleen beschikbaar bij Finished, Ready to book of Booked. Vernieuw de receptie als de status net gewijzigd is.' } as const;
  if (!item.sku?.trim()) return { error: 'Vul eerst een bestaande ERP-SKU in bij het receptieartikel en sla die op.' } as const;
  return { item, battery:item.battery_percentage == null ? '' : String(item.battery_percentage), description:item.description, sku:item.sku.trim(), imei:item.imei_sn?.trim() || item.manual_sn?.trim() || '' } as const;
}

