-- AlterTable
ALTER TABLE "items" ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "price" SET DATA TYPE TEXT;
