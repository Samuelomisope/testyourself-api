DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClassificationMethod') THEN
    ALTER TYPE "ClassificationMethod" ADD VALUE IF NOT EXISTS 'NEAR_DUPLICATE';
  ELSE
    CREATE TYPE "ClassificationMethod" AS ENUM (
      'RULE_COURSE_CODE',
      'RULE_AMBIGUOUS',
      'AI',
      'NEAR_DUPLICATE',
      'MANUAL'
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StudyMaterial_universityId_createdAt_idx"
ON "StudyMaterial"("universityId", "createdAt");

CREATE TABLE "ClassificationJob" (
  "id" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "totalItems" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassificationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClassificationJob_status_createdAt_idx"
ON "ClassificationJob"("status", "createdAt");

CREATE TABLE "ClassificationJobItem" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "classificationOutcome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassificationJobItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassificationJobItem_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "ClassificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClassificationJobItem_jobId_materialId_key"
ON "ClassificationJobItem"("jobId", "materialId");

CREATE INDEX "ClassificationJobItem_status_availableAt_createdAt_idx"
ON "ClassificationJobItem"("status", "availableAt", "createdAt");

CREATE INDEX "ClassificationJobItem_jobId_status_idx"
ON "ClassificationJobItem"("jobId", "status");
