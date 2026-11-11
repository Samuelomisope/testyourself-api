ALTER TABLE "User" ADD COLUMN "premiumUntil" TIMESTAMP(3);

CREATE TABLE "PremiumPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PremiumPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PremiumPayment_reference_key" ON "PremiumPayment"("reference");
CREATE INDEX "PremiumPayment_userId_paidAt_idx" ON "PremiumPayment"("userId", "paidAt");

ALTER TABLE "PremiumPayment"
ADD CONSTRAINT "PremiumPayment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
