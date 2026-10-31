import RefurbLabelPrintButton from './RefurbLabelPrintButton';
import LeadLabelPrintButton from '../leads/LeadLabelPrintButton';
import {canPrintRefurbLabel} from '@/lib/refurbLabel';
import OpenReceptionModels from './OpenReceptionModels';
import {buildOpenReceptionSummary,mergeOpenReceptionSummaries,type OpenReceptionItem,type OpenReceptionModel,type OpenReceptionSummary} from '@/lib/receptionOpenSummary';
import {loadReceptionRmaWork} from './rma/receptionWorkData';
import ui from './rma/rma.module.css';
import styles from './reception.module.css';
import ReceptionQuickSearch from './ReceptionQuickSearch';
import { receptionRmaDays, receptionOverviewCounts } from '@/lib/receptionTerms';
import { updateReceptionMetadata } from './receptionMetadataActions';
import { permits } from '@/lib/security/policy';
import { deleteRefurbReception } from "./actions";
import { requirePageAccess } from '@/lib/security/access';
import { requireAccess } from '@/lib/security/access';
// app/admin/refurb/page.tsx

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RefurbReception = {
  id: string;
  reception_number: string;
  reception_date: string;
  supplier: string;
  vat_scheme: "margin" | "normal";
  supplier_invoice_nr: string;
  internal_invoice_nr: string | null;
  updated_at:string;
  rma_expiry_days:number|null;
  rma_expiry_date:string|null;
  open_overview?:OpenReceptionSummary;
  overview_unavailable?:boolean;
  total_items?: number;
  ready_to_book_count?: number;
  waiting_for_sku_count?: number;
  rma_count?: number;
  finished_items_count?: number;
  finished_percent?: number;
  open_status_counts?: { value: string; label: string; color: string; count: number; order: number }[];
};

type ReceptionItemStatsRow = {
  description:string|null;
  price_cents:number|null;
  id: string;
  reception_id: string;
  refurb_status: string | null;
};

type RefurbStatusOptionRow = {
  id: string;
  value: string;
  label: string | null;
  color?: string | null;
  sort_order?: number;
  is_default?: boolean;
};

type RefurbStatusTransitionRow = {
  from_status_id: string;
  to_status_id: string;
};

type SearchResult = {
  labelItemId?:string;
  labelLeadId?:string;
  source: "Receptie lijst" | "Lead";
  reference_number: string | null;
  sku: string | null;
  description: string | null;
  used_parts: string | null;
  battery_status: string | null;
  purchase_date: string | null;
  supplier: string | null;
  link?: string;
};

function formatDate(date: string | null | undefined) {
  if (!date) return "—";

  try {
    return new Date(date).toLocaleDateString("nl-BE");
  } catch {
    return date;
  }
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isReadyToBookStatus(value: string | null | undefined) {
  const status = normalizeStatus(value);

  return status === "ready to book" || status === "ready_to_book";
}

function isWaitingForSkuStatus(value: string | null | undefined) {
  const status = normalizeStatus(value);

  return status === "waiting for sku" || status === "waiting_for_sku";
}

function isRmaStatus(value: string | null | undefined) {
  return normalizeStatus(value) === "rma";
}

/**
 * Fallback wanneer er nog geen statustransities geconfigureerd zijn.
 * Zodra er transitions bestaan, geldt een status zonder uitgaande
 * transitie als eindstatus.
 */
function isFallbackFinishedStatus(value: string | null | undefined) {
  const status = normalizeStatus(value);

  return (
    status === "booked" ||
    status === "ready to book" ||
    status === "ready_to_book" ||
    status.includes("finished")
  );
}

async function getFinalStatusValues(): Promise<{
  hasConfiguredTransitions: boolean;
  finalStatusValues: Set<string>;
  canonicalStatusByInput: Map<string, string>;
  statusDetails: Map<string, { value: string; label: string; color: string; order: number }>;
  defaultStatus: string;
}> {
  const [statusResult, transitionResult] = await Promise.all([
    supabaseAdmin
      .from("refurb_status_options")
      .select("id, value, label, color, sort_order, is_default").order("sort_order", { ascending: true }).order("label", { ascending: true }),

    supabaseAdmin
      .from("refurb_status_transitions")
      .select("from_status_id, to_status_id"),
  ]);

  if (statusResult.error) {
    console.error(
      "[REFURB] error fetching status options for reception statistics",
      statusResult.error
    );
  }

  if (transitionResult.error) {
    console.error(
      "[REFURB] error fetching status transitions for reception statistics",
      transitionResult.error
    );
  }

  const statusOptions =
    (statusResult.data || []) as RefurbStatusOptionRow[];

  const transitions =
    (transitionResult.data || []) as RefurbStatusTransitionRow[];

  const hasConfiguredTransitions = transitions.length > 0;

  const outgoingStatusIds = new Set(
    transitions
      .map((transition) =>
        String(transition.from_status_id || "").trim()
      )
      .filter(Boolean)
  );

  const finalStatusValues = new Set<string>();
  const canonicalStatusByInput = new Map<string, string>();
  const statusDetails = new Map<string, { value: string; label: string; color: string; order: number }>();
  const defaultStatus = normalizeStatus(statusOptions.find(option => option.is_default)?.value || statusOptions[0]?.value);

  for (const option of statusOptions) {
    const optionId = String(option.id || "").trim();
    const value = String(option.value || "").trim();
    const label = String(option.label || "").trim();

    if (!value) continue;

    const normalizedValue = normalizeStatus(value);
    statusDetails.set(normalizedValue, { value, label: label || value, color: option.color || "#64748b", order: option.sort_order ?? 0 });

    canonicalStatusByInput.set(
      normalizedValue,
      normalizedValue
    );

    if (label) {
      canonicalStatusByInput.set(
        normalizeStatus(label),
        normalizedValue
      );
    }

    if (
      hasConfiguredTransitions &&
      optionId &&
      !outgoingStatusIds.has(optionId)
    ) {
      finalStatusValues.add(normalizedValue);
    }
  }

  return {
    hasConfiguredTransitions,
    finalStatusValues,
    canonicalStatusByInput,
    statusDetails,
    defaultStatus,
  };
}

async function getReceptions(): Promise<RefurbReception[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_receptions")
    .select(
      `
      id,
      reception_number,
      reception_date,
      supplier,
      vat_scheme,
      supplier_invoice_nr,
      internal_invoice_nr,
      updated_at,
      rma_expiry_days,
      rma_expiry_date
      `
    )
    .order("reception_date", { ascending: false });

  if (error) {
    console.error("[REFURB] error fetching receptions", error);
    return [];
  }

  const receptions = (data || []) as RefurbReception[];
  const receptionIds = receptions.map(
    (reception) => reception.id
  );

  if (!receptionIds.length) {
    return receptions.map((reception) => ({
      ...reception,
      total_items: 0,
      ready_to_book_count: 0,
      waiting_for_sku_count: 0,
      rma_count: 0,
      finished_items_count: 0,
      finished_percent: 0,
    }));
  }

const statusConfig = await getFinalStatusValues();

const items: ReceptionItemStatsRow[] = [];
const pageSize = 1000;
let from = 0;

while (true) {
  const { data: batch, error: itemsError } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("id, reception_id, refurb_status, description, price_cents")
    .in("reception_id", receptionIds)
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);

  if (itemsError) {
    console.error(
      "[REFURB] error fetching reception items for statistics",
      itemsError
    );

    return receptions.map((reception) => ({
      ...reception,
      overview_unavailable:true,
      total_items: 0,
      ready_to_book_count: 0,
      waiting_for_sku_count: 0,
      rma_count: 0,
      finished_items_count: 0,
      finished_percent: 0,
    }));
  }

  const rows = (batch || []) as ReceptionItemStatsRow[];

  items.push(...rows);

  if (rows.length < pageSize) {
    break;
  }

  from += pageSize;
}

  const models:OpenReceptionModel[]=[];let modelsAvailable=true;
  for(let offset=0;;offset+=1000){const result=await supabaseAdmin.from('refurb_models').select('id,name,search_keywords').order('id',{ascending:true}).range(offset,offset+999);if(result.error){modelsAvailable=false;break;}models.push(...(result.data||[]) as OpenReceptionModel[]);if((result.data||[]).length<1000)break;}
  const openItemsByReception=new Map<string,OpenReceptionItem[]>();
  const rmaWork=await loadReceptionRmaWork();
  const workById=new Map(rmaWork.map(work=>[work.reception_item_id,work]));

  const stats = new Map<
    string,
    {
      total: number;
      readyToBook: number;
      waitingForSku: number;
      rma: number;
      finished: number;
    }
  >();

  for (const receptionId of receptionIds) {
    stats.set(receptionId, {
      total: 0,
      readyToBook: 0,
      waitingForSku: 0,
      rma: 0,
      finished: 0,
    });
  }

  const openStatusCounts = new Map<string, Map<string, { value: string; label: string; color: string; count: number; order: number }>>();

  for (const item of items) {
    const receptionId = String(
      item.reception_id || ""
    ).trim();

    if (!receptionId) continue;

    const currentStats =
      stats.get(receptionId) || {
        total: 0,
        readyToBook: 0,
        waitingForSku: 0,
        rma: 0,
        finished: 0,
      };

    /*
     * Eén rij in refurb_reception_items staat voor
     * één individueel artikel of toestel.
     */
    currentStats.total += 1;

    const rawStatus = normalizeStatus(
      item.refurb_status
    );

    const canonicalStatus =
      statusConfig.canonicalStatusByInput.get(rawStatus) ||
      rawStatus || statusConfig.defaultStatus;

    if (isReadyToBookStatus(canonicalStatus)) {
      currentStats.readyToBook += 1;
    }

    if (isWaitingForSkuStatus(canonicalStatus)) {
      currentStats.waitingForSku += 1;
    }

    if (isRmaStatus(canonicalStatus)) {
      currentStats.rma += 1;
    }

    const isFinished = !workById.has(item.id) && (statusConfig.hasConfiguredTransitions
      ? statusConfig.finalStatusValues.has(canonicalStatus)
      : isFallbackFinishedStatus(canonicalStatus));

    if(!isFinished){
      const detail=statusConfig.statusDetails.get(canonicalStatus),work=workById.get(item.id);
      const open=openItemsByReception.get(receptionId)||[];
      open.push({description:item.description??null,price_cents:item.price_cents??null,status:work?.status||canonicalStatus||'unknown',label:work?.label||detail?.label||item.refurb_status?.trim()||'Geen status'});
      openItemsByReception.set(receptionId,open);
    }
    if (isFinished) {
      currentStats.finished += 1;
    } else if (canonicalStatus) {
      const counts = openStatusCounts.get(receptionId) || new Map();
      const detail = statusConfig.statusDetails.get(canonicalStatus) || { value: item.refurb_status?.trim() || canonicalStatus, label: item.refurb_status?.trim() || canonicalStatus, color: "#64748b", order: Number.MAX_SAFE_INTEGER };
      const badge = counts.get(canonicalStatus) || { ...detail, count: 0 };
      badge.count++;
      counts.set(canonicalStatus, badge);
      openStatusCounts.set(receptionId, counts);
    }

    stats.set(receptionId, currentStats);
  }

  return receptions.map((reception) => {
    const receptionStats =
      stats.get(reception.id) || {
        total: 0,
        readyToBook: 0,
        waitingForSku: 0,
        rma: 0,
        finished: 0,
      };

    const totalItems = receptionStats.total;
    const finishedItems = receptionStats.finished;

    const finishedPercent =
      totalItems > 0
        ? Math.min(finishedItems === totalItems ? 100 : 99, Math.round(
            (finishedItems / totalItems) * 100
          ))
        : 0;

    return {
      ...reception,
      open_overview:buildOpenReceptionSummary(openItemsByReception.get(reception.id)||[],models,modelsAvailable),
      total_items: totalItems,
      ready_to_book_count:
        receptionStats.readyToBook,
      waiting_for_sku_count:
        receptionStats.waitingForSku,
      rma_count: receptionStats.rma,
      finished_items_count: finishedItems,
      finished_percent: finishedPercent,
      open_status_counts: Array.from(openStatusCounts.get(reception.id)?.values() || []).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "nl")),
    };
  });
}

async function searchRefurbDevice(
  query: string
): Promise<SearchResult[]> {
  const q = query.trim();

  if (!q) return [];

  const results: SearchResult[] = [];
  const printOptions=await supabaseAdmin.from("refurb_status_options").select("value,label");

  const {
    data: receptionItems,
    error: receptionItemsError,
  } = await supabaseAdmin
    .from("refurb_reception_items")
    .select(`
      id,
      reception_id,
      sku,
      description,
      used_parts,
      imei_sn,
      manual_sn,
      battery_percentage,
      refurb_status,
      created_at,
      refurb_receptions (
        id,
        reception_number,
        reception_date,
        supplier
      )
    `)
    .or(`imei_sn.ilike.%${q}%,manual_sn.ilike.%${q}%`)
    .limit(50);

  if (receptionItemsError) {
    console.error(
      "[REFURB] search reception items error",
      receptionItemsError
    );
  }

  for (const item of receptionItems || []) {
    const reception = Array.isArray(
      (item as any).refurb_receptions
    )
      ? (item as any).refurb_receptions[0]
      : (item as any).refurb_receptions;

    results.push({
      source: "Receptie lijst",
      labelItemId:!printOptions.error&&canPrintRefurbLabel((item as any).refurb_status,printOptions.data||[])?String(item.id):undefined,
      reference_number:
        reception?.reception_number || null,
      sku: (item as any).sku || null,
      description:
        (item as any).description || null,
      used_parts:
        (item as any).used_parts || null,
      battery_status:(item as any).battery_percentage!=null?`${(item as any).battery_percentage}%`:null,
      purchase_date:
        reception?.reception_date ||
        (item as any).created_at ||
        null,
      supplier: reception?.supplier || null,
      link: reception?.id
        ? `/admin/refurb/${reception.id}`
        : undefined,
    });
  }

  const { data: leads, error: leadsError } =
    await supabaseAdmin
      .from("buyback_leads")
      .select(`
        id,
        created_at,
        source,
        model,
        capacity_gb,
        sku,
        imei_sn,
        battery_percentage,
        used_parts_skus,
        order_code,
        customer_number,
        first_name,
        last_name
      `)
      .ilike("imei_sn", `%${q}%`)
      .limit(50);

  if (leadsError) {
    console.error(
      "[REFURB] search leads error",
      leadsError
    );
  }

  for (const lead of leads || []) {
    const firstName =
      (lead as any).first_name || "";
    const lastName =
      (lead as any).last_name || "";
    const fullName =
      `${firstName} ${lastName}`.trim();

    results.push({
      source: "Lead",
      labelLeadId:(lead as any).id&&String((lead as any).sku||"").trim()?String((lead as any).id):undefined,
      reference_number:
        (lead as any).order_code || null,
      sku: (lead as any).sku || null,
      description:
        [
          (lead as any).model,
          (lead as any).capacity_gb
            ? `${(lead as any).capacity_gb}GB`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      used_parts: Array.isArray(
        (lead as any).used_parts_skus
      )
        ? (lead as any).used_parts_skus.join(", ")
        : null,
      battery_status:
        (lead as any).battery_percentage != null
          ? `${(lead as any).battery_percentage}%`
          : null,
      purchase_date: formatDate(
        (lead as any).created_at
      ),
      supplier:
        [
          (lead as any).customer_number,
          fullName,
        ]
          .filter(Boolean)
          .join(" - ") || null,
      link: (lead as any).id
        ? `/admin/leads/${(lead as any).id}`
        : undefined,
    });
  }

  return results;
}

async function deleteRefurbReceptionAction(
  formData: FormData
) {
  "use server";
  await requireAccess('refurb', 'write', false);

  const user = await getCurrentAdminUser();

  if (!user || (user as any).role !== "admin") {
    redirect(
      "/admin/refurb?msg=forbidden:not_admin"
    );
  }

  const receptionId = String(
    formData.get("reception_id") || ""
  ).trim();

  if (!receptionId) {
    redirect(
      "/admin/refurb?msg=missing_reception_id"
    );
  }

  let deletionFailed = false;
  try {
    await deleteRefurbReception(receptionId);
  } catch {
    deletionFailed = true;
  }

  // redirect throws internally: keep it outside the try/catch.
  if (deletionFailed) {
    redirect("/admin/refurb?msg=delete_reception_failed");
  }

  revalidatePath("/admin/refurb");

  redirect(
    "/admin/refurb?msg=deleted_reception"
  );
}

export default async function RefurbListPage({
  searchParams: incomingSearchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    msg?: string;
    show_completed?: string;
    meta?:string;
  }>;
}) {
  await requirePageAccess('refurb', false);
  const searchParams = await incomingSearchParams;

  const q = String(
    searchParams?.q || ""
  ).trim();

  const [receptions, searchResults, user] =
    await Promise.all([
      getReceptions(),
      searchRefurbDevice(q),
      getCurrentAdminUser(),
    ]);

  const isAdmin =
    !!user && (user as any).role === "admin";

  const showCompleted = searchParams?.show_completed === "1";
  const completedCount = receptions.filter((reception) =>
    (reception.total_items ?? 0) > 0 &&
    reception.finished_items_count === reception.total_items
  ).length;
  const visibleReceptions = showCompleted ? receptions : receptions.filter((reception) =>
    !(reception.total_items && reception.finished_items_count === reception.total_items)
  );
  const {openItems,expiringItems}=receptionOverviewCounts(receptions);
  const openOverview=mergeOpenReceptionSummaries(receptions.map(row=>row.open_overview||{groups:[]}));
  const overviewUnavailable=receptions.some(row=>row.overview_unavailable);
  const openMoney=overviewUnavailable?'Niet beschikbaar':new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(openOverview.purchaseCents/100);
  const toggleParams = new URLSearchParams();
  if (q) toggleParams.set("q", q);
  if (!showCompleted) toggleParams.set("show_completed", "1");
  const toggleHref = "/admin/refurb" + (toggleParams.size ? "?" + toggleParams.toString() : "");

  return (
    <div className={`${ui.workspace} ${styles.reception} ${styles.listPage}`}>
      {searchParams?.meta&&<p role={searchParams.meta==='saved'?'status':'alert'}>{searchParams.meta==='saved'?'Intern factuurnummer opgeslagen.':searchParams.meta==='conflict'?'Deze receptie is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.':'Niet opgeslagen. Controleer het factuurnummer.'}</p>}
      {searchParams?.msg === "delete_reception_failed" && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          De receptie is niet verwijderd. Een receptie met geboekte toestellen mag
          niet worden verwijderd. Controleer de toestelstatussen en probeer het
          indien nodig opnieuw.
        </div>
      )}
      {searchParams?.msg === "deleted_reception" && (
        <div role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          De receptie is verwijderd.
        </div>
      )}
      <header className={styles.listHeader}><h1>Recepties</h1>{permits(user,'refurb','write')&&<Link href="/admin/refurb/new" className="bb-btn">+ Nieuwe receptie</Link>}</header>
      {expiringItems>0&&<div role="alert" className="reception-expiry-warning"><span aria-hidden="true">⚠</span><p><strong>Let op:</strong> voor {expiringItems} {expiringItems===1?'openstaand artikel vervalt':'openstaande artikelen vervalt'} de garantietermijn binnen 7 dagen.</p></div>}
      <div className={styles.listUtilities}>
      <details
        className="reception-panel"
        open={!!q}
      >
        <summary className="reception-panel-heading">
          <strong>Refurb tools · zoeken op IMEI / SN</strong><span className="reception-chevron" aria-hidden="true">›</span>
        </summary>

        <div className="border-t p-4 space-y-4">
          <div className="flex gap-2 border-b">
            <div className="border-b-2 border-blue-600 px-3 py-2 text-sm font-medium">
              Search
            </div>
          </div>

          <form
            className="flex gap-2"
            action="/admin/refurb"
          >
            {showCompleted && <input type="hidden" name="show_completed" value="1" />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Zoek op IMEI / SN"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />

            <button
              type="submit"
              className="bb-btn bb-btn-primary text-sm"
            >
              Zoek
            </button>
          </form>

          {q && (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                Resultaten voor:{" "}
                <span className="font-medium">
                  {q}
                </span>
              </div>

              {searchResults.length === 0 && (
                <div className="rounded-md border p-4 text-sm text-slate-500">
                  Geen resultaat gevonden.
                </div>
              )}

              {searchResults.map(
                (result, index) => (
                  <div
                    key={`${result.source}-${index}`}
                    className="rounded-md border p-4 text-sm space-y-1"
                  >
                    <div>
                      <b>Bron:</b>{" "}
                      {result.source === "Lead"
                        ? `Lead ${
                            result.reference_number ||
                            "—"
                          }`
                        : `Receptie ${
                            result.reference_number ||
                            "—"
                          }`}
                    </div>

                    <div>
                      <b>SKU:</b>{" "}
                      {result.sku || "—"}
                    </div>

                    <div>
                      <b>Omschrijving:</b>{" "}
                      {result.description || "—"}
                    </div>

                    <div>
                      <b>Gebruikte parts:</b>{" "}
                      {result.used_parts || "—"}
                    </div>

                    <div>
                      <b>Batterij status:</b>{" "}
                      {result.battery_status || "—"}
                    </div>

                    <div>
                      <b>Aankoopdatum:</b>{" "}
                      {result.purchase_date || "—"}
                    </div>

                    <div>
                      <b>Leverancier:</b>{" "}
                      {result.supplier || "—"}
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                    {result.link && (
                      <Link
                        href={result.link}
                        className="inline-block text-blue-600 underline"
                      >
                        Open
                      </Link>
                    )}
                    {result.labelItemId&&<RefurbLabelPrintButton itemId={result.labelItemId}/>}
                    {result.labelLeadId&&permits(user,'leads','read')&&<LeadLabelPrintButton leadId={result.labelLeadId}/>}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </details>
      <details id="reception-overview" className="reception-panel">
        <summary className="reception-panel-heading"><strong>Overzicht</strong><span className="reception-chevron" aria-hidden="true">›</span></summary>
        <div className="reception-panel-body"><div className="rma-stats reception-overview-stats">{[{name:'Openstaande recepties',value:receptions.length-completedCount},{name:'Te verwerken artikelen',value:openItems},{name:'Openstaande aankoopwaarde',value:openMoney},{name:'Artikelen in overzicht',value:visibleReceptions.reduce((sum,row)=>sum+(row.total_items??0),0)},{name:'Garantie vervalt binnen 7 dagen',value:expiringItems}].map(row=><div className="rma-stat" key={row.name}><div className="rma-stat-title">{row.name}</div><div className="rma-stat-value">{row.value}</div></div>)}</div>{overviewUnavailable?<p role="alert">Openstaande bedragen en modellen konden niet volledig geladen worden. Vernieuw de pagina.</p>:<><p className="reception-open-note">Aankoopwaarde van alle openstaande artikelen.{openOverview.missingPrices>0?` Voor ${openOverview.missingPrices} artikelen ontbreekt de aankoopprijs.`:''}</p><OpenReceptionModels rows={openOverview.groups}/></>}</div>
      </details>
      </div>
      <section className="rma-section"><div className="reception-deliveries-header"><h2>Leveringen</h2><div className="reception-deliveries-actions">
        <ReceptionQuickSearch receptions={receptions.map(row=>({id:row.id,number:row.reception_number,supplier:row.supplier,date:row.reception_date,completed:!!row.total_items&&row.finished_items_count===row.total_items}))}/>
        <Link
          href={toggleHref}
          prefetch={false}
          role="switch"
          aria-checked={showCompleted}
          aria-label="Afgewerkte recepties tonen"
          className="bb-btn text-sm"
        >
          {showCompleted ? "Verberg afgewerkte recepties" : "Toon afgewerkte recepties"}
        </Link>
      </div></div><div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-2 py-1 text-left">
              Receptie nr
            </th>

            <th className="px-2 py-1 text-left">
              Datum
            </th>

            <th className="px-2 py-1 text-left">
              Leverancier
            </th>

            <th className="px-2 py-1 text-left">
              BTW regeling
            </th>

            <th className="px-2 py-1 text-left">
              Supplier invoice
            </th>

            <th className="px-2 py-1 text-left">
              Intern factuur nr
            </th>

            <th className="px-2 py-1 text-left">RMA-termijn</th>
            {isAdmin && (
              <th className="px-2 py-1 text-left">
                Acties
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {visibleReceptions.map((reception) => {
            const totalItems =
              reception.total_items || 0;

            const finishedItems =
              reception.finished_items_count || 0;

            return (
              <tr
                key={reception.id}
                className="border-b hover:bg-slate-50"
              >
                <td className="px-2 py-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/refurb/${reception.id}`}
                      prefetch={false}
                      className="text-blue-600 underline"
                    >
                      {reception.reception_number}
                    </Link>

                    {(reception.open_status_counts || []).map((badge) => (
                      <Link
                        key={badge.value}
                        href={`/admin/refurb/${reception.id}?status=${encodeURIComponent(badge.value)}#reception-items`}
                        prefetch={false}
                        aria-label={`${badge.label}: ${badge.count} artikelen. Open gefilterde receptie`}
                        title={`${badge.label}: ${badge.count}`}
                        className="inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 text-[11px] font-bold text-slate-800 hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                      >
                        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: badge.color }} />
                        {badge.count}
                      </Link>
                    ))}
                  </div>

                  <div className="reception-progress" aria-hidden="true"><span style={{width:(reception.finished_percent??0)+'%'}}/></div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">
                      {reception.finished_percent ?? 0}%
                    </span>{" "}
                    afgewerkt, {Math.max(0, totalItems - finishedItems)} van {totalItems} {totalItems === 1 ? "artikel" : "artikels"} open
                  </div>
                </td>

                <td className="px-2 py-1">
                  {reception.reception_date}
                </td>

                <td className="px-2 py-1">
                  {reception.supplier}
                </td>

                <td className="px-2 py-1">
                  {reception.vat_scheme ===
                  "margin"
                    ? "Margin VAT"
                    : "Normal VAT"}
                </td>

                <td className="px-2 py-1">
                  {reception.supplier_invoice_nr}
                </td>

                <td className="px-2 py-1">
                  {permits(user,'refurb','write')?<form action={updateReceptionMetadata} className="reception-inline-meta"><input type="hidden" name="list" value="1"/><input type="hidden" name="show_completed" value={showCompleted?'1':'0'}/><input type="hidden" name="reception_id" value={reception.id}/><input type="hidden" name="updated_at" value={reception.updated_at}/><input name="internal_invoice_nr" aria-label={'Intern factuurnummer '+reception.reception_number} defaultValue={reception.internal_invoice_nr||''} maxLength={250}/><button className="bb-btn" aria-label={'Factuurnummer opslaan '+reception.reception_number}>Opslaan</button></form>:reception.internal_invoice_nr||'—'}
                </td>

                <td className="px-2 py-1"><strong>{receptionRmaDays(reception.rma_expiry_days,reception.reception_date,reception.rma_expiry_date)} dagen</strong><span className="block text-xs text-slate-500">{reception.rma_expiry_date||'Nog geen vervaldatum'}</span></td>
                {isAdmin && (
                  <td className="px-2 py-1">
                    <details className="inline-block">
                      <summary className="cursor-pointer text-red-600 hover:underline select-none">
                        Verwijderen
                      </summary>

                      <div className="mt-2 p-2 border rounded-md bg-white text-xs space-y-2">
                        <div className="text-slate-700">
                          Ben je zeker dat je
                          receptie{" "}
                          <span className="font-semibold">
                            {
                              reception.reception_number
                            }
                          </span>{" "}
                          definitief wil verwijderen?

                          <div className="text-[11px] text-slate-500">
                            Dit verwijdert ook alle
                            rijen/items.
                          </div>
                        </div>

                        <form
                          action={
                            deleteRefurbReceptionAction
                          }
                          className="flex items-center gap-2"
                        >
                          <input
                            type="hidden"
                            name="reception_id"
                            value={reception.id}
                          />

                          <button
                            type="submit"
                            className="bb-btn text-[11px] px-2 h-7"
                          >
                            Ja, definitief
                            verwijderen
                          </button>
                        </form>
                      </div>
                    </details>
                  </td>
                )}
              </tr>
            );
          })}

          {visibleReceptions.length === 0 && (
            <tr>
              <td
                colSpan={isAdmin ? 8 : 7}
                className="px-4 py-8 text-center text-sm text-slate-500"
              >
                {!showCompleted && completedCount > 0
                  ? "Geen openstaande recepties. Toon de afgewerkte recepties om ze te bekijken."
                  : "Geen recepties gevonden."}
              </td>
            </tr>
          )}
        </tbody>
      </table></div></section>
    </div>
  );
}

