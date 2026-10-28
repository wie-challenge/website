BEGIN;
-- Contractual consent for schedule changes requires all affected parties, not platform authority.
ALTER TABLE "ScheduleRevision" ADD COLUMN "buyerApprovedById" TEXT;
ALTER TABLE "ScheduleRevision" ADD COLUMN "buyerApprovedAt" TIMESTAMP(3);
ALTER TABLE "ScheduleRevision" ADD COLUMN "artisanApprovedById" TEXT;
ALTER TABLE "ScheduleRevision" ADD COLUMN "artisanApprovedAt" TIMESTAMP(3);

ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_buyerApprovedById_fkey"
  FOREIGN KEY ("buyerApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_artisanApprovedById_fkey"
  FOREIGN KEY ("artisanApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One specification authority: an order revision pins the approved catalogue revision it accepted.
ALTER TABLE "ProcurementRevision" ADD COLUMN "productSpecificationRevisionId" TEXT;
CREATE UNIQUE INDEX "ProcurementRevision_productSpecificationRevisionId_key"
  ON "ProcurementRevision"("productSpecificationRevisionId");
ALTER TABLE "ProcurementRevision" ADD CONSTRAINT "ProcurementRevision_productSpecificationRevisionId_fkey"
  FOREIGN KEY ("productSpecificationRevisionId") REFERENCES "ProductSpecificationRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
