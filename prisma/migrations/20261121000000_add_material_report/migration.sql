-- Students can report a broken or wrong study material. Additive only: one new enum and one new table.
CREATE TYPE "MaterialReportReason" AS ENUM ('BROKEN_FILE', 'WRONG_COURSE', 'INAPPROPRIATE', 'DUPLICATE', 'OTHER');

CREATE TABLE "MaterialReport" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" "MaterialReportReason" NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialReport_materialId_userId_key" ON "MaterialReport"("materialId", "userId");
CREATE INDEX "MaterialReport_materialId_idx" ON "MaterialReport"("materialId");

ALTER TABLE "MaterialReport"
  ADD CONSTRAINT "MaterialReport_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "StudyMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialReport"
  ADD CONSTRAINT "MaterialReport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
