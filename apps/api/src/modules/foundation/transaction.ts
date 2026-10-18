import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
export type Db = Prisma.TransactionClient;
// Fixed acquisition order also serializes against legacy account lifecycle mutations.
// These short IAM transactions do not perform SMTP or external network requests.
export function iamTransaction<T>(db: PrismaService, actor: Actor, fn: (tx: Db) => Promise<T>) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
      const user = await tx.user.findUnique({ where: { id: actor.id } });
      const session = await tx.session.findUnique({ where: { id: actor.sessionId } });
      if (
        !user?.emailVerified ||
        user.status !== 'ACTIVE' ||
        !session ||
        session.userId !== actor.id ||
        session.expiresAt <= new Date()
      )
        fail(403, 'ACCOUNT_UNAVAILABLE', 'Sign in with an active verified account.');
      return fn(tx);
    },
    { maxWait: 15000, timeout: 15000 },
  );
}
