import { z } from 'zod';
export const demoPersonas = [
  'buyer',
  'artisan',
  'coordinator',
  'production',
  'qa',
  'finance',
] as const;
export type DemoPersona = (typeof demoPersonas)[number];
export const demoStartSchema = z.object({}).strict();
export const demoSwitchSchema = z
  .object({ persona: z.enum([...demoPersonas, 'operator']) })
  .strict();
export const demoResetSchema = z
  .object({
    scenarioId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    generation: z.number().int().positive(),
    confirm: z.literal(true),
  })
  .strict();
export type DemoResetInput = z.infer<typeof demoResetSchema>;
export interface DemoTotals {
  rfqs: number;
  quotations: number;
  orders: number;
  offers: number;
  acceptedCommitments: number;
  committedPieces: number;
  capacityReserved: string;
  produced: number;
  qualityApproved: number;
  prepared: number;
  shipments: number;
  delivered: number;
  payables: number;
  payableMillimes: string;
  simulations: number;
  simulatedMillimes: string;
  verifiedPaidMillimes: string;
  inventoryLots: number;
  inventoryReservedMilli: string;
  publishedQr: number;
  allocationPlans: number;
  productSpecifications: number;
  sampleRequests: number;
  samplePayables: number;
  productionExceptions: number;
  discussions: number;
  supportTickets: number;
  notificationDeliveries: number;
}
export interface DemoScenarioView {
  id: string;
  generation: number;
  version: number;
  provenance: 'SYNTHETIC';
  rfqId: string;
  quoteId: string;
  orderId: string | null;
  linkedArtisanId: string;
  accountlessArtisanId: string;
  buyerOrganizationId: string;
  operatorOrganizationId: string;
  associationOrganizationId: string;
  craftSkillId: string;
  stage:
    | 'Commercial Decision'
    | 'Artisan Offers'
    | 'Production'
    | 'Quality'
    | 'Logistics'
    | 'Traceability'
    | 'Finance';
  periodFrom: string;
  periodTo: string;
  offerExpiresAt: string;
  deliveryAt: string;
  initialTotals: DemoTotals;
  totals: DemoTotals;
  createdAt: string;
}
export interface DemoSessionView {
  available: boolean;
  csrfToken?: string;
  scenario: DemoScenarioView | null;
  personas: { id: DemoPersona; label: string; workspacePath: string }[];
  activePersona: DemoPersona | null;
  limitations: string[];
}
