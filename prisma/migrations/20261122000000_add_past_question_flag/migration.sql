-- Marks a study material as a past question paper so students can practise from it. Additive: one column with a default.
ALTER TABLE "StudyMaterial" ADD COLUMN "isPastQuestion" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "StudyMaterial_isPastQuestion_idx" ON "StudyMaterial"("isPastQuestion");
