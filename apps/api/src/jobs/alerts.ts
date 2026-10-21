// Fixed codes are suitable for supervisor alerts; never include provider exception text.
export function operationalAlerts(input: {
  ready: boolean;
  oldestPendingAgeMs: number;
  failedCount: number;
  backupAgeMs?: number | null;
}) {
  const alerts: string[] = [];
  if (!input.ready) alerts.push('API_NOT_READY');
  if (input.failedCount > 0) alerts.push('OUTBOX_FAILED');
  if (input.oldestPendingAgeMs > 300000) alerts.push('OUTBOX_LAG');
  if (input.backupAgeMs === null) alerts.push('BACKUP_MISSING');
  else if (input.backupAgeMs !== undefined && input.backupAgeMs > 86400000)
    alerts.push('BACKUP_STALE');
  return alerts;
}
