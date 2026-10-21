import { OperatorDashboard } from '@/components/foundation-workspace';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="nasj_OPERATOR">
      <OperatorDashboard />
    </FoundationGate>
  );
}
