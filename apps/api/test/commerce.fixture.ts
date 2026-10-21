import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaService } from '../src/database/prisma.service.js';

// Called only by disposable integration/browser harnesses, never imported into application code.
export async function seedCommerceFixture(
  db: Pick<
    PrismaService,
    | 'organization'
    | 'organizationMember'
    | 'artisanProfile'
    | 'consentRecord'
    | 'capacityDeclaration'
  >,
  users: {
    buyerId: string;
    operatorId: string;
    artisanId: string;
    qualityId: string;
    outsiderId: string;
  },
  suffix: string,
) {
  const createOrg = async (
    type: 'BUYER_BUSINESS' | 'INTERNAL',
    userId: string,
    name: string,
    roles: (
      | 'BUYER'
      | 'PRODUCTION_MANAGER'
      | 'FINANCE_MANAGER'
      | 'QUALITY_INSPECTOR'
      | 'INVENTORY_LOGISTICS_COORDINATOR'
    )[],
  ) =>
    db.organization.create({
      data: {
        name,
        slug: `commerce-${suffix}-${type.toLowerCase()}-${userId}`,
        type,
        approvalStatus: 'APPROVED',
        country: 'TN',
        region: 'Tunis',
        description: 'Synthetic commerce regression fixture',
        contactEmail: 'fictional-commerce@example.com',
        representativeName: 'Synthetic representative',
        createdByUserId: userId,
        members: {
          create: {
            userId,
            isManager: true,
            roles: { create: roles.map((role) => ({ role, assignedByUserId: userId })) },
            ...(roles.includes('BUYER')
              ? {
                  permissionGrants: {
                    create: {
                      permission: 'buyer.quotation.approve',
                      grantedById: userId,
                      reason: 'Synthetic explicit approval authority fixture',
                    },
                  },
                }
              : {}),
          },
        },
      },
    });
  const buyer = await createOrg('BUYER_BUSINESS', users.buyerId, `Synthetic Buyer ${suffix}`, [
    'BUYER',
  ]);
  const operator = await createOrg('INTERNAL', users.operatorId, `Synthetic Operator ${suffix}`, [
    'PRODUCTION_MANAGER',
    'FINANCE_MANAGER',
    'QUALITY_INSPECTOR',
    'INVENTORY_LOGISTICS_COORDINATOR',
  ]);
  const outsider = await createOrg('BUYER_BUSINESS', users.outsiderId, `Other Buyer ${suffix}`, [
    'BUYER',
  ]);
  await db.organizationMember.create({
    data: {
      organizationId: operator.id,
      userId: users.qualityId,
      roles: { create: { role: 'QUALITY_INSPECTOR', assignedByUserId: users.operatorId } },
    },
  });
  const profile = await db.artisanProfile.create({
    data: {
      userId: users.artisanId,
      displayName: `Synthetic Artisan ${suffix}`,
      region: 'Tunis',
      equipment: [],
      skills: { create: { craftSkillId: 'weaving' } },
    },
  });
  await db.consentRecord.create({
    data: {
      userId: users.artisanId,
      purpose: 'artisan.profile',
      decision: true,
      policyVersion: 'artisan-profile-v1',
      collectionContext: 'synthetic_test_fixture',
    },
  });
  const now = Date.now();
  const capacity = await db.capacityDeclaration.create({
    data: {
      artisanProfileId: profile.id,
      craftSkillId: 'weaving',
      unitType: 'PIECES',
      quantity: '10',
      effectiveFrom: new Date(now - 86400000),
      effectiveTo: new Date(now + 8 * 86400000),
      declaredByUserId: users.artisanId,
    },
  });
  return {
    buyerOrganizationId: buyer.id,
    operatorOrganizationId: operator.id,
    otherBuyerOrganizationId: outsider.id,
    artisanProfileId: profile.id,
    capacityDeclarationId: capacity.id,
    deliveryAt: new Date(now + 6 * 86400000).toISOString(),
    quoteExpiresAt: new Date(now + 2 * 86400000).toISOString(),
    offerExpiresAt: new Date(now + 3 * 86400000).toISOString(),
  };
}

export async function seedBrowserCommerceFixture(url: string, suffix: string) {
  if (!/^[a-z0-9-]{1,32}$/.test(suffix)) throw new Error('Invalid fixture suffix.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const get = async (role: string) =>
      (
        await db.user.findUniqueOrThrow({
          where: { email: `commerce-${role}-${suffix}@example.com` },
        })
      ).id;
    return await seedCommerceFixture(
      db,
      {
        buyerId: await get('buyer'),
        operatorId: await get('operator'),
        artisanId: await get('artisan'),
        qualityId: await get('quality'),
        outsiderId: await get('outsider'),
      },
      suffix,
    );
  } finally {
    await db.$disconnect();
  }
}
