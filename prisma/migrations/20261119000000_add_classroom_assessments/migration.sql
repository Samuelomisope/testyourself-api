-- CreateTable
CREATE TABLE "ClassroomAssessment" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "stepIndex" INTEGER NOT NULL,
  "questions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomAttempt" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "score" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomAssessment_sessionId_stepIndex_key" ON "ClassroomAssessment"("sessionId", "stepIndex");
CREATE INDEX "ClassroomAttempt_assessmentId_userId_createdAt_idx" ON "ClassroomAttempt"("assessmentId", "userId", "createdAt");
CREATE INDEX "ClassroomAttempt_userId_createdAt_idx" ON "ClassroomAttempt"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClassroomAssessment"
  ADD CONSTRAINT "ClassroomAssessment_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassroomAttempt"
  ADD CONSTRAINT "ClassroomAttempt_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "ClassroomAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassroomAttempt"
  ADD CONSTRAINT "ClassroomAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
