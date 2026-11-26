-- A small daily count of which sections each person opens, so admins can see which parts of UniLib are used most.
-- One row per person, section and day; only the section name is stored, never a page address.
CREATE TABLE "FeatureVisit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureVisit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureVisit_userId_feature_day_key" ON "FeatureVisit"("userId", "feature", "day");
CREATE INDEX "FeatureVisit_day_feature_idx" ON "FeatureVisit"("day", "feature");

ALTER TABLE "FeatureVisit" ADD CONSTRAINT "FeatureVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
