import 'reflect-metadata';
import { PrismaService } from '../apps/api/src/database/prisma.service.js';
import { loadConfig } from '../apps/api/src/config/env.js';
import { outboxStatus } from '../apps/api/src/jobs/outbox.js';
import { operationalAlerts } from '../apps/api/src/jobs/alerts.js';
const config = loadConfig();
const db = new PrismaService(config);
try {
  const response = await fetch(`http://127.0.0.1:${config.API_PORT}/api/health/ready`, {
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  const status = await outboxStatus(db);
  const failedCount = status.counts.find((row) => row.status === 'FAILED')?._count ?? 0;
  const alerts = operationalAlerts({
    ready: response?.ok ?? false,
    oldestPendingAgeMs: status.oldestPendingAgeMs,
    failedCount,
  });
  console.log(
    JSON.stringify({ alerts, failedCount, oldestPendingAgeMs: status.oldestPendingAgeMs }),
  );
  process.exitCode = alerts.length ? 1 : 0;
} catch {
  console.log(JSON.stringify({ alerts: ['DATABASE_UNAVAILABLE'] }));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
