-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastReminderEmailAt" TIMESTAMP(3);
