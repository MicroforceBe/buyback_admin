// app/admin/diagnostics/new/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

async function createDiagnosticSession(formData: FormData) {
  "use server";

  const imei = String(formData.get("imei") || "").trim();
  const serialNumber = String(formData.get("serialNumber") || "").trim();
  const brand = String(formData.get("brand") || "Apple").trim();
  const model = String(formData.get("model") || "").trim();
  const storage = String(formData.get("storage") || "").trim();
  const color = String(formData.get("color") || "").trim();
  const batteryHealthValue = String(formData.get("batteryHealth") || "").trim();

  const batteryHealth = batteryHealthValue
    ? Number(batteryHealthValue)
    : null;

  const deviceUnit = await prisma.deviceUnit.create({
    data: {
      imei: imei || null,
      serialNumber: serialNumber || null,
      brand,
      model: model || null,
      storage: storage || null,
      color: color || null,
      batteryHealth,
    },
  });

  const session = await prisma.diagnosticSession.create({
    data: {
      deviceUnitId: deviceUnit.id,
      status: "draft",
    },
  });

  redirect(`/admin/diagnostics/${session.id}`);
}

export default function NewDiagnosticPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Nieuwe diagnostic sessie</h1>

      <form action={createDiagnosticSession} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">IMEI</label>
          <input name="imei" className="mt-1 w-full rounded border p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium">Serienummer</label>
          <input name="serialNumber" className="mt-1 w-full rounded border p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium">Merk</label>
          <input name="brand" defaultValue="Apple" className="mt-1 w-full rounded border p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium">Model</label>
          <input name="model" placeholder="iPhone 14 Pro" className="mt-1 w-full rounded border p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium">Opslag</label>
          <input name="storage" placeholder="128GB" className="mt-1 w-full rounded border p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium">Kleur</label>
          <input name="color" placeholder="Space Black" className="mt-1 w-full rounded border p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium">Batterijconditie (%)</label>
          <input name="batteryHealth" type="number" min="0" max="100" className="mt-1 w-full rounded border p-2" />
        </div>

        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Sessie starten
        </button>
      </form>
    </div>
  );
}
