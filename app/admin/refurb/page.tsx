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
  total_items?: number;
  ready_to_book_count?: number;
  waiting_for_sku_count?: number;
  finished_items_count?: number;
  finished_percent?: number;
};

type ReceptionItemStatsRow = {
  id: string;
  reception_id: string;
  refurb_status: string | null;
};

type RefurbStatusOptionRow = {
  id: string;
  value: string;
  label: string | null;
};

type RefurbStatusTransitionRow = {
  from_status_id: string;
  to_status_id: string;
};

type SearchResult = {
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

/**
 * Oude fallback wanneer er nog geen transitions ingesteld zijn.
 * Zodra er transitions bestaan, wordt een status als afgewerkt beschouwd
 * wanneer die status geen uitgaande transition meer heeft.
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
}> {
  const [statusResult, transitionResult] = await Promise.all([
    supabaseAdmin
      .from("refurb_status_options")
      .select("id, value, label"),

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
      .map((transition) => String(transition.from_status_id || "").trim())
      .filter(Boolean)
  );

  const finalStatusValues = new Set<string>();
  const canonicalStatusByInput = new Map<string, string>();

  for (const option of statusOptions) {
    const optionId = String(option.id || "").trim();
    const value = String(option.value || "").trim();
    const label = String(option.label || "").trim();

    if (!value) continue;

    const normalizedValue = normalizeStatus(value);

    canonicalStatusByInput.set(normalizedValue, normalizedValue);

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
      internal_invoice_nr
      `
    )
    .order("reception_date", { ascending: false });

  if (error) {
    console.error("[REFURB] error fetching receptions", error);
    return [];
  }

  const receptions = (data || []) as RefurbReception[];
  const receptionIds = receptions.map((reception) => reception.id);

  if (!receptionIds.length) {
    return receptions.map((reception) => ({
      ...reception,
      total_items: 0,
      ready_to_book_count: 0,
      waiting_for_sku_count: 0,
      finished_items_count: 0,
      finished_percent: 0,
    }));
  }

  const [itemsResult, statusConfig] = await Promise.all([
    supabaseAdmin
      .from("refurb_reception_items")
      .select("id, reception_id, refurb_status")
      .in("reception_id", receptionIds),

    getFinalStatusValues(),
  ]);

  if (itemsResult.error) {
    console.error(
      "[REFURB] error fetching reception items for statistics",
      itemsResult.error
    );

    return receptions.map((reception) => ({
      ...reception,
      total_items: 0,
      ready_to_book_count: 0,
      waiting_for_sku_count: 0,
      finished_items_count: 0,
      finished_percent: 0,
    }));
  }

  const items =
    (itemsResult.data || []) as ReceptionItemStatsRow[];

  const stats = new Map<
    string,
    {
      total: number;
      readyToBook: number;
      waitingForSku: number;
      finished: number;
    }
  >();

  for (const receptionId of receptionIds) {
    stats.set(receptionId, {
      total: 0,
      readyToBook: 0,
      waitingForSku: 0,
      finished: 0,
    });
  }

  for (const item of items) {
    const receptionId = String(item.reception_id || "").trim();

    if (!receptionId) continue;

    const currentStats =
      stats.get(receptionId) || {
        total: 0,
        readyToBook: 0,
        waitingForSku: 0,
        finished: 0,
      };

    /*
     * Eén rij in refurb_reception_items = één individueel artikel/toestel.
     */
    currentStats.total += 1;

    const rawStatus = normalizeStatus(item.refurb_status);

    const canonicalStatus =
      statusConfig.canonicalStatusByInput.get(rawStatus) || rawStatus;

    if (isReadyToBookStatus(canonicalStatus)) {
      currentStats.readyToBook += 1;
    }

    if (isWaitingForSkuStatus(canonicalStatus)) {
      currentStats.waitingForSku += 1;
    }

    const isFinished = statusConfig.hasConfiguredTransitions
      ? statusConfig.finalStatusValues.has(canonicalStatus)
      : isFallbackFinishedStatus(canonicalStatus);

    if (isFinished) {
      currentStats.finished += 1;
    }

    stats.set(receptionId, currentStats);
  }

  return receptions.map((reception) => {
    const receptionStats =
      stats.get(reception.id) || {
        total: 0,
        readyToBook: 0,
        waitingForSku: 0,
        finished: 0,
      };

    const totalItems = receptionStats.total;
    const finishedItems = receptionStats.finished;

    const finishedPercent =
      totalItems > 0
        ? Math.round((finishedItems / totalItems) * 100)
        : 0;

    return {
      ...reception,
      total_items: totalItems,
      ready_to_book_count: receptionStats.readyToBook,
      waiting_for_sku_count: receptionStats.waitingForSku,
      finished_items_count: finishedItems,
      finished_percent: finishedPercent,
    };
  });
}

async function searchRefurbDevice(
  query: string
): Promise<SearchResult[]> {
  const q = query.trim();

  if (!q) return [];

  const results: SearchResult[] = [];

  const { data: receptionItems, error: receptionItemsError } =
    await supabaseAdmin
      .from("refurb_reception_items")
      .select(`
        id,
        reception_id,
        sku,
        description,
        used_parts,
        imei_sn,
        manual_sn,
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
      reference_number: reception?.reception_number || null,
      sku: (item as any).sku || null,
      description: (item as any).description || null,
      used_parts: (item as any).used_parts || null,
      battery_status: null,
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

  const { data: leads, error: leadsError } = await supabaseAdmin
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
    console.error("[REFURB] search leads error", leadsError);
  }

  for (const lead of leads || []) {
    const firstName = (lead as any).first_name || "";
    const lastName = (lead as any).last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();

    results.push({
      source: "Lead",
      reference_number: (lead as any).order_code || null,
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
      purchase_date: formatDate((lead as any).created_at),
      supplier:
        [(lead as any).customer_number, fullName]
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

  const user = await getCurrentAdminUser();

  if (!user || (user as any).role !== "admin") {
    redirect("/admin/refurb?msg=forbidden:not_admin");
  }

  const receptionId = String(
    formData.get("reception_id") || ""
  ).trim();

  if (!receptionId) {
    redirect("/admin/refurb?msg=missing_reception_id");
  }

  const { error: delItemsErr } = await supabaseAdmin
    .from("refurb_reception_items")
    .delete()
    .eq("reception_id", receptionId);

  if (delItemsErr) {
    redirect(
      `/admin/refurb?msg=delete_items_error:${encodeURIComponent(
        delItemsErr.message
      )}`
    );
  }

  const { error: delRecErr } = await supabaseAdmin
    .from("refurb_receptions")
    .delete()
    .eq("id", receptionId);

  if (delRecErr) {
    redirect(
      `/admin/refurb?msg=delete_reception_error:${encodeURIComponent(
        delRecErr.message
      )}`
    );
  }

  revalidatePath("/admin/refurb");

  redirect("/admin/refurb?msg=deleted_reception");
}

export default async function RefurbListPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
  };
}) {
  const q = String(searchParams?.q || "").trim();

  const [receptions, searchResults, user] =
    await Promise.all([
      getReceptions(),
      searchRefurbDevice(q),
      getCurrentAdminUser(),
    ]);

  const isAdmin =
    !!user && (user as any).role === "admin";

  return (
    <div className="space-y-4">
      <details
        className="rounded-md border bg-white"
        open={!!q}
      >
        <summary className="cursor-pointer select-none px-4 py-3 font-medium">
          Refurb tools
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
                <span className="font-medium">{q}</span>
              </div>

              {searchResults.length === 0 && (
                <div className="rounded-md border p-4 text-sm text-slate-500">
                  Geen resultaat gevonden.
                </div>
              )}

              {searchResults.map((result, index) => (
                <div
                  key={`${result.source}-${index}`}
                  className="rounded-md border p-4 text-sm space-y-1"
                >
                  <div>
                    <b>Bron:</b>{" "}
                    {result.source === "Lead"
                      ? `Lead ${
                          result.reference_number || "—"
                        }`
                      : `Receptie ${
                          result.reference_number || "—"
                        }`}
                  </div>

                  <div>
                    <b>SKU:</b> {result.sku || "—"}
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

                  {result.link && (
                    <Link
                      href={result.link}
                      className="inline-block pt-2 text-blue-600 underline"
                    >
                      Open
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Refurb</h1>

          <p className="text-sm text-slate-500">
            Binnenkomende refurb toestellen verwerken per
            receptie
          </p>
        </div>

        <Link
          href="/admin/refurb/new"
          className="bb-btn bb-btn-primary text-sm"
        >
          Nieuwe receptie
        </Link>
      </div>

      <table className="w-full text-sm border-collapse">
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

            {isAdmin && (
              <th className="px-2 py-1 text-left">
                Acties
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {receptions.map((reception) => {
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
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/refurb/${reception.id}`}
                      className="text-blue-600 underline"
                    >
                      {reception.reception_number}
                    </Link>

                    {(reception.ready_to_book_count ??
                      0) > 0 && (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold leading-none text-white"
                        title={`${reception.ready_to_book_count} ready to book`}
                      >
                        {reception.ready_to_book_count}
                      </span>
                    )}

                    {(reception.waiting_for_sku_count ??
                      0) > 0 && (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1.5 text-[11px] font-bold leading-none text-white"
                        title={`${reception.waiting_for_sku_count} waiting for sku`}
                      >
                        {reception.waiting_for_sku_count}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">
                      {reception.finished_percent ?? 0}%
                    </span>{" "}
                    afgewerkt
                    <span className="mx-1">•</span>
                    {finishedItems} van {totalItems} afgewerkt
                    <span className="mx-1">•</span>
                    {totalItems}{" "}
                    {totalItems === 1
                      ? "artikel"
                      : "artikels"}
                  </div>
                </td>

                <td className="px-2 py-1">
                  {reception.reception_date}
                </td>

                <td className="px-2 py-1">
                  {reception.supplier}
                </td>

                <td className="px-2 py-1">
                  {reception.vat_scheme === "margin"
                    ? "Margin VAT"
                    : "Normal VAT"}
                </td>

                <td className="px-2 py-1">
                  {reception.supplier_invoice_nr}
                </td>

                <td className="px-2 py-1">
                  {reception.internal_invoice_nr || "—"}
                </td>

                {isAdmin && (
                  <td className="px-2 py-1">
                    <details className="inline-block">
                      <summary className="cursor-pointer text-red-600 hover:underline select-none">
                        Verwijderen
                      </summary>

                      <div className="mt-2 p-2 border rounded-md bg-white text-xs space-y-2">
                        <div className="text-slate-700">
                          Ben je zeker dat je receptie{" "}
                          <span className="font-semibold">
                            {reception.reception_number}
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
                            Ja, definitief verwijderen
                          </button>
                        </form>
                      </div>
                    </details>
                  </td>
                )}
              </tr>
            );
          })}

          {receptions.length === 0 && (
            <tr>
              <td
                colSpan={isAdmin ? 7 : 6}
                className="px-4 py-8 text-center text-sm text-slate-500"
              >
                Geen recepties gevonden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```
