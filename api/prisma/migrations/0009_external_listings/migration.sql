-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "external" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stars" INTEGER,
ADD COLUMN     "author" TEXT;
