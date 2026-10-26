export type EvidenceStatus = 'verified' | 'proposed' | 'synthetic' | 'simulated';

export type EvidenceSource = {
  label: string;
  path: string;
  href: string;
};

type VerifiedClaim = {
  id: string;
  text: string;
  status: 'verified';
  sources: readonly [EvidenceSource, ...EvidenceSource[]];
};

type UnverifiedClaim = {
  id: string;
  text: string;
  status: Exclude<EvidenceStatus, 'verified'>;
  sources?: readonly EvidenceSource[];
};

export type EvidenceClaimData = VerifiedClaim | UnverifiedClaim;

const source = (path: string, label: string): EvidenceSource => ({
  label,
  path,
  href: `https://github.com/wie-challenge/website/blob/main/${path}`,
});

const commerceArchitecture = source(
  'docs/architecture/commerce.md',
  'Synthetic commerce architecture',
);
const developmentGuide = source('docs/development/README.md', 'Development guide');

export const presentationModePath = 'TODO(team): add the presentation mode route';

export const landingContent = {
  brand: {
    id: 'brand-name',
    text: 'HirfaCare is the working name for this concept.',
    status: 'proposed',
  },
  hero: {
    eyebrow: 'Concept direction',
    title: 'A clearer path from buyer request to artisan supply.',
    claim: {
      id: 'managed-supply-hypothesis',
      text: 'We propose testing a managed supply flow that connects buyer requests with voluntary artisan offers.',
      status: 'proposed',
    },
  },
  navigation: [
    { label: 'The problem', href: '#problem' },
    { label: 'How it could work', href: '#model' },
    { label: 'Two tracks', href: '#tracks' },
    { label: 'Evidence and limits', href: '#evidence' },
  ],
  workflowNote: {
    id: 'workflow-not-a-promise',
    text: 'This prototype models steps; it does not promise available supply or delivery.',
    status: 'verified',
    sources: [commerceArchitecture],
  },
  problems: [
    {
      id: 'buyer-problem',
      title: 'For buyers',
      claim: {
        id: 'buyer-problem-hypothesis',
        text: 'Finding a reliable path from a craft request to a delivered order may take more coordination than buyers expect.',
        status: 'proposed',
      },
      prompt: 'Hypothesis to test: where does sourcing handmade goods become difficult?',
    },
    {
      id: 'artisan-problem',
      title: 'For artisans',
      claim: {
        id: 'artisan-problem-hypothesis',
        text: 'Artisans may benefit from clearer requests and a fair chance to decide whether to offer their work.',
        status: 'proposed',
      },
      prompt: 'Hypothesis to test: what makes an order understandable, voluntary and workable?',
    },
  ],
  workflow: [
    {
      number: '01',
      title: 'A buyer sends a request',
      actor: 'Buyer',
      description: 'The buyer describes the item, quantity and requested delivery date.',
      claim: {
        id: 'rfq-step',
        text: 'The synthetic workflow begins with a buyer request for quote (RFQ).',
        status: 'verified',
        sources: [commerceArchitecture],
      },
    },
    {
      number: '02',
      title: 'The team reviews and quotes',
      actor: 'Production and finance',
      description: 'The team reviews the request and prepares a quote for the buyer to consider.',
      claim: {
        id: 'quote-step',
        text: 'Production reviews requests; finance prepares quotes in the current prototype workflow.',
        status: 'verified',
        sources: [commerceArchitecture],
      },
    },
    {
      number: '03',
      title: 'Artisans choose whether to offer',
      actor: 'Artisan',
      description:
        'An artisan can accept or decline an offer. Declining has no eligibility penalty.',
      claim: {
        id: 'voluntary-offer-step',
        text: 'Artisan offers are voluntary, and the artisan owner makes the decision.',
        status: 'verified',
        sources: [commerceArchitecture],
      },
    },
    {
      number: '04',
      title: 'Production and quality checks',
      actor: 'Artisan, production and QA',
      description: 'Accepted work is produced, submitted and checked against the order.',
      claim: {
        id: 'production-qa-step',
        text: 'The prototype separates artisan progress, production coordination and quality review.',
        status: 'verified',
        sources: [commerceArchitecture],
      },
    },
    {
      number: '05',
      title: 'Shipment and simulated settlement',
      actor: 'Logistics, buyer and finance',
      description:
        'The workflow records shipment and a simulated settlement; it does not move money.',
      claim: {
        id: 'shipment-settlement-step',
        text: 'Shipment and settlement are modeled in the prototype; settlement evidence is simulated.',
        status: 'simulated',
        sources: [commerceArchitecture],
      },
    },
  ],
  tracks: [
    {
      id: 'supply-track',
      label: 'Primary track',
      title: 'Managed product supply',
      description:
        'Make the request, quote, voluntary offer, production, quality check and shipment steps easier to understand.',
      claim: {
        id: 'primary-supply-track',
        text: 'The primary track is the synthetic supply-chain workflow already described by the project.',
        status: 'verified',
        sources: [commerceArchitecture, developmentGuide],
      },
    },
    {
      id: 'local-safety-track',
      label: 'Optional track',
      title: 'A local safety idea',
      description:
        'This idea is not defined or tested yet. If explored, it should remain separate from commerce; this page makes no claim about a device, alert or result.',
      claim: {
        id: 'local-safety-proposal',
        text: 'A separate local safety concept could be explored later; its purpose and behavior are still undefined.',
        status: 'proposed',
      },
    },
  ],
  discovery: [
    {
      id: 'discovery-evidence-gap',
      title: 'What still needs discovery',
      claim: {
        id: 'discovery-evidence-status',
        text: 'No interview, survey, field result or validated partner is cited for these problem statements.',
        status: 'proposed',
      },
      note: 'The problem statements and embroidery focus below remain hypotheses, not findings.',
      sources: [
        {
          label: 'Issue #16: concept story and proposed embroidery hypothesis',
          path: 'GitHub issue #16',
          href: 'https://github.com/wie-challenge/website/issues/16',
        },
        source('README.md', 'README: product documents live in a separate docs repository'),
        commerceArchitecture,
      ],
    },
    {
      id: 'embroidery-hypothesis',
      title: 'Embroidery is a hypothesis, not a result',
      claim: {
        id: 'embroidery-focus',
        text: 'Starting with embroidery may help test a focused supply model before considering other crafts.',
        status: 'proposed',
        sources: [
          {
            label: 'Issue #16: story brief, not discovery evidence',
            path: 'GitHub issue #16',
            href: 'https://github.com/wie-challenge/website/issues/16',
          },
        ],
      },
      note: 'No demand, partner, price, delivery result or customer quote is asserted.',
    },
  ],
  boundaries: [
    {
      id: 'synthetic-records',
      title: 'Fictional commercial records only',
      claim: {
        id: 'synthetic-record-boundary',
        text: 'The prototype uses isolated synthetic commercial records, not real orders or customer outcomes.',
        status: 'synthetic',
        sources: [commerceArchitecture, developmentGuide],
      },
    },
    {
      id: 'simulated-money',
      title: 'No real contracts or money movement',
      claim: {
        id: 'simulated-settlement-boundary',
        text: 'Settlement is simulated; the prototype does not execute contracts or transfer money.',
        status: 'simulated',
        sources: [commerceArchitecture],
      },
    },
    {
      id: 'personal-data',
      title: 'Personal data stays out of commerce',
      claim: {
        id: 'personal-data-boundary',
        text: 'Individual wearable data is not used in commerce.',
        status: 'verified',
        sources: [commerceArchitecture, developmentGuide],
      },
    },
  ],
  callsToAction: [
    {
      label: 'Explore the synthetic catalog',
      href: '/commerce/catalog',
      description: 'Sign-in may be required.',
    },
    {
      label: 'Open the buyer workspace',
      href: '/commerce/buyer',
      description: 'Protected route; synthetic workflow only.',
    },
  ],
} satisfies {
  brand: EvidenceClaimData;
  hero: { eyebrow: string; title: string; claim: EvidenceClaimData };
  workflowNote: EvidenceClaimData;
  navigation: { label: string; href: string }[];
  problems: {
    id: string;
    title: string;
    claim: EvidenceClaimData;
    prompt: string;
  }[];
  workflow: {
    number: string;
    title: string;
    actor: string;
    description: string;
    claim: EvidenceClaimData;
  }[];
  tracks: {
    id: string;
    label: string;
    title: string;
    description: string;
    claim: EvidenceClaimData;
  }[];
  discovery: {
    id: string;
    title: string;
    claim: EvidenceClaimData;
    note: string;
    sources?: readonly EvidenceSource[];
  }[];
  boundaries: {
    id: string;
    title: string;
    claim: EvidenceClaimData;
  }[];
  callsToAction: { label: string; href: string; description: string }[];
};
