CREATE TABLE "DeviceUnit" (
  "id" TEXT NOT NULL,
  "imei" TEXT,
  "serialNumber" TEXT,
  "brand" TEXT NOT NULL,
  "model" TEXT,
  "storage" TEXT,
  "color" TEXT,
  "batteryHealth" INTEGER,
  "batteryCycles" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeviceUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceUnit_imei_key" ON "DeviceUnit"("imei");

CREATE TABLE "DiagnosticSession" (
  "id" TEXT NOT NULL,
  "deviceUnitId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "finalGrade" TEXT,
  "finalScore" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DiagnosticSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiagnosticTestResult" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "testKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "value" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiagnosticTestResult_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DiagnosticSession"
ADD CONSTRAINT "DiagnosticSession_deviceUnitId_fkey"
FOREIGN KEY ("deviceUnitId") REFERENCES "DeviceUnit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DiagnosticTestResult"
ADD CONSTRAINT "DiagnosticTestResult_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
