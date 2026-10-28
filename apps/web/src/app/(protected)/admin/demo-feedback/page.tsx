import { DemoFeedbackAdmin } from '@/components/demo-feedback-admin';
import { FoundationGate } from '@/components/foundation-gate';
export const metadata = { title: 'Showroom feedback' };
export default function Page() {
  return (
    <FoundationGate persona="PLATFORM_ADMIN">
      <DemoFeedbackAdmin />
    </FoundationGate>
  );
}
