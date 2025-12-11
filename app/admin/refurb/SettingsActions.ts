// app/admin/refurb/settingsActions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RefurbStatusOption = {
  id: string;
  value: string;
  label: string;
  is_default: boolean;
  sort_order: number;
};

export type RefurbLocationOption = {
  id: string;
  value: string;
  label: string;
  is_default: boolean;
  sort_order: number;
};

export async function getRefurbStatusOptions(): Promise<RefurbStatusOption[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_status_options")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("[REFURB] getRefurbStatusOptions error", error);
    return [];
  }

  return data as RefurbStatusOption[];
}

export async function getRefurbLocationOptions(): Promise<RefurbLocationOption[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_location_options")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("[REFURB] getRefurbLocationOptions error", error);
    return [];
  }

  return data as RefurbLocationOption[];
}

// STATUS opslaan/verwijderen + default

export async function saveRefurbStatusRow(formData: FormData) {
  const id = formData.get("id") as string | null;
  const value = (formData.get("value") as string | null)?.trim() ?? "";
  const label = (formData.get("label") as string | null)?.trim() ?? "";
  const sortOrderRaw = formData.get("sort_order") as string | null;
  const sort_order = sortOrderRaw ? Number(sortOrderRaw) : 0;

  if (!value || !label) {
    throw new Error("Value en label zijn verplicht.");
  }

  const { data, error } = await supabaseAdmin
    .from("refurb_status_options")
    .upsert(
      {
        id: id || undefined,
        value,
        label,
        sort_order,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[REFURB] saveRefurbStatusRow error", error);
    throw error;
  }

  return data;
}

export async function deleteRefurbStatusRow(id: string) {
  const { error } = await supabaseAdmin
    .from("refurb_status_options")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[REFURB] deleteRefurbStatusRow error", error);
    throw error;
  }
}

export async function setDefaultRefurbStatus(id: string) {
  await supabaseAdmin
    .from("refurb_status_options")
    .update({ is_default: false })
    .eq("is_default", true);

  const { error } = await supabaseAdmin
    .from("refurb_status_options")
    .update({ is_default: true })
    .eq("id", id);

  if (error) {
    console.error("[REFURB] setDefaultRefurbStatus error", error);
    throw error;
  }
}

// LOCATION opslaan/verwijderen + default

export async function saveRefurbLocationRow(formData: FormData) {
  const id = formData.get("id") as string | null;
  const value = (formData.get("value") as string | null)?.trim() ?? "";
  const label = (formData.get("label") as string | null)?.trim() ?? "";
  const sortOrderRaw = formData.get("sort_order") as string | null;
  const sort_order = sortOrderRaw ? Number(sortOrderRaw) : 0;

  if (!value || !label) {
    throw new Error("Value en label zijn verplicht.");
  }

  const { data, error } = await supabaseAdmin
    .from("refurb_location_options")
    .upsert(
      {
        id: id || undefined,
        value,
        label,
        sort_order,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[REFURB] saveRefurbLocationRow error", error);
    throw error;
  }

  return data;
}

export async function deleteRefurbLocationRow(id: string) {
  const { error } = await supabaseAdmin
    .from("refurb_location_options")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[REFURB] deleteRefurbLocationRow error", error);
    throw error;
  }
}

export async function setDefaultRefurbLocation(id: string) {
  await supabaseAdmin
    .from("refurb_location_options")
    .update({ is_default: false })
    .eq("is_default", true);

  const { error } = await supabaseAdmin
    .from("refurb_location_options")
    .update({ is_default: true })
    .eq("id", id);

  if (error) {
    console.error("[REFURB] setDefaultRefurbLocation error", error);
    throw error;
  }
}
