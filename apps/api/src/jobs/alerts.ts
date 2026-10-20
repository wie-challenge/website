// Fixed codes are suitable for supervisor alerts; never include provider exception text.
export function operationalAlerts(input: {
  ready: boolean;
  oldestPendingAgeMs: number;
  failedCount: number;
}) {
  const alerts: string[] = [];
  if (!input.ready) alerts.push('API_NOT_READY');
  if (input.failedCount > 0) alerts.push('OUTBOX_FAILED');
  if (input.oldestPendingAgeMs > 300000) alerts.push('OUTBOX_LAG');
  return alerts;
}
