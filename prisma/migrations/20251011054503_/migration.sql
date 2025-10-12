/*
  Warnings:

  - The values [Overdue] on the enum `Task_Status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Task_Status_new" AS ENUM ('Due', 'Completed');
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "Task_Status_new" USING ("status"::text::"Task_Status_new");
ALTER TYPE "Task_Status" RENAME TO "Task_Status_old";
ALTER TYPE "Task_Status_new" RENAME TO "Task_Status";
DROP TYPE "Task_Status_old";
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'Due';
COMMIT;
