/*
  Warnings:

  - A unique constraint covering the columns `[chatSnapUsername]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chatSnapUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_chatSnapUsername_key" ON "User"("chatSnapUsername");
