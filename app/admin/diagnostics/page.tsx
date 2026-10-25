import { requirePageAccess } from '@/lib/security/access';
// app/admin/diagnostics/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { diagnosticReport } from '@/lib/diagnostics';

export default async function DiagnosticsPage() {
  await requirePageAccess('refurb', false);

  const sessions = await prisma.diagnosticSession.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      deviceUnit: true,
      tests: {where:{testKey:'usb:intake'},orderBy:[{createdAt:'desc'},{id:'desc'}],take:1},
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Diagnostics
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Overzicht van toestel-diagnoses en testresultaten.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/diagnostics/live"
            className="rounded bg-blue-600 px-4 py-2 text-white"
          >
            Live diagnose
          </Link>

          <Link
            href="/admin/diagnostics/new"
            className="rounded bg-black px-4 py-2 text-white"
          >
            Nieuwe sessie
          </Link>

          <Link
            href="/admin/diagnostics/stations"
            className="rounded border px-4 py-2"
          >
            Stations
          </Link>

          <Link
            href="/admin/diagnostics/sessions"
            className="rounded border px-4 py-2"
          >
            Cloud sessies
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {sessions.map((session) => {const report=diagnosticReport(session.tests,session.deviceUnit.batteryHealth);return (
          <div
            key={session.id}
            className="rounded-lg border bg-white p-4"
          >
            <div className="font-semibold">
              <Link className="underline" href={'/admin/diagnostics/'+session.id}>{session.deviceUnit.brand}{" "}
              {session.deviceUnit.model}</Link>
            </div>

            <div className="text-sm text-gray-500">
              IMEI: {session.deviceUnit.imei || "—"}
            </div>

            <div className="text-sm">
              Grade: {session.finalGrade || "—"}
            </div>

            <div className="text-sm">
              Battery:{" "}
              {report.batteryHealth==null?'—':report.batteryHealth+'%'}
              {report.intake?.batterySource==='calculated'?<span className="ml-2 text-xs text-amber-800">Berekend via USB · kan afwijken van iOS</span>:null}
            </div>
          </div>
        );})}

        {sessions.length === 0 && (
          <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-500">
            Geen diagnostics sessies gevonden.
          </div>
        )}
      </div>
    </div>
  );
}



