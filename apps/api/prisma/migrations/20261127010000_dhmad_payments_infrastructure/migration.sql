-- Additive DHMAD sandbox payments, ledger, KYC, webhook inbox, reconciliation, and payout simulation tables.

CREATE TABLE "PaymentObligation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channel" TEXT NOT NULL CHECK ("channel" IN ('B2C', 'B2B')),
  "commercialOrderId" TEXT,
  "marketOrderId" TEXT,
  "buyerOrganizationId" TEXT NOT NULL,
  "financialPlanSnapshotId" TEXT,
  "allocationSnapshot" JSONB NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TND' CHECK ("currency" = 'TND'),
  "amountMillimes" BIGINT NOT NULL CHECK ("amountMillimes" > 0),
  "feeBearer" TEXT NOT NULL DEFAULT 'SELLER' CHECK ("feeBearer" IN ('SELLER', 'BUYER')),
  "expectedFeeMillimes" BIGINT NOT NULL DEFAULT 0 CHECK ("expectedFeeMillimes" >= 0),
  "buyerFundingMillimes" BIGINT NOT NULL CHECK ("buyerFundingMillimes" >= "amountMillimes"),
  "releasedToNasjMillimes" BIGINT NOT NULL DEFAULT 0 CHECK ("releasedToNasjMillimes" >= 0),
  "actualFeeMillimes" BIGINT NOT NULL DEFAULT 0 CHECK ("actualFeeMillimes" >= 0),
  "refundedMillimes" BIGINT NOT NULL DEFAULT 0 CHECK ("refundedMillimes" >= 0),
  "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK ("status" IN (
    'AWAITING_PAYMENT', 'PAYMENT_PENDING', 'FUNDS_SECURED', 'AWAITING_DELIVERY_ACCEPTANCE',
    'SETTLED', 'CANCELLED', 'FAILED', 'REFUNDED', 'DISPUTED'
  )),
  "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRECONCILED' CHECK ("reconciliationStatus" IN (
    'UNRECONCILED', 'MATCHED', 'DISCREPANCY_QUARANTINED'
  )),
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentObligation_single_order_check" CHECK (
    ("commercialOrderId" IS NOT NULL)::int + ("marketOrderId" IS NOT NULL)::int = 1
  ),
  CONSTRAINT "PaymentObligation_commercialOrderId_fkey" FOREIGN KEY ("commercialOrderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentObligation_marketOrderId_fkey" FOREIGN KEY ("marketOrderId") REFERENCES "MarketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentObligation_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentObligation_financialPlanSnapshotId_fkey" FOREIGN KEY ("financialPlanSnapshotId") REFERENCES "FinancialPlanSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentObligation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PaymentObligation_commercialOrderId_idx" ON "PaymentObligation"("commercialOrderId");
CREATE INDEX "PaymentObligation_marketOrderId_idx" ON "PaymentObligation"("marketOrderId");
CREATE INDEX "PaymentObligation_buyerOrganizationId_status_idx" ON "PaymentObligation"("buyerOrganizationId", "status");
CREATE INDEX "PaymentObligation_status_reconciliationStatus_idx" ON "PaymentObligation"("status", "reconciliationStatus");
CREATE UNIQUE INDEX "PaymentObligation_active_commercial_key" ON "PaymentObligation"("commercialOrderId")
  WHERE "commercialOrderId" IS NOT NULL AND "status" NOT IN ('CANCELLED', 'FAILED', 'REFUNDED');
CREATE UNIQUE INDEX "PaymentObligation_active_market_key" ON "PaymentObligation"("marketOrderId")
  WHERE "marketOrderId" IS NOT NULL AND "status" NOT IN ('CANCELLED', 'FAILED', 'REFUNDED');

CREATE TABLE "ProviderEscrow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "obligationId" TEXT NOT NULL UNIQUE,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('mock', 'dhmad')),
  "environment" TEXT NOT NULL CHECK ("environment" IN ('mock', 'sandbox')),
  "externalEscrowId" TEXT,
  "externalReference" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('quick', 'standard')),
  "recipientRole" TEXT NOT NULL DEFAULT 'NASJ_ASSOCIATED_ACCOUNT' CHECK ("recipientRole" = 'NASJ_ASSOCIATED_ACCOUNT'),
  "buyerEmail" TEXT NOT NULL,
  "sellerEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "providerStatus" TEXT NOT NULL DEFAULT 'pending',
  "amountMillimes" BIGINT NOT NULL CHECK ("amountMillimes" > 0),
  "buyerFundingMillimes" BIGINT NOT NULL CHECK ("buyerFundingMillimes" >= "amountMillimes"),
  "providerFeeMillimes" BIGINT NOT NULL DEFAULT 0 CHECK ("providerFeeMillimes" >= 0),
  "reviewHours" INTEGER NOT NULL CHECK ("reviewHours" BETWEEN 24 AND 336),
  "deliveredAt" TIMESTAMP(3),
  "completionDeadline" TIMESTAMP(3),
  "contractId" TEXT,
  "contractTermsSha256" TEXT,
  "sellerSigned" BOOLEAN NOT NULL DEFAULT false,
  "buyerSigned" BOOLEAN NOT NULL DEFAULT false,
  "isFullySigned" BOOLEAN NOT NULL DEFAULT false,
  "contractPdfUrl" TEXT,
  "provenance" TEXT NOT NULL CHECK ("provenance" IN ('MOCK_SIMULATION', 'DHMAD_SANDBOX')),
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderEscrow_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "PaymentObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProviderEscrow_provider_environment_externalReference_key" ON "ProviderEscrow"("provider", "environment", "externalReference");
CREATE UNIQUE INDEX "ProviderEscrow_provider_environment_externalEscrowId_key" ON "ProviderEscrow"("provider", "environment", "externalEscrowId")
  WHERE "externalEscrowId" IS NOT NULL;
CREATE INDEX "ProviderEscrow_externalEscrowId_idx" ON "ProviderEscrow"("externalEscrowId");
CREATE INDEX "ProviderEscrow_status_lastSyncedAt_idx" ON "ProviderEscrow"("status", "lastSyncedAt");

CREATE TABLE "ProviderOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "obligationId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED_DEFINITIVE', 'AMBIGUOUS_QUARANTINED')),
  "requestSummary" JSONB NOT NULL,
  "responseSummary" JSONB,
  "errorCode" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 1 CHECK ("attemptCount" >= 1),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderOperation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "PaymentObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProviderOperation_operationType_idempotencyKey_key" ON "ProviderOperation"("operationType", "idempotencyKey");
CREATE INDEX "ProviderOperation_obligationId_createdAt_idx" ON "ProviderOperation"("obligationId", "createdAt");

CREATE TABLE "CheckoutSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "escrowId" TEXT NOT NULL,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('mock', 'dhmad')),
  "environment" TEXT NOT NULL CHECK ("environment" IN ('mock', 'sandbox')),
  "action" TEXT NOT NULL,
  "targetUserEmail" TEXT NOT NULL,
  "externalSessionId" TEXT,
  "checkoutUrl" TEXT,
  "redirectUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutSession_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "ProviderEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CheckoutSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CheckoutSession_escrowId_createdAt_idx" ON "CheckoutSession"("escrowId", "createdAt");
CREATE INDEX "CheckoutSession_externalSessionId_idx" ON "CheckoutSession"("externalSessionId");

CREATE TABLE "ArtisanIdentityVerification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "artisanProfileId" TEXT NOT NULL,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('mock', 'dhmad')),
  "environment" TEXT NOT NULL CHECK ("environment" IN ('mock', 'sandbox')),
  "externalVerificationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "consentRecordedAt" TIMESTAMP(3) NOT NULL,
  "consentActorId" TEXT NOT NULL,
  "kycStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("kycStatus" IN ('PENDING', 'APPROVED', 'REJECTED')),
  "claimStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("claimStatus" IN ('PENDING', 'LINKED')),
  "needsAdminReview" BOOLEAN NOT NULL DEFAULT false,
  "linkedUserId" TEXT,
  "provenance" TEXT NOT NULL CHECK ("provenance" IN ('MOCK_SIMULATION', 'DHMAD_SANDBOX')),
  "adminReviewedById" TEXT,
  "adminReviewNote" TEXT,
  "adminReviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtisanIdentityVerification_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArtisanIdentityVerification_consentActorId_fkey" FOREIGN KEY ("consentActorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArtisanIdentityVerification_adminReviewedById_fkey" FOREIGN KEY ("adminReviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ArtisanIdentityVerification_provider_environment_externalVerificationId_key"
  ON "ArtisanIdentityVerification"("provider", "environment", "externalVerificationId");
CREATE INDEX "ArtisanIdentityVerification_artisanProfileId_createdAt_idx"
  ON "ArtisanIdentityVerification"("artisanProfileId", "createdAt");

CREATE TABLE "ProviderDispute" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "obligationId" TEXT NOT NULL,
  "escrowId" TEXT NOT NULL,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('mock', 'dhmad')),
  "environment" TEXT NOT NULL CHECK ("environment" IN ('mock', 'sandbox')),
  "externalDisputeId" TEXT,
  "ticketNumber" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'escrow_dispute',
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'UNDER_REVIEW', 'CLOSED')),
  "outcome" TEXT,
  "reason" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderDispute_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "PaymentObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProviderDispute_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "ProviderEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProviderDispute_obligationId_status_idx" ON "ProviderDispute"("obligationId", "status");
CREATE INDEX "ProviderDispute_externalDisputeId_idx" ON "ProviderDispute"("externalDisputeId");

CREATE TABLE "WebhookInboxEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('mock', 'dhmad')),
  "environment" TEXT NOT NULL CHECK ("environment" IN ('mock', 'sandbox')),
  "webhookId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventTimestamp" TIMESTAMP(3) NOT NULL,
  "signatureVerified" BOOLEAN NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED' CHECK ("status" IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'RETRY', 'QUARANTINED', 'IGNORED_DUPLICATE')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "WebhookInboxEvent_provider_environment_webhookId_key" ON "WebhookInboxEvent"("provider", "environment", "webhookId");
CREATE INDEX "WebhookInboxEvent_status_nextAttemptAt_idx" ON "WebhookInboxEvent"("status", "nextAttemptAt");

CREATE TABLE "JournalBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "obligationId" TEXT,
  "payoutSimulationId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "provenance" TEXT NOT NULL CHECK ("provenance" IN ('MOCK_SIMULATION', 'DHMAD_SANDBOX')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalBatch_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "PaymentObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "JournalBatch_obligationId_createdAt_idx" ON "JournalBatch"("obligationId", "createdAt");
CREATE INDEX "JournalBatch_sourceType_sourceId_idx" ON "JournalBatch"("sourceType", "sourceId");

CREATE TABLE "JournalEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL CHECK ("accountCode" IN (
    'CUSTOMER_RECEIVABLE', 'ESCROW_HELD', 'PROVIDER_FEES_EXPENSE', 'NASJ_SETTLED_CLEARING',
    'ARTISAN_PAYABLE_LIABILITY', 'ARTISAN_PAYOUT_CLEARING', 'SIMULATED_CASH_OUT',
    'REFUND_LIABILITY', 'DISPUTE_HOLD', 'NASJ_CONTRIBUTION_RESERVE'
  )),
  "side" TEXT NOT NULL CHECK ("side" IN ('DEBIT', 'CREDIT')),
  "amountMillimes" BIGINT NOT NULL CHECK ("amountMillimes" > 0),
  "currency" TEXT NOT NULL DEFAULT 'TND' CHECK ("currency" = 'TND'),
  "artisanProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "JournalBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "JournalEntry_batchId_idx" ON "JournalEntry"("batchId");
CREATE INDEX "JournalEntry_accountCode_createdAt_idx" ON "JournalEntry"("accountCode", "createdAt");
CREATE INDEX "JournalEntry_artisanProfileId_createdAt_idx" ON "JournalEntry"("artisanProfileId", "createdAt");

CREATE TABLE "ArtisanPayoutSimulation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payoutRequestId" TEXT NOT NULL,
  "artisanProfileId" TEXT NOT NULL,
  "amountMillimes" BIGINT NOT NULL CHECK ("amountMillimes" > 0),
  "currency" TEXT NOT NULL DEFAULT 'TND' CHECK ("currency" = 'TND'),
  "mode" TEXT NOT NULL DEFAULT 'SIMULATION' CHECK ("mode" = 'SIMULATION'),
  "isSimulated" BOOLEAN NOT NULL DEFAULT true CHECK ("isSimulated" = true),
  "provenance" TEXT NOT NULL DEFAULT 'SIMULATED_SANDBOX_ONLY' CHECK ("provenance" = 'SIMULATED_SANDBOX_ONLY'),
  "reference" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'PAYOUT_SCHEDULED' CHECK ("status" IN (
    'PAYOUT_SCHEDULED', 'PAYOUT_PROCESSING', 'PAID', 'FAILED', 'ON_HOLD', 'REVERSED'
  )),
  "reason" TEXT NOT NULL,
  "executedById" TEXT NOT NULL,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtisanPayoutSimulation_payoutRequestId_fkey" FOREIGN KEY ("payoutRequestId") REFERENCES "PayoutRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArtisanPayoutSimulation_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArtisanPayoutSimulation_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ArtisanPayoutSimulation_payoutRequestId_idx" ON "ArtisanPayoutSimulation"("payoutRequestId");
CREATE INDEX "ArtisanPayoutSimulation_artisanProfileId_createdAt_idx" ON "ArtisanPayoutSimulation"("artisanProfileId", "createdAt");
CREATE UNIQUE INDEX "ArtisanPayoutSimulation_active_payout_key" ON "ArtisanPayoutSimulation"("payoutRequestId")
  WHERE "status" IN ('PAYOUT_SCHEDULED', 'PAYOUT_PROCESSING', 'PAID');

CREATE TABLE "ReconciliationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('mock', 'dhmad')),
  "environment" TEXT NOT NULL CHECK ("environment" IN ('mock', 'sandbox')),
  "triggeredById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "checkedCount" INTEGER NOT NULL DEFAULT 0,
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ReconciliationRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ReconciliationDiscrepancy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "obligationId" TEXT,
  "kind" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'HIGH' CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  "details" JSONB NOT NULL,
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationDiscrepancy_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReconciliationDiscrepancy_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "PaymentObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReconciliationDiscrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ReconciliationDiscrepancy_status_createdAt_idx" ON "ReconciliationDiscrepancy"("status", "createdAt");
CREATE INDEX "ReconciliationDiscrepancy_obligationId_idx" ON "ReconciliationDiscrepancy"("obligationId");

-- Append-only ledger protection & deferred double-entry balancing trigger.
CREATE FUNCTION journal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial journal batches and entries are append-only';
END $$;

CREATE TRIGGER "JournalBatch_immutable" BEFORE UPDATE OR DELETE ON "JournalBatch"
  FOR EACH ROW EXECUTE FUNCTION journal_immutable();
CREATE TRIGGER "JournalEntry_immutable" BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION journal_immutable();

CREATE FUNCTION journal_batch_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  debits NUMERIC;
  credits NUMERIC;
  line_count INTEGER;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN "side" = 'DEBIT' THEN "amountMillimes"::NUMERIC ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN "side" = 'CREDIT' THEN "amountMillimes"::NUMERIC ELSE 0 END), 0),
    COUNT(*)
  INTO debits, credits, line_count
  FROM "JournalEntry"
  WHERE "batchId" = NEW."batchId";
  IF line_count < 2 OR debits <> credits OR debits <= 0 THEN
    RAISE EXCEPTION 'Journal batch % must balance with positive equal debits and credits', NEW."batchId";
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "JournalEntry_balanced_deferred"
  AFTER INSERT ON "JournalEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_batch_balanced();
