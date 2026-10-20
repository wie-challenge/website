import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { disposableDatabase } from './support.js';
const exec = promisify(execFile);
async function snapshot(url: string) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const result: Record<string, { count: number; sha256: string }> = {};
    for (const { tablename } of tables.rows) {
      const escaped = tablename.replaceAll('"', '""');
      const rows = await client.query<{ row: string }>(
        `SELECT row_to_json(t)::text AS row FROM "${escaped}" t`,
      );
      result[tablename] = {
        count: rows.rowCount ?? 0,
        sha256: createHash('sha256')
          .update(
            rows.rows
              .map((row) => row.row)
              .sort()
              .join('\n'),
          )
          .digest('hex'),
      };
    }
    return result;
  } finally {
    await client.end();
  }
}
// Only accepts containers created by the test harness; no production URL or restore target input.
export async function runRestoreScenario(
  source: Awaited<ReturnType<typeof disposableDatabase>>,
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  await check(
    'E16 real pg_dump/pg_restore preserves every table in an isolated synthetic database',
    async () => {
      if (!/^hirfacare-test-[a-f0-9]{16}$/.test(source.containerName))
        throw new Error('Disposable source required.');
      const target = await disposableDatabase();
      const directory = await mkdtemp(join(tmpdir(), 'hirfacare-restore-'));
      try {
        const before = await snapshot(source.url);
        const started = performance.now();
        const { stdout } = await exec(
          'docker',
          [
            '--context',
            'default',
            'exec',
            source.containerName,
            'pg_dump',
            '-U',
            'foundation_test',
            '-Fc',
            'foundation_test',
          ],
          { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
        );
        const archive = join(directory, 'synthetic.dump');
        await writeFile(archive, stdout, { mode: 0o600 });
        const backupMs = Math.round(performance.now() - started);
        await exec('docker', [
          '--context',
          'default',
          'cp',
          archive,
          `${target.containerName}:/tmp/synthetic.dump`,
        ]);
        const restoreStarted = performance.now();
        await exec('docker', [
          '--context',
          'default',
          'exec',
          target.containerName,
          'pg_restore',
          '-U',
          'foundation_test',
          '-d',
          'foundation_test',
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-acl',
          '--exit-on-error',
          '/tmp/synthetic.dump',
        ]);
        const restored = await snapshot(target.url);
        assert.deepEqual(restored, before);
        assert.ok(before.User.count > 0);
        assert.ok(before.AuditEvent.count > 0);
        assert.ok(before.OutboxEvent.count > 0);
        console.log(
          JSON.stringify({
            evidence: 'DISPOSABLE_SYNTHETIC_RESTORE',
            tables: Object.keys(before).length,
            rows: Object.values(before).reduce((total, table) => total + table.count, 0),
            backupMs,
            restoreAndVerifyMs: Math.round(performance.now() - restoreStarted),
            archiveBytes: stdout.length,
          }),
        );
      } finally {
        await target.stop();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
