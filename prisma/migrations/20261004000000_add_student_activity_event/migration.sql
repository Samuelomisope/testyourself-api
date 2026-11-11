CREATE TABLE "StudentActivityEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "courseId" TEXT,
    "topicId" TEXT,
    "materialId" TEXT,
    "payload" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentActivityEvent_studentId_idempotencyKey_key"
ON "StudentActivityEvent"("studentId", "idempotencyKey");

CREATE INDEX "StudentActivityEvent_studentId_eventType_createdAt_idx"
ON "StudentActivityEvent"("studentId", "eventType", "createdAt");

CREATE INDEX "StudentActivityEvent_courseId_createdAt_idx"
ON "StudentActivityEvent"("courseId", "createdAt");
