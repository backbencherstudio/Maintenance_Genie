/*
  Warnings:

  - A unique constraint covering the columns `[item_id,upcoming_task]` on the table `tasks` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "tasks_item_id_key";

-- CreateIndex
CREATE INDEX "tasks_item_id_idx" ON "tasks"("item_id");

-- CreateIndex
CREATE INDEX "tasks_user_id_idx" ON "tasks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_item_id_upcoming_task_key" ON "tasks"("item_id", "upcoming_task");
