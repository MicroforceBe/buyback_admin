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
    const device =
      await prisma.deviceUnit.findUnique({
        where: {
          id: params.id,
        },
      });

    if (!device) {
      return NextResponse.json(
        {
          error: "Not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      model:
        device.modelName ||
        device.marketingName ||
        null,

      serialNumber:
        device.serialNumber || null,

      imei:
        device.imei ||
        device.imei2 ||
        null,

      storageCapacity:
        device.storageCapacity || null,

      batteryHealth:
        device.batteryHealth || null,

      batteryCycleCount:
        device.batteryCycleCount || null,

      activationLockStatus:
        device.activationLockStatus ||
        null,

      iosVersion:
        device.osVersion || null,
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
