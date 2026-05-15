//app/api/diagnostics/device-import/route.ts 

import { execSync } from "child_process";


const BASE_URL = "https://buyback-admin.vercel.app/";

const API_URL =
  `${BASE_URL}/api/diagnostics/device-import`;

function readDeviceInfo() {
  try {
    const output = execSync("ideviceinfo", {
      encoding: "utf8",
    });

    const lines = output.split("\n");

    const data = {};

    for (const line of lines) {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        continue;
      }

      const key = line
        .slice(0, separatorIndex)
        .trim();

      const value = line
        .slice(separatorIndex + 1)
        .trim();

      data[key] = value;
    }

    return {
      brand: "Apple",

      imei:
        data.InternationalMobileEquipmentIdentity ||
        null,

      serialNumber:
        data.SerialNumber || null,

      udid:
        data.UniqueDeviceID || null,

      model:
        data.ProductType || null,

      productType:
        data.ProductType || null,

      iosVersion:
        data.ProductVersion || null,

      modelNumber:
        data.ModelNumber || null,

      regionInfo:
        data.RegionInfo || null,

      activationState:
        data.ActivationState || null,

      rawDeviceData: data,
    };
  } catch (error) {
    console.error(
      "Kon toestel niet uitlezen:",
      error.message
    );

    process.exit(1);
  }
}

async function uploadDevice() {
  const deviceData = readDeviceInfo();

  console.log("Uitgelezen toestel:");
  console.log(deviceData);

  try {
    const response = await axios.post(
      API_URL,
      deviceData
    );

    console.log("\nImport gelukt:");
    console.log(response.data);

    if (response.data.redirectUrl) {
      console.log(
        "\nOpen deze URL:"
      );

      console.log(
        `${BASE_URL}${response.data.redirectUrl}`
      );
    }
  } catch (error) {
    console.error(
      "\nUpload mislukt:"
    );

    console.error(
      error.response?.data ||
        error.message
    );
  }
}

uploadDevice();

