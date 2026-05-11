/*
  Warnings:

  - You are about to drop the column `description` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `issues` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `last_service_date` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `last_service_name` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `vin` on the `Item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Item" DROP COLUMN "description",
DROP COLUMN "issues",
DROP COLUMN "last_service_date",
DROP COLUMN "last_service_name",
DROP COLUMN "price",
DROP COLUMN "vin";
