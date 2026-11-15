CREATE TYPE "ClassroomSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETING', 'DELETE_FAILED');
CREATE TYPE "ClassroomDocumentStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'DELETE_PENDING', 'DELETE_FAILED', 'DELETED');
CREATE TYPE "ClassroomDocumentSource" AS ENUM ('UPLOAD', 'STUDY_MATERIAL');
CREATE TYPE "ClassroomTurnRequestStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "ClassroomTurnRole" AS ENUM ('STUDENT', 'TUTOR');

CREATE TABLE "ClassroomSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseId" TEXT,
  "title" TEXT,
  "topic" TEXT NOT NULL,
  "status" "ClassroomSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "tutorVoice" TEXT NOT NULL DEFAULT 'FEMALE',
  "nextTurnSequence" INTEGER NOT NULL DEFAULT 0,
  "nextBoardSequence" INTEGER NOT NULL DEFAULT 0,
  "activeTurnRequestId" TEXT,
  "turnLeaseVersion" INTEGER NOT NULL DEFAULT 0,
  "turnLeaseExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomDocument" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "source" "ClassroomDocumentSource" NOT NULL,
  "sourceMaterialId" TEXT,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT,
  "storageKey" TEXT,
  "status" "ClassroomDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
  "extractionMethod" TEXT,
  "extractedChars" INTEGER,
  "failureCode" TEXT,
  "deleteAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ClassroomDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomDocumentChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "pageStart" INTEGER,
  "pageEnd" INTEGER,
  "text" TEXT NOT NULL,
  CONSTRAINT "ClassroomDocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomTurnRequest" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "status" "ClassroomTurnRequestStatus" NOT NULL DEFAULT 'PROCESSING',
  "leaseVersion" INTEGER NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomTurnRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomTurn" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" "ClassroomTurnRole" NOT NULL,
  "content" TEXT NOT NULL,
  "response" JSONB,
  "provider" TEXT,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomTurn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "turnsUsed" INTEGER NOT NULL DEFAULT 0,
  "uploadBytesUsed" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassroomDocumentChunk_documentId_chunkIndex_key" ON "ClassroomDocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "ClassroomDocumentChunk_documentId_pageStart_idx" ON "ClassroomDocumentChunk"("documentId", "pageStart");
CREATE INDEX "ClassroomDocument_sessionId_status_createdAt_idx" ON "ClassroomDocument"("sessionId", "status", "createdAt");
CREATE INDEX "ClassroomDocument_status_updatedAt_idx" ON "ClassroomDocument"("status", "updatedAt");
CREATE INDEX "ClassroomDocument_sourceMaterialId_idx" ON "ClassroomDocument"("sourceMaterialId");
CREATE INDEX "ClassroomSession_userId_updatedAt_idx" ON "ClassroomSession"("userId", "updatedAt");
CREATE INDEX "ClassroomSession_userId_status_updatedAt_idx" ON "ClassroomSession"("userId", "status", "updatedAt");
CREATE INDEX "ClassroomSession_courseId_updatedAt_idx" ON "ClassroomSession"("courseId", "updatedAt");
CREATE UNIQUE INDEX "ClassroomTurnRequest_sessionId_idempotencyKey_key" ON "ClassroomTurnRequest"("sessionId", "idempotencyKey");
CREATE INDEX "ClassroomTurnRequest_sessionId_status_createdAt_idx" ON "ClassroomTurnRequest"("sessionId", "status", "createdAt");
CREATE UNIQUE INDEX "ClassroomTurn_sessionId_sequence_key" ON "ClassroomTurn"("sessionId", "sequence");
CREATE UNIQUE INDEX "ClassroomTurn_requestId_role_key" ON "ClassroomTurn"("requestId", "role");
CREATE INDEX "ClassroomTurn_sessionId_createdAt_idx" ON "ClassroomTurn"("sessionId", "createdAt");
CREATE UNIQUE INDEX "ClassroomUsage_userId_usageDate_key" ON "ClassroomUsage"("userId", "usageDate");
CREATE INDEX "ClassroomUsage_usageDate_idx" ON "ClassroomUsage"("usageDate");

ALTER TABLE "ClassroomSession"
  ADD CONSTRAINT "ClassroomSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomSession"
  ADD CONSTRAINT "ClassroomSession_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassroomDocument"
  ADD CONSTRAINT "ClassroomDocument_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassroomDocument"
  ADD CONSTRAINT "ClassroomDocument_sourceMaterialId_fkey"
  FOREIGN KEY ("sourceMaterialId") REFERENCES "StudyMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassroomDocumentChunk"
  ADD CONSTRAINT "ClassroomDocumentChunk_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ClassroomDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomTurnRequest"
  ADD CONSTRAINT "ClassroomTurnRequest_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomTurn"
  ADD CONSTRAINT "ClassroomTurn_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomTurn"
  ADD CONSTRAINT "ClassroomTurn_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ClassroomTurnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomUsage"
  ADD CONSTRAINT "ClassroomUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
