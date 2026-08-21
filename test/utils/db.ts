import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const testPrisma = new PrismaClient({ adapter });

export async function truncateAll(): Promise<void> {
  await testPrisma.$executeRawUnsafe(
    'TRUNCATE TABLE "UserInvite", "RefreshToken", "User", "Tenant" RESTART IDENTITY CASCADE',
  );
}
