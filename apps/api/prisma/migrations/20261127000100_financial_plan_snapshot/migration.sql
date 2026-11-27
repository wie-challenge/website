-- Approved snapshots are separate from synthetic settlement and do not authorize funding.
CREATE TABLE "FinancialPlanSnapshot" (
  "id" TEXT PRIMARY KEY,
  "acceptanceId" TEXT NOT NULL REFERENCES "ProcurementAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "previousId" TEXT UNIQUE REFERENCES "FinancialPlanSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "preparedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "approvedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "customerPriceMillimes" BIGINT NOT NULL CHECK ("customerPriceMillimes" > 0),
  "currency" TEXT NOT NULL DEFAULT 'TND' CHECK ("currency" = 'TND'),
  "policyVersion" INTEGER NOT NULL CHECK ("policyVersion" = 1),
  "calculationBase" TEXT NOT NULL CHECK ("calculationBase" IN ('GROSS', 'AFTER_MATERIALS', 'AFTER_DIRECT_COSTS')),
  "baseMillimes" BIGINT NOT NULL CHECK ("baseMillimes" >= 0),
  "materialCostMillimes" BIGINT NOT NULL CHECK ("materialCostMillimes" >= 0),
  "otherDirectCostMillimes" BIGINT NOT NULL CHECK ("otherDirectCostMillimes" >= 0),
  "processingFeeMillimes" BIGINT NOT NULL CHECK ("processingFeeMillimes" >= 0),
  "contributionMillimes" BIGINT NOT NULL CHECK ("contributionMillimes" >= 0),
  "allocations" JSONB NOT NULL,
  "approvalReason" TEXT NOT NULL CHECK (length(trim("approvalReason")) BETWEEN 2 AND 2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialPlanSnapshot_acceptanceId_revision_key" UNIQUE ("acceptanceId", "revision"),
  CONSTRAINT "FinancialPlanSnapshot_independent_approval" CHECK ("preparedById" <> "approvedById")
);

CREATE FUNCTION financial_plan_snapshot_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  quote_price BIGINT;
  preceding "FinancialPlanSnapshot"%ROWTYPE;
  allocation JSONB;
  participant TEXT;
  seen TEXT[] := ARRAY[]::TEXT[];
  share NUMERIC;
  amount NUMERIC;
  total NUMERIC := 0;
  total_share NUMERIC := 0;
  expected_base NUMERIC;
BEGIN
  SELECT q."totalMillimes" INTO quote_price FROM "ProcurementAcceptance" a
    JOIN "ProcurementQuote" q ON q."id" = a."quoteId" WHERE a."id" = NEW."acceptanceId";
  IF quote_price IS NULL OR NEW."customerPriceMillimes" <> quote_price THEN
    RAISE EXCEPTION 'Financial plan price must match accepted quotation';
  END IF;
  IF NEW."revision" = 1 THEN
    IF NEW."previousId" IS NOT NULL THEN RAISE EXCEPTION 'First revision cannot have a predecessor'; END IF;
  ELSE
    SELECT * INTO preceding FROM "FinancialPlanSnapshot" WHERE "id" = NEW."previousId";
    IF NOT FOUND OR preceding."acceptanceId" <> NEW."acceptanceId" OR preceding."revision" <> NEW."revision" - 1 THEN
      RAISE EXCEPTION 'Financial plan revision must extend the preceding acceptance revision';
    END IF;
  END IF;
  expected_base := NEW."customerPriceMillimes"::NUMERIC -
    CASE WHEN NEW."calculationBase" IN ('AFTER_MATERIALS', 'AFTER_DIRECT_COSTS') THEN NEW."materialCostMillimes" ELSE 0 END -
    CASE WHEN NEW."calculationBase" = 'AFTER_DIRECT_COSTS' THEN NEW."otherDirectCostMillimes" ELSE 0 END;
  IF NEW."baseMillimes" <> expected_base THEN RAISE EXCEPTION 'Incorrect financial calculation base'; END IF;
  IF jsonb_typeof(NEW."allocations") <> 'array' OR jsonb_array_length(NEW."allocations") = 0 THEN
    RAISE EXCEPTION 'At least one artisan allocation is required';
  END IF;
  FOR allocation IN SELECT value FROM jsonb_array_elements(NEW."allocations") LOOP
    IF jsonb_typeof(allocation) <> 'object' OR NOT (allocation ?& ARRAY['artisanProfileId','basisPoints','amountMillimes'])
      OR jsonb_typeof(allocation->'artisanProfileId') <> 'string'
      OR jsonb_typeof(allocation->'basisPoints') <> 'number'
      OR jsonb_typeof(allocation->'amountMillimes') <> 'string'
      OR (allocation->>'basisPoints') !~ '^(0|[1-9][0-9]{0,4})$'
      OR (allocation->>'amountMillimes') !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RAISE EXCEPTION 'Invalid artisan allocation';
    END IF;
    participant := allocation->>'artisanProfileId';
    IF participant = ANY(seen) OR NOT EXISTS (SELECT 1 FROM "ArtisanProfile" WHERE "id" = participant) THEN
      RAISE EXCEPTION 'Duplicate or unknown artisan';
    END IF;
    seen := array_append(seen, participant);
    share := (allocation->>'basisPoints')::NUMERIC;
    amount := (allocation->>'amountMillimes')::NUMERIC;
    IF share > 10000 OR amount <> floor((NEW."baseMillimes"::NUMERIC * share + 5000) / 10000) THEN
      RAISE EXCEPTION 'Artisan amount does not match approved percentage';
    END IF;
    total := total + amount;
    total_share := total_share + share;
  END LOOP;
  IF total_share > 10000 OR total > NEW."baseMillimes" OR
    total + NEW."materialCostMillimes"::NUMERIC + NEW."otherDirectCostMillimes" + NEW."processingFeeMillimes" + NEW."contributionMillimes" <> NEW."customerPriceMillimes" THEN
    RAISE EXCEPTION 'Financial plan exceeds or does not reconcile to customer price';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION financial_plan_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Approved financial plans are append-only';
END $$;
CREATE TRIGGER "FinancialPlanSnapshot_validate" BEFORE INSERT ON "FinancialPlanSnapshot" FOR EACH ROW EXECUTE FUNCTION financial_plan_snapshot_validate();
CREATE TRIGGER "FinancialPlanSnapshot_immutable" BEFORE UPDATE OR DELETE ON "FinancialPlanSnapshot" FOR EACH ROW EXECUTE FUNCTION financial_plan_snapshot_immutable();
