-- CreateEnum
CREATE TYPE "Client" AS ENUM ('WEB', 'MOBILE');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "client" "Client" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "device" TEXT,
ADD COLUMN     "label" TEXT;
