// app/admin/login/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loginAction(formData: FormData) {
  "use server";

  const rawEmail = (formData.get("email") as string | null) ?? "";
  const email = rawEmail.trim().toLowerCase();

  if (!email) {
    redirect("/admin/login?msg=" + encodeURIComponent("email_required"));
  }

  const { data, error } = await supabaseAdmin
    .from("buyback_admin_users")
    .select("email, role")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    console.warn("[ADMIN_LOGIN] invalid email:", email, error?.message);
    redirect("/admin/login?msg=" + encodeURIComponent("unknown_user"));
  }

  const cookieStore = cookies();
  cookieStore.set("bb_admin_email", email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8u sessie
  });

  redirect("/admin");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { msg?: string };
}) {
  const msg = searchParams?.msg;

  let errorText: string | null = null;
  if (msg === "email_required") {
    errorText = "Gelieve een e-mailadres in te geven.";
  } else if (msg === "unknown_user") {
    errorText = "Onbekende gebruiker of geen toegang.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Buyback admin login</h1>
          <Link href="/" className="text-xs text-gray-500 underline">
            ← Terug naar site
          </Link>
        </div>

        <p className="text-sm text-gray-600">
          Log in met je zakelijk e-mailadres om toegang te krijgen tot de
          buyback admin.
        </p>

        {errorText && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {errorText}
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">E-mailadres</span>
            <input
              type="email"
              name="email"
              required
              className="bb-input h-9 text-sm px-2"
              placeholder="jij@bedrijf.be"
            />
          </label>

          <button
            type="submit"
            className="bb-btn primary h-9 w-full text-sm font-medium"
          >
            Inloggen
          </button>
        </form>

        <p className="text-[11px] text-gray-400">
          Toegang wordt beheerd via de tabel{" "}
          <code>buyback_admin_users</code>. Voeg daar je e-mailadres toe als{" "}
          <code>admin</code> om toegang te krijgen.
        </p>
      </div>
    </div>
  );
}
