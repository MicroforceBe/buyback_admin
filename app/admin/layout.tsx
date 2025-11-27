// app/admin/layout.tsx
import type { ReactNode } from "react";
import Nav from "./Nav";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import UserBadge from "./UserBadge";
import IdleLogout from "./IdleLogout";
import LogoutButton from "./LogoutButton";

export const metadata = {
  title: "Buyback Admin",
  description: "Beheer",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentAdminUser();

  // ⬇️ NIET ingelogd → géén sidebar/topbar, gewoon de page zelf (login)
  if (!currentUser) {
    return <>{children}</>;
  }

  // ⬇️ WÉL ingelogd → normale admin layout
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[260px,1fr] bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside className="border-r border-gray-200 bg-gray-100">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold">Buyback Admin</h1>
          <p className="text-xs text-gray-500">Beheerpanelen</p>
        </div>
        <Nav />
      </aside>

      {/* Main content */}
      <main className="p-4 md:p-6">
        {/* Automatische logout na inactiviteit, bv. 15 minuten */}
        <IdleLogout timeoutMs={15 * 60 * 1000} />

        {/* Topbar in main met user-badge en afmelden-knop rechtsboven */}
        <div className="mb-4 flex items-center justify-between">
          {/* Optioneel: titel voor mobile weergave */}
          <div className="md:hidden">
            <h2 className="text-base font-semibold">Buyback Admin</h2>
            <p className="text-xs text-gray-500">Beheerpanelen</p>
          </div>

          <div className="flex items-center gap-3">
            <UserBadge user={currentUser} />
            <LogoutButton />
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

2.


// app/admin/login/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loginAction(formData: FormData) {
  "use server";

  const rawEmail = (formData.get("email") as string | null) ?? "";
  const email = rawEmail.trim().toLowerCase();
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    redirect("/admin/login?msg=" + encodeURIComponent("missing_credentials"));
  }

  const { data: user, error } = await supabaseAdmin
    .from("buyback_admin_users")
    .select("email, role, permissions, password_hash, is_active")
    .eq("email", email)
    .maybeSingle();

  // Altijd zelfde foutmelding teruggeven → geen user enumeration
  const invalidRedirect = () =>
    redirect("/admin/login?msg=" + encodeURIComponent("invalid_login"));

  if (error || !user) {
    return invalidRedirect();
  }

  if (user.is_active === false) {
    return invalidRedirect();
  }

  const hash = (user as any).password_hash as string | null;
  if (!hash) {
    return invalidRedirect();
  }

  const ok = await bcrypt.compare(password, hash);
  if (!ok) {
    return invalidRedirect();
  }

  // Login OK → sessie aanmaken
  const sessionToken = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 8); // 8u

  const hdrs = headers();
  const ip =
    hdrs.get("x-forwarded-for") ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const ua = hdrs.get("user-agent") || "unknown";

  const { error: sessErr } = await supabaseAdmin
    .from("buyback_admin_sessions")
    .insert({
      session_token: sessionToken,
      user_email: user.email,
      expires_at: expires.toISOString(),
      ip,
      user_agent: ua,
    });

  if (sessErr) {
    console.error("[ADMIN_LOGIN] session insert failed:", sessErr.message);
    return invalidRedirect();
  }

  const cookieStore = cookies();
  cookieStore.set("bb_admin_session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 8,
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
  if (msg === "missing_credentials") {
    errorText = "Gelieve gebruiker en wachtwoord in te geven.";
  } else if (msg === "invalid_login") {
    errorText = "Ongeldige login of account niet actief.";
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
          Log in met je beheerdersaccount om toegang te krijgen tot de buyback admin.
        </p>

        {errorText && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {errorText}
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Gebruiker</span>
            <input
              type="text"
              name="email"
              required
              className="bb-input h-9 text-sm px-2"
              placeholder="gebruikersnaam"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Wachtwoord</span>
            <input
              type="password"
              name="password"
              required
              className="bb-input h-9 text-sm px-2"
              placeholder="••••••••"
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
          Beheer accounts via de tabel <code>buyback_admin_users</code>.
        </p>
      </div>
    </div>
  );
}
