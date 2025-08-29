/*
  Warnings:

  - You are about to drop the `items` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_item_id_fkey";

-- DropTable
DROP TABLE "items";

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "issues" TEXT[],
    "task_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "vin" TEXT,
    "purchase_date" TIMESTAMP(3),
    "total_mileage" DOUBLE PRECISION,
    "last_service_date" TIMESTAMP(3),
    "last_service_name" TEXT,
    "image_url" TEXT,
    "price" TEXT,
    "image" TEXT,
    "category" "Category" DEFAULT 'Custom',
    "service_intervals" TEXT[],
    "forum_suggestions" TEXT[],

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
