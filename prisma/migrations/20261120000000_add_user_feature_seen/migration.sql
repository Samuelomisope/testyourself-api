-- CreateTable
CREATE TABLE "UserFeatureSeen" (
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFeatureSeen_pkey" PRIMARY KEY ("userId", "key")
);

-- AddForeignKey
ALTER TABLE "UserFeatureSeen"
  ADD CONSTRAINT "UserFeatureSeen_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
