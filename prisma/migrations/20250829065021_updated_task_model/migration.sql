/*
  Warnings:

  - The `shop_suggestions` column on the `tasks` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "shop_suggestions",
ADD COLUMN     "shop_suggestions" JSONB;
