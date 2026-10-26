import { mkdir, readFile, writeFile, chmod, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createApp } from '../apps/api/src/app.js';
import { validateEnvironment } from '../apps/api/src/config/env.js';
import { AuthService } from '../apps/api/src/modules/auth/auth.service.js';
import { PrismaService } from '../apps/api/src/database/prisma.service.js';
import { logger } from '../apps/api/src/common/logging.js';
import type { BusinessRole } from '../packages/contracts/src/permissions.js';
import { assertLocalDevelopment } from './local-development.js';

const personas = [
  { key: 'buyer', name: 'Demo Business Buyer', email: 'buyer@nasj-demo.invalid' },
  { key: 'artisan', name: 'Demo Woman Artisan', email: 'artisan@nasj-demo.invalid' },
  {
    key: 'coordinator',
    name: 'Demo Association Coordinator',
    email: 'coordinator@nasj-demo.invalid',
  },
  {
    key: 'production',
    name: 'Demo Production Manager',
    email: 'production@nasj-demo.invalid',
  },
  { key: 'finance', name: 'Demo Finance Manager', email: 'finance@nasj-demo.invalid' },
  { key: 'admin', name: 'Demo Platform Reviewer', email: 'admin@nasj-demo.invalid' },
] as const;
type Credential = { persona: string; name: string; email: string; password: string };
export async function seedFoundation(mode: 'demo' | 'development') {
  const demo = mode === 'demo';
  const credentialsFile = new URL(
    demo ? '../.local/demo-credentials.json' : '../.local/dev-credentials.json',
    import.meta.url,
  );
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  logger.level = 'silent';
  try {
    // These checks precede Nest/Prisma startup and every possible database write.
    if (!demo) assertLocalDevelopment(process.env);
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (
      demo &&
      (process.env.DEMO_MODE !== 'true' ||
        process.env.NODE_ENV === 'production' ||
        !['postgres:', 'postgresql:'].includes(database.protocol) ||
        database.pathname !== '/nasj_demo' ||
        database.hostname !== '127.0.0.1' ||
        database.port !== '5542' ||
        database.username !== 'nasj_demo' ||
        database.search ||
        database.hash ||
        process.env.PUBLIC_APP_URL !== 'http://127.0.0.1:3200')
    )
      throw new Error('Refusing to seed outside the isolated local demo database.');
    const config = validateEnvironment(process.env);
    await mkdir(new URL('../.local/', import.meta.url), { recursive: true, mode: 0o700 });
    const generated = {
      version: 1,
      environment: demo ? 'isolated-local-demo' : 'local-development',
      appUrl: config.PUBLIC_APP_URL,
      personas: personas.map((persona) => ({
        persona: persona.key,
        name: persona.name,
        email: persona.email,
        password: randomBytes(24).toString('base64url'),
      })),
    };
    const credentialsExist = await access(credentialsFile).then(
      () => true,
      (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      },
    );
    if (!demo && !credentialsExist) {
      // Keep existing local reviewer credentials useful at the canonical development URL.
      // This copies only synthetic fixture passwords; no identities or application data cross databases.
      try {
        const previous = JSON.parse(
          await readFile(new URL('../.local/demo-credentials.json', import.meta.url), 'utf8'),
        ) as { environment?: string; personas?: Credential[] };
        if (previous.environment !== 'isolated-local-demo' || !Array.isArray(previous.personas))
          throw new Error('Invalid synthetic credential manifest.');
        for (const entry of generated.personas) {
          const old = previous.personas.find(
            (item) => item.persona === entry.persona && item.email === entry.email,
          );
          if (!old || typeof old.password !== 'string' || old.password.length < 24)
            throw new Error('Invalid synthetic credential entry.');
          entry.password = old.password;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    let newlyCreated = false;
    try {
      await writeFile(credentialsFile, `${JSON.stringify(generated, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
      newlyCreated = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    await chmod(credentialsFile, 0o600);
    const saved: unknown = JSON.parse(await readFile(credentialsFile, 'utf8'));
    if (
      !saved ||
      typeof saved !== 'object' ||
      !('version' in saved) ||
      saved.version !== 1 ||
      !('environment' in saved) ||
      saved.environment !== (demo ? 'isolated-local-demo' : 'local-development') ||
      !('personas' in saved) ||
      !Array.isArray(saved.personas)
    )
      throw new Error('Invalid demo credential manifest; no credentials were changed.');
    const entries = saved.personas as Credential[];
    if (
      entries.length !== personas.length ||
      personas.some(
        (persona) =>
          entries.filter(
            (entry) =>
              entry.persona === persona.key &&
              entry.email === persona.email &&
              typeof entry.password === 'string' &&
              entry.password.length >= 24,
          ).length !== 1,
      )
    )
      throw new Error('Demo credential manifest does not match synthetic personas.');
    app = await createApp({ config });
    const db = app.get(PrismaService);
    const auth = app.get(AuthService);
    // A dedicated database can still have a wrong local fixture: fail closed rather than modify it.
    if (
      demo &&
      (await db.user.count({
        where: { email: { notIn: personas.map((persona) => persona.email) } },
      }))
    )
      throw new Error('Non-demo identities detected; refusing to seed this database.');
    const users = new Map<string, string>();
    for (const persona of personas) {
      const credential = entries.find((entry) => entry.persona === persona.key);
      if (!credential) throw new Error('Missing local demo credential.');
      const existing = await db.user.findUnique({ where: { email: persona.email } });
      if (existing && newlyCreated)
        throw new Error(
          'Existing demo users have no preserved credential manifest; refusing to replace passwords.',
        );
      if (!existing)
        await auth.auth.api.signUpEmail({
          body: { name: persona.name, email: persona.email, password: credential.password },
        });
      const user =
        existing ??
        (await db.user.update({
          where: { email: persona.email },
          data: {
            emailVerified: true,
            role: persona.key === 'admin' ? 'ADMIN' : 'USER',
            status: 'ACTIVE',
          },
        }));
      users.set(persona.key, user.id);
    }
    const id = (key: string) => {
      const value = users.get(key);
      if (!value) throw new Error('Missing synthetic identity.');
      return value;
    };
    const admin = id('admin');
    const capacityStart = new Date();
    capacityStart.setUTCHours(0, 0, 0, 0);
    capacityStart.setUTCDate(
      capacityStart.getUTCDate() + ((8 - capacityStart.getUTCDay()) % 7 || 7),
    );
    const capacityEnd = new Date(capacityStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const organizationSpecs = [
      {
        slug: 'demo-buyer-business',
        name: 'DEMO — Jasmin Buyer Studio',
        type: 'BUYER_BUSINESS' as const,
        owner: 'buyer',
      },
      {
        slug: 'demo-artisan-association',
        name: 'DEMO — Noura Artisan Association',
        type: 'ASSOCIATION' as const,
        owner: 'coordinator',
      },
      {
        slug: 'demo-internal-operator',
        name: 'DEMO — NASJ Operations',
        type: 'INTERNAL' as const,
        owner: 'admin',
      },
    ];
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
        const organizations = new Map<string, string>();
        for (const spec of organizationSpecs) {
          const organization = await tx.organization.upsert({
            where: { slug: spec.slug },
            update: {},
            create: {
              slug: spec.slug,
              name: spec.name,
              type: spec.type,
              country: 'TN',
              region: 'Tunis',
              description:
                'Fictional demonstration organization. No real commercial activity or personal records.',
              contactEmail: `${spec.owner}@nasj-demo.invalid`,
              representativeName:
                personas.find((p) => p.key === spec.owner)?.name ?? 'Demo Representative',
              createdByUserId: id(spec.owner),
              approvalStatus: 'APPROVED',
              approvedByUserId: admin,
              approvedAt: new Date(),
              approvalReason: 'Synthetic isolated demonstration fixture',
            },
          });
          organizations.set(spec.slug, organization.id);
        }
        const orgId = (slug: string) => {
          const value = organizations.get(slug);
          if (!value) throw new Error('Missing synthetic organization.');
          return value;
        };
        const memberships: {
          persona: string;
          slug: string;
          manager: boolean;
          roles: BusinessRole[];
        }[] = [
          { persona: 'buyer', slug: 'demo-buyer-business', manager: true, roles: ['BUYER'] },
          {
            persona: 'coordinator',
            slug: 'demo-artisan-association',
            manager: true,
            roles: ['ASSOCIATION_COORDINATOR'],
          },
          {
            persona: 'artisan',
            slug: 'demo-artisan-association',
            manager: false,
            roles: ['ARTISAN'],
          },
          { persona: 'admin', slug: 'demo-internal-operator', manager: true, roles: [] },
          {
            persona: 'production',
            slug: 'demo-internal-operator',
            manager: false,
            roles: ['PRODUCTION_MANAGER'],
          },
          {
            persona: 'finance',
            slug: 'demo-internal-operator',
            manager: false,
            roles: ['FINANCE_MANAGER'],
          },
          {
            persona: 'coordinator',
            slug: 'demo-internal-operator',
            manager: false,
            roles: ['SUPPORT'],
          },
        ];
        for (const item of memberships) {
          const membership = await tx.organizationMember.upsert({
            where: {
              organizationId_userId: { organizationId: orgId(item.slug), userId: id(item.persona) },
            },
            update: {},
            create: {
              organizationId: orgId(item.slug),
              userId: id(item.persona),
              isManager: item.manager,
            },
          });
          for (const role of item.roles)
            await tx.membershipRole.upsert({
              where: { membershipId_role: { membershipId: membership.id, role } },
              update: {},
              create: { membershipId: membership.id, role, assignedByUserId: admin },
            });
        }
        const profile = await tx.artisanProfile.upsert({
          where: { userId: id('artisan') },
          update: {},
          create: {
            userId: id('artisan'),
            displayName: 'DEMO — Amel Artisan',
            region: 'Nabeul',
            preferredLanguage: 'fr',
            experienceDescription:
              'Fictional artisan demonstrating voluntary capacity and association relationships.',
            equipment: ['Hand loom', 'Embroidery tools'],
          },
        });
        if (
          !(await tx.consentRecord.findFirst({
            where: { userId: id('artisan'), purpose: 'artisan.profile' },
          }))
        )
          await tx.consentRecord.create({
            data: {
              userId: id('artisan'),
              purpose: 'artisan.profile',
              policyVersion: 'artisan-profile-v1',
              decision: true,
              collectionContext:
                'Synthetic isolated demonstration fixture; fictional profile consent.',
            },
          });
        const skill = await tx.craftSkill.upsert({
          where: { name: 'DEMO — Traditional embroidery' },
          update: {},
          create: {
            name: 'DEMO — Traditional embroidery',
            category: 'Textile',
            description: 'Synthetic craft for the isolated demonstration.',
          },
        });
        await tx.artisanSkill.upsert({
          where: {
            artisanProfileId_craftSkillId: { artisanProfileId: profile.id, craftSkillId: skill.id },
          },
          update: {},
          create: {
            artisanProfileId: profile.id,
            craftSkillId: skill.id,
            proficiency: 'ADVANCED',
          },
        });
        if (!(await tx.capacityDeclaration.findFirst({ where: { artisanProfileId: profile.id } })))
          await tx.capacityDeclaration.create({
            data: {
              artisanProfileId: profile.id,
              craftSkillId: skill.id,
              unitType: 'PIECES',
              quantity: '12.00',
              effectiveFrom: capacityStart,
              effectiveTo: capacityEnd,
              declaredByUserId: id('artisan'),
            },
          });
        // Normalize only known legacy synthetic fixture labels; preserve user edits/history.
        const repairedSkill = await tx.artisanSkill.updateMany({
          where: {
            artisanProfileId: profile.id,
            craftSkillId: skill.id,
            proficiency: 'Experienced',
          },
          data: { proficiency: 'ADVANCED' },
        });
        const repairedCapacity = await tx.capacityDeclaration.updateMany({
          where: {
            artisanProfileId: profile.id,
            craftSkillId: skill.id,
            unitType: 'PIECES_PER_WEEK',
          },
          data: { unitType: 'PIECES' },
        });
        const associationId = orgId('demo-artisan-association');
        const repairedConsent = await tx.consentRecord.updateMany({
          where: {
            userId: id('artisan'),
            purpose: 'association.link',
            collectionContext: 'Synthetic isolated demo seed; fictional consent, no real person.',
          },
          data: { purpose: `association:${associationId}` },
        });
        if (repairedSkill.count || repairedCapacity.count || repairedConsent.count)
          await tx.auditEvent.create({
            data: {
              actorId: admin,
              targetType: demo ? 'DemoEnvironment' : 'DevelopmentEnvironment',
              targetId: demo ? 'nasj_demo' : 'nasj',
              action: demo
                ? 'demo.fixture.labels.normalized'
                : 'development.fixture.labels.normalized',
              correlationId: crypto.randomUUID(),
              reason: 'Normalize legacy synthetic fixture labels to the validated API vocabulary.',
              after: {
                skills: repairedSkill.count,
                capacities: repairedCapacity.count,
                consents: repairedConsent.count,
              },
            },
          });

        if (
          !(await tx.associationMembership.findUnique({
            where: {
              artisanProfileId_organizationId: {
                artisanProfileId: profile.id,
                organizationId: associationId,
              },
            },
          }))
        ) {
          const consent = await tx.consentRecord.create({
            data: {
              userId: id('artisan'),
              purpose: `association:${associationId}`,
              policyVersion: 'association-v1',
              decision: true,
              collectionContext: 'Synthetic isolated demo seed; fictional consent, no real person.',
            },
          });
          await tx.associationMembership.create({
            data: {
              artisanProfileId: profile.id,
              organizationId: associationId,
              consentRecordId: consent.id,
            },
          });
        }
        const seededGroups = [
          {
            name: 'DEMO — Amina Weaving Circle',
            craft: 'DEMO — Hand weaving',
            area: 'Kairouan',
            quantity: '8.00',
          },
          {
            name: 'DEMO — Salma Basket Collective',
            craft: 'DEMO — Basketry',
            area: 'Kebili',
            quantity: '0.00',
          },
          {
            name: 'DEMO — Yasmine Ceramic Studio',
            craft: 'DEMO — Ceramics',
            area: 'Nabeul',
            quantity: '18.00',
          },
        ];
        for (const group of seededGroups) {
          const seededProfile = await tx.artisanProfile.findFirst({
            where: { displayName: group.name },
          });
          const profileRecord =
            seededProfile ??
            (await tx.artisanProfile.create({
              data: {
                displayName: group.name,
                region: group.area,
                createdById: admin,
                experienceDescription: 'Synthetic fictional group fixture for planning only.',
                equipment: [],
              },
            }));
          const seededSkill = await tx.craftSkill.upsert({
            where: { name: group.craft },
            update: {},
            create: {
              name: group.craft,
              category: 'Synthetic craft',
              description: 'Synthetic fictional craft for local demonstration.',
            },
          });
          await tx.artisanSkill.upsert({
            where: {
              artisanProfileId_craftSkillId: {
                artisanProfileId: profileRecord.id,
                craftSkillId: seededSkill.id,
              },
            },
            update: {},
            create: {
              artisanProfileId: profileRecord.id,
              craftSkillId: seededSkill.id,
              proficiency: 'DEMO',
            },
          });
          const declaration = await tx.capacityDeclaration.findFirst({
            where: {
              artisanProfileId: profileRecord.id,
              craftSkillId: seededSkill.id,
              unitType: 'PIECES',
            },
          });
          const seededDeclaration =
            declaration ??
            (await tx.capacityDeclaration.create({
              data: {
                artisanProfileId: profileRecord.id,
                craftSkillId: seededSkill.id,
                unitType: 'PIECES',
                quantity: group.quantity,
                effectiveFrom: capacityStart,
                effectiveTo: capacityEnd,
                declaredByUserId: id('artisan'),
              },
            }));
          if (group.name === 'DEMO — Yasmine Ceramic Studio') {
            const existingCommitted = await tx.commercialOffer.findFirst({
              where: { capacityDeclarationId: seededDeclaration.id, status: 'ACCEPTED' },
            });
            if (!existingCommitted) {
              const rfq = await tx.commercialRfq.create({
                data: {
                  buyerOrganizationId: orgId('demo-buyer-business'),
                  operatorOrganizationId: orgId('demo-internal-operator'),
                  craftSkillId: seededSkill.id,
                  title: 'DEMO — Ceramic planning reservation',
                  specification: 'Synthetic fixture reservation for capacity reconciliation.',
                  designRequirements: 'Fictional local demonstration only.',
                  quantity: 18,
                  deliveryAt: capacityEnd,
                  deliveryLocation: 'Synthetic planning destination',
                  status: 'ACCEPTED',
                  provenance: 'SYNTHETIC',
                  quoteMillimes: 18000n,
                  quoteExpiresAt: capacityEnd,
                },
              });
              const order = await tx.commercialOrder.create({
                data: { rfqId: rfq.id, status: 'PLANNING', provenance: 'SYNTHETIC' },
              });
              await tx.commercialOffer.create({
                data: {
                  orderId: order.id,
                  capacityDeclarationId: seededDeclaration.id,
                  artisanProfileId: profileRecord.id,
                  quantity: 18,
                  unitPayMillimes: 1000n,
                  estimatedHours: 'Synthetic planning estimate',
                  expiresAt: capacityEnd,
                  materials: 'Synthetic materials',
                  reworkTerms: 'Synthetic rework terms',
                  paymentConditions: 'Synthetic payment conditions',
                  status: 'ACCEPTED',
                  provenance: 'SYNTHETIC',
                  acceptedAt: new Date(),
                  decidedByUserId: id('artisan'),
                },
              });
            }
          }
        }
        if (
          !(await tx.auditEvent.findFirst({
            where: {
              action: demo ? 'demo.fixtures.created' : 'development.fixtures.created',
              actorId: admin,
            },
          }))
        )
          await tx.auditEvent.create({
            data: {
              actorId: admin,
              targetType: demo ? 'DemoEnvironment' : 'DevelopmentEnvironment',
              targetId: demo ? 'nasj_demo' : 'nasj',
              action: demo ? 'demo.fixtures.created' : 'development.fixtures.created',
              correlationId: demo ? 'isolated-demo-seed-v1' : 'local-development-seed-v1',
              reason: demo
                ? 'Synthetic fixtures in a dedicated database; no live data imported.'
                : 'Synthetic fixtures in the local development database; no real data imported.',
            },
          });
      },
      { maxWait: 15000, timeout: 30000 },
    );
    console.log(
      `Six local fixture accounts are ready at ${config.PUBLIC_APP_URL}. Credentials: .local/${demo ? 'demo' : 'dev'}-credentials.json. Existing passwords and records were preserved.`,
    );
  } catch (error) {
    console.error(
      `Local fixture seed refused or failed (${error instanceof Error ? error.name : 'UnknownError'}). Check the intended local environment and preserved credential manifest. No passwords were reset.`,
    );
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}
