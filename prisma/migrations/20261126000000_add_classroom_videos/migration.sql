-- AlterTable
ALTER TABLE "ClassroomUsage" ADD COLUMN     "videoLookupsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClassroomVideoSuggestion" (
    "id" TEXT NOT NULL,
    "queryKey" VARCHAR(64) NOT NULL,
    "query" VARCHAR(300) NOT NULL,
    "videos" JSONB NOT NULL,
    "hiddenIds" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomVideoSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomVideoSuggestion_queryKey_key" ON "ClassroomVideoSuggestion"("queryKey");

-- CreateIndex
CREATE INDEX "ClassroomVideoSuggestion_fetchedAt_idx" ON "ClassroomVideoSuggestion"("fetchedAt");
