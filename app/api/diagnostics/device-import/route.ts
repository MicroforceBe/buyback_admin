//app/api/diagnostics/device-import/route.ts 

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const imei = toNullableString(body.imei);
    const serialNumber = toNullableString(body.serialNumber);
    const udid = toNullableString(body.udid);
    const brand = toNullableString(body.brand) || "Apple";

    let existingDevice = null;

    if (imei) {
      existingDevice = await prisma.deviceUnit.findUnique({
        where: { imei },
        include: {
          sessions: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }

    const data = {
      imei,
      imei2: toNullableString(body.imei2),
      serialNumber,
      udid,

      brand,
      model: toNullableString(body.model),
      storage: toNullableString(body.storage),
      color: toNullableString(body.color),

      iosVersion: toNullableString(body.iosVersion),
      productType: toNullableString(body.productType),
      modelNumber: toNullableString(body.modelNumber),
      partNumber: toNullableString(body.partNumber),
      regionInfo: toNullableString(body.regionInfo),
      originCountry: toNullableString(body.originCountry),

      batteryHealth: toNullableNumber(body.batteryHealth),
      batteryCycles: toNullableNumber(body.batteryCycles),
      batteryCurrentCharge: toNullableNumber(body.batteryCurrentCharge),
      batteryDesignCapacity: toNullableNumber(body.batteryDesignCapacity),
      batteryNominalChargeCapacity: toNullableNumber(
        body.batteryNominalChargeCapacity
      ),
      batteryVoltage: toNullableNumber(body.batteryVoltage),
      batteryTemperatureCelsius: toNullableNumber(
        body.batteryTemperatureCelsius
      ),

      activationState: toNullableString(body.activationState),
      activationLockStatus: toNullableString(body.activationLockStatus),
      findMyStatus: toNullableString(body.findMyStatus),

      mdmStatus: toNullableString(body.mdmStatus),
      carrierLockStatus: toNullableString(body.carrierLockStatus),
      simLockStatus: toNullableString(body.simLockStatus),
      simStatus: toNullableString(body.simStatus),
      carrierName: toNullableString(body.carrierName),
      blacklistStatus: toNullableString(body.blacklistStatus),

      securityGrade: toNullableString(body.securityGrade?.grade),
      securityWarnings: body.securityGrade?.warnings || [],
      securityFailures: body.securityGrade?.failures || [],

      rawDeviceData: body,
    };

    const deviceUnit = await prisma.deviceUnit.upsert({
      where: imei
        ? { imei }
        : { id: "__never_existing__" },
      create: data,
      update: data,
    });

    const session = await prisma.diagnosticSession.create({
      data: {
        deviceUnitId: deviceUnit.id,
        status: "draft",
      },
    });

    return NextResponse.json({
      ok: true,
      duplicateDetected: !!existingDevice,
      previousSessions: existingDevice?.sessions.length || 0,
      previousGrades:
        existingDevice?.sessions.map((session) => session.finalGrade) || [],
      deviceUnitId: deviceUnit.id,
      sessionId: session.id,
      redirectUrl: `/admin/diagnostics/${session.id}`,
    });
  } catch (error) {
    console.error("device-import failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Device import failed",
      },
      { status: 500 }
    );
  }
}

