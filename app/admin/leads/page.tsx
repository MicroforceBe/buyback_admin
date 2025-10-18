import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLeadInlineAction, deleteLeadAction } from "./actions";
import { InlineSaveButton } from "./InlineSave";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
  order_code: string;
  created_at: string | null;

  model: string | null;
  capacity_gb: number | null;
  base_price_cents: number | null;
  final_price_cents: number | null;

  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  delivery_method: "ship" | "dropoff" | null;
  shop_location: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;

  iban: string | null;

  status:
    | "new"
    | "received_store"
    | "label_created"
    | "shipment_received"
    | "check_passed"
    | "check_failed"
    | "done"
    | string
    | null;

  admin_note: string | null;
  updated_at: string | null;
