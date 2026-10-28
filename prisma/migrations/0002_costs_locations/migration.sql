-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('FUEL', 'MAINTENANCE', 'OVERTIME', 'OTHER');

-- CreateTable
CREATE TABLE "WorkCost" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "category" "CostCategory" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkCost_occurredAt_idx" ON "WorkCost"("occurredAt");

-- CreateIndex
CREATE INDEX "WorkCost_orderId_idx" ON "WorkCost"("orderId");

-- CreateIndex
CREATE INDEX "LocationPing_assignmentId_capturedAt_idx" ON "LocationPing"("assignmentId", "capturedAt");

-- CreateIndex
CREATE INDEX "LocationPing_capturedAt_idx" ON "LocationPing"("capturedAt");

-- AddForeignKey
ALTER TABLE "WorkCost" ADD CONSTRAINT "WorkCost_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TaskAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

