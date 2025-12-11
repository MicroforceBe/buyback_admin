// app/admin/refurb/modelsActions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";

export type RefurbModelRow = {
  id: string;
  name: string;
  search_keywords: string;
};

export async function getRefurbModelRows(): Promise<RefurbModelRow[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_models")
    .select("id, name, search_keywords")
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("[REFURB] getRefurbModelRows error", error);
    return [];
  }

  return data as RefurbModelRow[];
}

export async function saveRefurbModelRow(formData: FormData) {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    throw new Error("Geen rechten om refurb modellen te beheren.");
  }

  const id = (formData.get("id") || "").toString().trim() || null;
  const name = (formData.get("name") || "").toString().trim();
  const search_keywords = (formData.get("search_keywords") || "")
    .toString()
    .trim();

  if (!name) {
    throw new Error("Modelnaam is verplicht.");
  }

  const payload = {
    name,
    search_keywords,
    updated_at: new Date().toISOString(),
  } as any;

  if (!id) {
    payload.created_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin.from("refurb_models").upsert(
    {
      id: id || undefined,
      ...payload,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("[REFURB] saveRefurbModelRow error", error);
    throw error;
  }

  revalidatePath("/admin/refurb/models");
}

export async function deleteRefurbModelRow(formData: FormData) {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    throw new Error("Geen rechten om refurb modellen te beheren.");
  }

  const id = (formData.get("id") || "").toString().trim();
  if (!id) return;

  const { error } = await supabaseAdmin
    .from("refurb_models")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[REFURB] deleteRefurbModelRow error", error);
    throw error;
  }

  revalidatePath("/admin/refurb/models");
}
