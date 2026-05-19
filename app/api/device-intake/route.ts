// app/api/device-intake/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function storageToGb(storage: unknown) {
  if (typeof storage !== "string") {
    return null;
  }

  const match = storage.match(/(\d+)/);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  return Number.isFinite(value) ? value : null;
}

function normalizeGrade(grade: unknown) {
  if (typeof grade !== "string") {
    return null;
  }

  if (grade === "A+") {
    return "A+";
  }

  if (grade === "A") {
    return "A";
  }

  if (grade === "B") {
    return "B";
  }

  if (grade === "C") {
    return "C";
  }

  return null;
}

function buildGradeSearchTerms(
  cosmeticGrade: string | null
) {
  if (cosmeticGrade === "A+") {
    return [
      "nieuw",
      "premium",
      "new",
    ];
  }

  if (cosmeticGrade === "A") {
    return [
      "5*",
      "5 *",
      "as new",
    ];
  }

  if (cosmeticGrade === "B") {
    return [
      "4*",
      "4 *",
      "very good",
    ];
  }

  if (cosmeticGrade === "C") {
    return [
      "3*",
      "3 *",
      "good",
    ];
  }

  return [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("DEVICE INTAKE BODY");
    console.log(
      JSON.stringify(body, null, 2)
    );

    const imei = body.imei || null;
    const serialNumber =
      body.serialNumber || null;

    if (!imei && !serialNumber) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "IMEI of serienummer verplicht",
        },
        {
          status: 400,
        }
      );
    }

    const existingDevice =
      await prisma.deviceUnit.findFirst({
        where: {
          OR: [
            imei
              ? { imei }
              : undefined,

            serialNumber
              ? {
                  serialNumber,
                }
              : undefined,
          ].filter(Boolean) as any,
        },

        include: {
          sessions: {
            orderBy: {
              createdAt:
                "desc",
            },
          },
        },
      });

    const securityGrade =
      typeof body.securityGrade ===
        "object" &&
      body.securityGrade !== null
        ? body.securityGrade.grade
        : body.securityGrade ||
          null;

    const securityWarnings =
      typeof body.securityGrade ===
        "object" &&
      body.securityGrade !== null
        ? body.securityGrade
            .warnings || []
        : [];

    const securityFailures =
      typeof body.securityGrade ===
        "object" &&
      body.securityGrade !== null
        ? body.securityGrade
            .failures || []
        : [];

    const cosmeticGrade =
      normalizeGrade(
        body.cosmeticGrade
      );

    const deviceData = {
      imei,

      imei2:
        body.imei2 || null,

      serialNumber,

      brand:
        body.brand || "Apple",

      model:
        body.model || null,

      storage:
        body.storage || null,

      color:
        body.color || null,

      cosmeticGrade,

      vatScheme:
        body.vatScheme ||
        null,

      productType:
        body.productType ||
        null,

      modelNumber:
        body.modelNumber ||
        null,

      partNumber:
        body.partNumber ||
        null,

      regionInfo:
        body.regionInfo ||
        null,

      iosVersion:
        body.iosVersion ||
        body.productVersion ||
        null,

      udid:
        body.udid ||
        body.uniqueDeviceId ||
        null,

      batteryHealth:
        typeof body.batteryHealth ===
        "number"
          ? body.batteryHealth
          : null,

      batteryCycles:
        typeof body.batteryCycles ===
        "number"
          ? body.batteryCycles
          : typeof body.batteryCycleCount ===
            "number"
          ? body.batteryCycleCount
          : null,

      batteryCurrentCharge:
        typeof body.batteryCurrentCharge ===
        "number"
          ? body.batteryCurrentCharge
          : typeof body.batteryCurrentCapacity ===
            "number"
          ? body
              .batteryCurrentCapacity
          : null,

      batteryDesignCapacity:
        typeof body.batteryDesignCapacity ===
        "number"
          ? body
              .batteryDesignCapacity
          : null,

      batteryNominalChargeCapacity:
        typeof body.batteryNominalChargeCapacity ===
        "number"
          ? body
              .batteryNominalChargeCapacity
          : null,

      batteryVoltage:
        typeof body.batteryVoltage ===
        "number"
          ? body.batteryVoltage
          : null,

      batteryTemperatureCelsius:
        typeof body.batteryTemperatureCelsius ===
        "number"
          ? body
              .batteryTemperatureCelsius
          : null,

      activationState:
        body.activationState ||
        null,

      activationLockStatus:
        body.activationLockStatus ||
        null,

      findMyStatus:
        body.findMyStatus ||
        null,

      simStatus:
        body.simStatus ||
        null,

      simLockStatus:
        body.simLockStatus ||
        null,

      carrierLockStatus:
        body.carrierLockStatus ||
        null,

      carrierName:
        body.carrierName ||
        null,

      mdmStatus:
        body.mdmStatus ||
        null,

      blacklistStatus:
        body.blacklistStatus ||
        null,

      securityGrade,

      securityWarnings,

      securityFailures,
    };

    console.log("DEVICE DATA");

    console.log(
      JSON.stringify(
        deviceData,
        null,
        2
      )
    );

    const deviceUnit =
      existingDevice
        ? await prisma.deviceUnit.update(
            {
              where: {
                id: existingDevice.id,
              },

              data: deviceData,
            }
          )
        : await prisma.deviceUnit.create(
            {
              data: deviceData,
            }
          );

    const session =
      await prisma.diagnosticSession.create(
        {
          data: {
            deviceUnitId:
              deviceUnit.id,

            status: "draft",
          },
        }
      );

    const capacityGb =
      storageToGb(
        body.storage
      );

    const gradeSearchTerms =
      buildGradeSearchTerms(
        cosmeticGrade
      );

    let suggestedArticle =
      await prisma.erpArticle.findFirst(
        {
          where: {
            active: true,

            missing_from_erp:
              false,

            refurbished_product:
              true,

            brand:
              body.brand
                ? {
                    equals:
                      body.brand,
                    mode:
                      "insensitive",
                  }
                : undefined,

            model:
              body.model
                ? {
                    equals:
                      body.model,
                    mode:
                      "insensitive",
                  }
                : undefined,

            capacity_gb:
              capacityGb ||
              undefined,

            color:
              body.color
                ? {
                    contains:
                      body.color,
                    mode:
                      "insensitive",
                  }
                : undefined,

            vat_margin:
              body.vatScheme ===
              "margin"
                ? true
                : body.vatScheme ===
                    "vat"
                  ? false
                  : undefined,

            condition_grade:
              cosmeticGrade ||
              undefined,
          },

          orderBy: [
            {
              inventory_qty:
                "desc",
            },

            {
              updated_at:
                "desc",
            },
          ],
        }
      );

    if (!suggestedArticle) {
      suggestedArticle =
        await prisma.erpArticle.findFirst(
          {
            where: {
              active: true,

              missing_from_erp:
                false,

              refurbished_product:
                true,

              vat_margin:
                body.vatScheme ===
                "margin"
                  ? true
                  : body.vatScheme ===
                      "vat"
                    ? false
                    : undefined,

              AND: [
                body.model
                  ? {
                      title: {
                        contains:
                          body.model,
                        mode:
                          "insensitive",
                      },
                    }
                  : {},

                body.storage
                  ? {
                      title: {
                        contains:
                          body.storage,
                        mode:
                          "insensitive",
                      },
                    }
                  : {},

                body.color
                  ? {
                      title: {
                        contains:
                          body.color,
                        mode:
                          "insensitive",
                      },
                    }
                  : {},

                gradeSearchTerms.length >
                0
                  ? {
                      OR:
                        gradeSearchTerms.map(
                          (
                            term
                          ) => ({
                            title: {
                              contains:
                                term,
                              mode:
                                "insensitive",
                            },
                          })
                        ),
                    }
                  : {},
              ],
            },

            orderBy: [
              {
                inventory_qty:
                  "desc",
              },

              {
                updated_at:
                  "desc",
              },
            ],
          }
        );
    }

    return NextResponse.json({
      ok: true,

      duplicateDetected:
        Boolean(existingDevice),

      previousSessions:
        existingDevice?.sessions
          .length || 0,

      previousGrades:
        existingDevice?.sessions
          .map(
            (item) =>
              item.finalGrade
          )
          .filter(Boolean) || [],

      deviceUnitId:
        deviceUnit.id,

      sessionId:
        session.id,

      suggestedSku:
        suggestedArticle?.sku ||
        null,

      suggestedArticleTitle:
        suggestedArticle?.title ||
        null,

      suggestedArticleId:
        suggestedArticle?.id ||
        null,

      redirectUrl:
        `/admin/diagnostics/${session.id}`,
    });
  } catch (error) {
    console.error(
      "DEVICE INTAKE ERROR"
    );

    console.error(error);

    return NextResponse.json(
      {
        ok: false,

        error:
          "Device intake mislukt",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}
