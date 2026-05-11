/*
  Warnings:

  - You are about to drop the `Questions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Questions" DROP CONSTRAINT "Questions_itemId_fkey";

-- DropTable
DROP TABLE "Questions";

-- CreateTable
CREATE TABLE "questions " (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question" TEXT[],
    "itemId" TEXT NOT NULL,

    CONSTRAINT "questions _pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions _itemId_key" ON "questions "("itemId");

-- AddForeignKey
ALTER TABLE "questions " ADD CONSTRAINT "questions _itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
