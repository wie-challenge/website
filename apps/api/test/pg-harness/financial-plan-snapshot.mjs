// Isolated PostgreSQL-compatible PGlite migration constraint checks; no application database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { PGlite } = await import(
  resolve(
    root,
    'node_modules/.pnpm/@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite/dist/index.js',
  )
);
const db = new PGlite();
await db.waitReady;
try {
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY);
    CREATE TABLE "ArtisanProfile" (id TEXT PRIMARY KEY);
    CREATE TABLE "ProcurementQuote" (id TEXT PRIMARY KEY, "totalMillimes" BIGINT NOT NULL);
    CREATE TABLE "ProcurementAcceptance" (id TEXT PRIMARY KEY, "quoteId" TEXT NOT NULL REFERENCES "ProcurementQuote"(id));
    INSERT INTO "User" VALUES ('maker'), ('checker');
    INSERT INTO "ArtisanProfile" VALUES ('a'), ('b');
    INSERT INTO "ProcurementQuote" VALUES ('q', 2000000);
    INSERT INTO "ProcurementAcceptance" VALUES ('acceptance', 'q');
  `);
  await db.exec(
    await readFile(
      resolve(
        root,
        'apps/api/prisma/migrations/20261127000100_financial_plan_snapshot/migration.sql',
      ),
      'utf8',
    ),
  );
  const insert = `INSERT INTO "FinancialPlanSnapshot"
    (id, "acceptanceId", revision, "previousId", "preparedById", "approvedById",
    "customerPriceMillimes", currency, "policyVersion", "calculationBase", "baseMillimes",
    "materialCostMillimes", "otherDirectCostMillimes", "processingFeeMillimes", "contributionMillimes", allocations, "approvalReason")
    VALUES ($1, 'acceptance', $2, $3, 'maker', $4, $5, 'TND', 1, 'GROSS', $6, 100000, 100000, 100000, $7, $8::jsonb, 'Approved')`;
  const allocations = JSON.stringify([
    { artisanProfileId: 'a', basisPoints: 3000, amountMillimes: '600000' },
    { artisanProfileId: 'b', basisPoints: 2500, amountMillimes: '500000' },
  ]);
  const add = (id, revision, previous, checker, price, base, contribution, rows = allocations) =>
    db.query(insert, [id, revision, previous, checker, price, base, contribution, rows]);
  await add('first', 1, null, 'checker', 2000000, 2000000, 600000);
  await assert.rejects(add('bad-price', 2, 'first', 'checker', 1999999, 1999999, 600000));
  await assert.rejects(add('bad-base', 2, 'first', 'checker', 2000000, 1999999, 600000));
  await assert.rejects(add('self', 2, 'first', 'maker', 2000000, 2000000, 600000));
  await assert.rejects(add('bad-previous', 3, 'first', 'checker', 2000000, 2000000, 600000));
  await assert.rejects(
    add(
      'duplicate-artisan',
      2,
      'first',
      'checker',
      2000000,
      2000000,
      600000,
      JSON.stringify([
        { artisanProfileId: 'a', basisPoints: 3000, amountMillimes: '600000' },
        { artisanProfileId: 'a', basisPoints: 2500, amountMillimes: '500000' },
      ]),
    ),
  );
  await assert.rejects(
    add(
      'bad-amount',
      2,
      'first',
      'checker',
      2000000,
      2000000,
      600000,
      JSON.stringify([{ artisanProfileId: 'a', basisPoints: 3000, amountMillimes: '600001' }]),
    ),
  );
  await assert.rejects(add('bad-contribution', 2, 'first', 'checker', 2000000, 2000000, 600001));
  await assert.rejects(
    db.exec(`UPDATE "FinancialPlanSnapshot" SET "approvalReason"='changed' WHERE id='first'`),
  );
  await assert.rejects(db.exec(`DELETE FROM "FinancialPlanSnapshot" WHERE id='first'`));
  await add('second', 2, 'first', 'checker', 2000000, 2000000, 600000);
  await assert.rejects(add('fork', 2, 'first', 'checker', 2000000, 2000000, 600000));
  const result = await db.query('SELECT count(*)::int AS count FROM "FinancialPlanSnapshot"');
  assert.equal(result.rows[0].count, 2);
  console.log(
    'PASS financial plan snapshot: accepted multi-artisan allocation, rejected invalid values, immutable history and revision fork',
  );
} finally {
  await db.close();
}
