/** Public, identity-free narration. No operational state or user data belongs here. */
export const presentationScenes = [
  {
    id: 'problem',
    label: 'The problem',
    eyebrow: '01 / Start with the coordination gap',
    title: 'Beautiful work. A difficult route to market.',
    message:
      'What if a buyer request could become a clear, voluntary and traceable production journey?',
    body: 'Fragmented buyer access, unclear production coordination and limited traceability are the problems this concept explores. Their prevalence and impact still need direct field research.',
    points: ['Buyer access', 'Production coordination', 'Product traceability'],
    status: 'PROPOSED',
    source: '/evidence#concept',
    objective: 'Frame a testable problem without invented statistics.',
    narration:
      'Embroidery brings skilled work to a finished product. NASJ explores the coordination around that work: how a commercial request reaches producers, how commitments stay voluntary, and how delivery can be traced. These are problem hypotheses awaiting interviews and a controlled pilot.',
    timing: '16–20 seconds',
    action: 'Introduce the three coordination gaps; do not imply measured prevalence.',
    evidence: 'Public concept register; discovery and pilot gates in the backlog.',
    limitation:
      'No market-size estimate, interview result or measured income effect is established.',
  },
  {
    id: 'opportunity',
    label: 'The opportunity',
    eyebrow: '02 / A business hypothesis to test',
    title: 'A managed B2B path, with clear commitments.',
    message:
      'Connect commercial demand to organized production while making constraints visible before promises are made.',
    body: 'The proposed service coordinates buyer requirements, feasibility, explicit pricing, voluntary offers and quality review. A working software journey demonstrates the mechanism; it does not verify buyer demand or a viable market.',
    points: ['Clarify requirements', 'Check feasibility', 'Make terms explicit'],
    status: 'PROPOSED',
    source: '/evidence#concept',
    objective: 'Distinguish the proposed commercial model from demand validation.',
    narration:
      'The opportunity is a managed business-to-business service. Instead of an unexplained marketplace match, the model makes requirements, feasibility and compensation explicit. Software can demonstrate that coordination. Buyers, partners and unit economics must still be validated.',
    timing: '14–18 seconds',
    action: 'Point to the requirement, feasibility and terms sequence.',
    evidence: 'Concept and methodology register; implemented procurement workflow.',
    limitation: 'No verified customer pipeline, association partnership or profitability claim.',
  },
  {
    id: 'concept',
    label: 'The concept',
    eyebrow: '03 / Introducing NASJ',
    title: 'One coordinated journey. Independent decisions.',
    message:
      'Commercial buyers → NASJ coordination → artisan associations → voluntary production → quality-reviewed products.',
    body: 'Association support helps organize work. Each authenticated artisan retains their own offer decision; assistance cannot silently become acceptance.',
    points: [
      'Commercial buyers',
      'NASJ coordination',
      'Artisan associations',
      'Voluntary artisan production',
      'Quality-reviewed products',
    ],
    status: 'PROPOSED',
    source: '/evidence#concept',
    objective: 'Explain the participation model and the boundaries of coordination.',
    narration:
      'NASJ connects commercial buyers, a coordination team and artisan associations. Production begins with an explicit offer and a voluntary artisan decision. Quality review and delivery complete the proposed product journey. Association coordination does not replace individual consent.',
    timing: '16–20 seconds',
    action: 'Follow the vertical concept diagram from buyer to finished product.',
    evidence: 'Consent and offer controls in the software evidence register.',
    limitation:
      'The diagram is a proposed operating model, not evidence of an active partner network.',
  },
  {
    id: 'workflow',
    label: 'How it works',
    eyebrow: '04 / The actual software workflow',
    title: 'From a request to an accountable delivery.',
    message: 'A shared order connects the commercial, production, quality and delivery workspaces.',
    body: 'Quotation acceptance, production offers, artisan decisions, progress, quality inspection and buyer delivery confirmation are recorded through the API. Inventory readiness and unresolved obligations remain visible blockers.',
    points: [
      'Request & quotation',
      'Feasibility & offers',
      'Voluntary acceptance',
      'Production & quality',
      'Delivery & obligations',
    ],
    status: 'SYNTHETIC',
    source: '/evidence#software',
    objective: 'Show the implemented domain sequence without implying real-world fulfillment.',
    narration:
      'The prototype carries one order through quotation, production offers, acceptance, progress, quality review and delivery confirmation. Each role sees its scoped part of the same records. Recorded progress is synthetic evidence of software behavior; it is not proof of manufactured or delivered goods.',
    timing: '18–22 seconds',
    action: 'Explore a workflow stage, then continue to participation.',
    evidence: 'API-backed isolated demo and regression scenarios.',
    limitation:
      'Synthetic records do not establish physical production, delivery or settled payment.',
  },
  {
    id: 'participation',
    label: 'Artisan participation',
    eyebrow: '05 / Participation stays voluntary',
    title: 'An offer is a choice. Compensation is explicit.',
    message:
      'Capacity declarations inform planning. Agreed terms remain visible. Coordinators have their own attributed scope.',
    body: 'Authenticated artisans accept or decline their own offers and review compensation statements. Association assistance is recorded separately. Accountless acceptance remains pending verification and cannot create production work.',
    points: [
      'Declare your capacity',
      'Review the offer and terms',
      'Accept or decline independently',
      'See obligations and raise a claim',
    ],
    status: 'SYNTHETIC',
    source: '/evidence#software',
    objective: 'Explain autonomy, compensation visibility and accountless limits.',
    narration:
      'Artisans declare their capacity independently and review explicit compensation terms before choosing an offer. Their statement separates agreed, earned, payable and verified-paid amounts. Coordinator help has separate attribution. An accountless report cannot become verified acceptance or silently waive a payment claim.',
    timing: '18–22 seconds',
    action: 'Highlight the independent decision and accountless verification boundary.',
    evidence: 'Artisan offer, statement and dispute workflows; scoped coordinator controls.',
    limitation: 'No wage adequacy, observed usability or verified paid-income result is claimed.',
  },
  {
    id: 'technology',
    label: 'The technology',
    eyebrow: '06 / Built on explicit boundaries',
    title: 'Real software. Inspectable domain controls.',
    message:
      'Next.js interfaces, NestJS domain APIs and PostgreSQL records, connected through Prisma and Better Auth.',
    body: 'Authentication, tenant scope and business permissions protect each operation. Inventory custody, immutable payables and evidence provenance stay distinct from a scenario model. Optional AI and safety concepts are outside this runtime.',
    points: [
      'Next.js · role workspaces',
      'Better Auth · sessions',
      'NestJS · authorization & domain APIs',
      'Prisma · transactional persistence',
      'PostgreSQL · constraints & history',
    ],
    status: 'SYNTHETIC',
    source: '/evidence#software',
    objective: 'Present the actual website architecture with no unimplemented integration claims.',
    narration:
      'Next.js supplies the role interfaces. Better Auth manages sessions, while NestJS checks business scope at the API. Prisma and PostgreSQL persist transactions, constraints and history. This website does not depend on a claimed AI model integration or validated wearable hardware.',
    timing: '16–20 seconds',
    action: 'Trace the architecture layers and the authorization boundary.',
    evidence: 'Repository packages, authentication modules and domain regression suites.',
    limitation:
      'The architecture demonstrates software design; it is not deployment, security certification or hardware validation.',
  },
  {
    id: 'demo',
    label: 'Working demonstration',
    eyebrow: '07 / Follow one shared synthetic order',
    title: 'Six perspectives. The same order.',
    message:
      'Switch roles in your isolated visitor scenario and inspect the same business records.',
    body: 'Buyer, association coordinator, artisan, production manager, quality inspector and financial reviewer work within distinct permissions. The demo uses real API transactions in isolated synthetic organizations. Normal production mode rejects anonymous persona switching.',
    points: [
      'Buyer',
      'Association coordinator',
      'Artisan',
      'Production manager',
      'Quality inspector',
      'Financial reviewer',
    ],
    status: 'SYNTHETIC',
    source: '/evidence#scenario',
    objective: 'Move from narrative into the actual isolated showroom.',
    narration:
      'The demonstration is a visitor-isolated scenario with six synthetic personas. They share the same order rather than separate mock dashboards. Open the demo to follow scoped buyer, coordinator, artisan, production, quality and finance views. Changing roles does not grant the previous role’s access.',
    timing: '16–20 seconds; pause for a separate live walkthrough',
    action: 'Open the working demo. Use its persona switcher and return to this scene afterward.',
    evidence: 'Demo generation, isolation and shared-order API/browser scenarios.',
    limitation:
      'Demo availability requires isolated demo mode; generated identities and records are fictional.',
  },
  {
    id: 'transparency',
    label: 'Transparency',
    eyebrow: '08 / Follow the product, protect the person',
    title: 'Traceability with evidence and privacy attached.',
    message:
      'Quality-approved quantities, public QR summaries and producer-share methodology each have a defined meaning.',
    body: 'Public craft summaries suppress private artisan and buyer data. Producer share describes modeled or recorded compensation relative to the disclosed basis; it is not verified paid income. Manual execution reports do not establish a bank transfer. Verified paid remains zero.',
    points: [
      'Quality review before approved units',
      'Privacy-safe public QR',
      'Disclosed producer-share basis',
      'Provenance on every public claim',
    ],
    status: 'SYNTHETIC',
    source: '/evidence#producer-share',
    objective: 'Make the provenance and financial interpretation limits memorable.',
    narration:
      'Traceability should show what a record actually supports. Quality review precedes approved units, and public QR pages protect personal information. Producer share has a disclosed calculation basis. It is not evidence that money reached a producer. All execution reports remain unverified and verified paid stays zero.',
    timing: '18–22 seconds',
    action: 'Open the producer-share source if the audience asks about the denominator.',
    evidence:
      'Public traceability projection, producer-share policy and payments evidence register.',
    limitation:
      'No physical certification, actual bank settlement or verified income uplift is established.',
  },
  {
    id: 'finance',
    label: 'Financial scenarios',
    eyebrow: '09 / Challenge the assumptions',
    title: 'Change an assumption. Inspect the trade-off.',
    message: 'Compare modeled revenue, costs, compensation and margin using exact TND arithmetic.',
    body: 'The simulator is separate from commercial commitments. Its assumptions are editable, its outputs are synthetic, and changes do not alter quotations, payables or payment records.',
    points: ['Baseline', 'Optimistic', 'Conservative', 'Custom assumptions'],
    status: 'SYNTHETIC',
    source: '/evidence#methodology',
    objective: 'Demonstrate financial sensitivity without presenting a forecast as a result.',
    narration:
      'The financial model makes assumptions available for challenge. Compare a baseline with optimistic, conservative or custom inputs. Revenue, direct costs, artisan compensation and margin recalculate in exact Tunisian millimes. These are modeled scenarios, not actual sales, investment advice or verified operating performance.',
    timing: '18–22 seconds; optional live parameter change',
    action: 'Adjust a simulator assumption or open the complete comparison workspace.',
    evidence: 'Pure financial model tests, comparison interface and methodology register.',
    limitation:
      'No validated demand, settled income or approved tax and compensation policy is implied.',
  },
  {
    id: 'roadmap',
    label: 'Results & roadmap',
    eyebrow: '10 / Make the next proof possible',
    title: 'A working prototype. A clear path to stronger evidence.',
    message:
      'Make commitments explicit. Keep decisions voluntary. Let evidence earn the next step.',
    body: 'Implemented: connected role workflows and auditable software controls. Simulated: identities, orders, stock and financial scenarios. Unverified: market demand, physical custody, live bank settlement and operating outcomes. Next: owner review, field research, approved operating policies and a separately authorized controlled pilot.',
    points: [
      'Review the software',
      'Validate needs with consent',
      'Approve operational policies',
      'Authorize a controlled pilot',
    ],
    status: 'PROPOSED',
    source: '/evidence#limitations',
    objective: 'Close with an accurate implementation boundary and next evidence milestones.',
    narration:
      'Today there is a working software prototype with connected workflows and explicit controls. Its people, orders, stock and financial scenarios are synthetic. Demand, real custody, settlement and operating outcomes remain unverified. The next milestones are owner review, consent-based research, approved policies and an authorized controlled pilot.',
    timing: '18–22 seconds',
    action: 'Offer the evidence register and working demo for inspection.',
    evidence: 'Batch implementation reports, acceptance matrix and limitations register.',
    limitation:
      'Passing software tests do not establish pilot readiness, owner acceptance or submission compliance.',
  },
] as const;

export type PresentationScene = (typeof presentationScenes)[number];
export const presentationProgressKey = 'nasj.presentation.scene.v1'; // gitleaks:allow -- Public local-storage namespace, never a credential.
