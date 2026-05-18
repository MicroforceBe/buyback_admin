// app/api/device-intake/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const imei = body.imei || null;
    const serialNumber = body.serialNumber || null;

    if (!imei && !serialNumber) {
      return NextResponse.json(
        { ok: false, error: "IMEI of serienummer verplicht" },
        { status: 400 }
      );
    }

    const existingDevice = await prisma.deviceUnit.findFirst({
      where: {
        OR: [
          imei ? { imei } : undefined,
          serialNumber ? { serialNumber } : undefined,
        ].filter(Boolean) as any,
      },
      include: {
        sessions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const securityGrade =
      typeof body.securityGrade === "object"
        ? body.securityGrade.grade
        : body.securityGrade || null;

    const securityWarnings =
      typeof body.securityGrade === "object"
        ? body.securityGrade.warnings || []
        : [];

    const securityFailures =
      typeof body.securityGrade === "object"
        ? body.securityGrade.failures || []
        : [];

    const deviceData = {
      imei,
      imei2: body.imei2 || null,
      serialNumber,

      brand: body.brand || "Apple",
      model: body.model || null,
      storage: body.storage || null,
      color: body.color || null,

      productType: body.productType || null,
      productName: body.productName || null,
      modelNumber: body.modelNumber || null,
      partNumber: body.partNumber || null,
      regionInfo: body.regionInfo || null,
      iosVersion: body.iosVersion || body.productVersion || null,
      udid: body.udid || body.uniqueDeviceId || null,

      batteryHealth: body.batteryHealth ?? null,
      batteryCycles: body.batteryCycles ?? body.batteryCycleCount ?? null,
      batteryCurrentCharge: body.batteryCurrentCharge ?? null,
      batteryDesignCapacity: body.batteryDesignCapacity ?? null,
      batteryNominalChargeCapacity:
        body.batteryNominalChargeCapacity ?? null,
      batteryVoltage: body.batteryVoltage
        ? String(body.batteryVoltage)
        : null,
      batteryTemperatureCelsius: body.batteryTemperatureCelsius
        ? String(body.batteryTemperatureCelsius)
        : null,

      activationState: body.activationState || null,
      activationLockStatus: body.activationLockStatus || null,
      findMyStatus: body.findMyStatus || null,

      simStatus: body.simStatus || null,
      simLockStatus: body.simLockStatus || null,
      carrierLockStatus: body.carrierLockStatus || null,
      carrierName: body.carrierName || null,

      mdmStatus: body.mdmStatus || null,
      mdmEvidence: body.mdmEvidence || [],

      blacklistStatus: body.blacklistStatus || null,

      securityGrade,
      securityWarnings,
      securityFailures,

      rawDeviceData: body.rawDeviceData || body.raw || body,
    };

    const deviceUnit = existingDevice
      ? await prisma.deviceUnit.update({
          where: { id: existingDevice.id },
          data: deviceData,
        })
      : await prisma.deviceUnit.create({
          data: deviceData,
        });

    const session = await prisma.diagnosticSession.create({
      data: {
        deviceUnitId: deviceUnit.id,
        status: "draft",
      },
    });

    return NextResponse.json({
      ok: true,
      duplicateDetected: Boolean(existingDevice),
      previousSessions: existingDevice?.sessions.length || 0,
      previousGrades:
        existingDevice?.sessions
          .map((item) => item.finalGrade)
          .filter(Boolean) || [],
      deviceUnitId: deviceUnit.id,
      sessionId: session.id,
      redirectUrl: `/admin/diagnostics/${session.id}`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "Device intake mislukt",
      },
      {
        status: 500,
      }
    );
  }
}
