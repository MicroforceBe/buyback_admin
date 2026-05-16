import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: {
      id: string;
    };
  }
) {
  try {
    const session =
      await prisma.diagnosticSession.findUnique({
        where: {
          id: params.id,
        },
        include: {
          deviceUnit: true,
        },
      });

    if (!session || !session.deviceUnit) {
      return NextResponse.json(
        {
          error: "Not found",
        },
        {
          status: 404,
        }
      );
    }

    const device = session.deviceUnit;

    return NextResponse.json({
      model: device.model || null,
      serialNumber: device.serialNumber || null,
      imei: device.imei || device.imei2 || null,
      storageCapacity: device.storage || null,
      batteryHealth: device.batteryHealth || null,
      batteryCycleCount: device.batteryCycles || null,
      activationLockStatus: device.activationLockStatus || null,
      iosVersion: device.iosVersion || null,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Server error",
      },
      {
        status: 500,
      }
    );
  }
}

