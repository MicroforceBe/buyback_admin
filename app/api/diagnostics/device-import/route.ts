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

    const deviceUnit = await prisma.deviceUnit.upsert({
      where: imei
        ? {
            imei,
          }
        : {
            id: "__never_existing_device_unit_id__",
          },
      create: {
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

        activationState: toNullableString(body.activationState),
        mdmStatus: toNullableString(body.mdmStatus),
        carrierLockStatus: toNullableString(body.carrierLockStatus),
        simLockStatus: toNullableString(body.simLockStatus),
        blacklistStatus: toNullableString(body.blacklistStatus),

        rawDeviceData: body,
      },
      update: {
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

        activationState: toNullableString(body.activationState),
        mdmStatus: toNullableString(body.mdmStatus),
        carrierLockStatus: toNullableString(body.carrierLockStatus),
        simLockStatus: toNullableString(body.simLockStatus),
        blacklistStatus: toNullableString(body.blacklistStatus),

        rawDeviceData: body,
      },
    });

    const session = await prisma.diagnosticSession.create({
      data: {
        deviceUnitId: deviceUnit.id,
        status: "draft",
      },
    });

    return NextResponse.json({
      ok: true,
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
      {
        status: 500,
      }
    );
  }
}
