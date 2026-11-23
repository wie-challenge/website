import {
  organizationDocumentPurposes,
  type OrganizationVerificationDocuments,
} from '@nasj/contracts';
import type { Db } from '../foundation/transaction.js';

export async function organizationVerificationDocuments(db: Db, organizationIds: string[]) {
  const files = await db.marketFile.findMany({
    where: {
      organizationId: { in: organizationIds },
      purpose: { in: [...organizationDocumentPurposes] },
    },
    select: { id: true, filename: true, purpose: true, organizationId: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    distinct: ['organizationId', 'purpose'],
  });
  const documents = new Map<string, OrganizationVerificationDocuments>();
  for (const file of files) {
    const entry = documents.get(file.organizationId) ?? { registration: null, authority: null };
    entry[file.purpose === 'ORG_REGISTRATION' ? 'registration' : 'authority'] = {
      id: file.id,
      filename: file.filename,
      url: `/api/v1/market/files/${file.id}`,
    };
    documents.set(file.organizationId, entry);
  }
  return documents;
}
