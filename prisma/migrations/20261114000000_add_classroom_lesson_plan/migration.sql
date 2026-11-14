-- AI Classroom Phase B2: lesson mode, source mode and a generated lesson plan.
-- Additive only: every new column is nullable or has a default, so existing rows and running code are unaffected.
-- Existing lessons default to CONVERSATION and keep behaving exactly as before.

CREATE TYPE "ClassroomMode" AS ENUM ('CLASSROOM', 'CONVERSATION');
CREATE TYPE "ClassroomSourceMode" AS ENUM ('GENERAL', 'UPLOADED', 'LIBRARY');

ALTER TABLE "ClassroomSession"
  ADD COLUMN "mode" "ClassroomMode" NOT NULL DEFAULT 'CONVERSATION',
  ADD COLUMN "sourceMode" "ClassroomSourceMode" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "objectives" JSONB,
  ADD COLUMN "outline" JSONB,
  ADD COLUMN "currentStepIndex" INTEGER NOT NULL DEFAULT 0;
