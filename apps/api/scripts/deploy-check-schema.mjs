// Exit 10 means unapplied migrations; all other errors are hard failures.
// Extra successfully applied migrations are allowed for compatible application rollback.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const directory = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
const db = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
try {
  const connection = new URL(process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(connection.protocol))
    throw new Error('An explicit PostgreSQL migration URL is required');
  await db.connect();
  let rows;
  try {
    ({ rows } = await db.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
    ));
  } catch (error) {
    if (error.code !== '42P01') throw error;
    rows = [];
  }
  if (rows.some((row) => !row.finished_at && !row.rolled_back_at))
    throw new Error('Unresolved failed migration');
  const applied = new Map(
    rows
      .filter((row) => row.finished_at && !row.rolled_back_at)
      .map((row) => [row.migration_name, row.checksum]),
  );
  const pending = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const sql = await readFile(`${directory}/${entry.name}/migration.sql`);
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (!applied.has(entry.name)) pending.push(entry.name);
    else if (applied.get(entry.name) !== checksum)
      throw new Error('Applied migration checksum mismatch');
  }
  if (pending.length) {
    console.log(`SCHEMA_PENDING count=${pending.length}`);
    process.exitCode = 10;
  } else console.log('SCHEMA_READY');
} catch {
  // No connection URL, SQL, provider message or credentials in logs.
  console.error(
    'SCHEMA_CHECK_FAILED: inspect migration history and database connectivity privately',
  );
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
