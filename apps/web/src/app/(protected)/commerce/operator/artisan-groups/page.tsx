import { CommerceGate } from '@/components/foundation-gate';
import { ArtisanGroups } from '@/components/artisan-groups';
export const metadata = { title: 'Synthetic artisan groups' };
export default function Page() {
  return (
    <CommerceGate mode="operator">
      <ArtisanGroups />
    </CommerceGate>
  );
}
