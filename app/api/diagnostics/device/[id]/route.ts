import { diagnosticAccess } from '@/lib/security/access';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  {
    params: incomingParams,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const accessDenied = await diagnosticAccess(request, 'read');
  if (accessDenied) return accessDenied;
  const params = await incomingParams;

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



