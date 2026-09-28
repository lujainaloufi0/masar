/** Container start-up: in demo mode, seed the fictional organization when the database is empty. */
import { PrismaClient } from '@prisma/client';
import { seedDemo } from './seed';

async function main() {
  if (process.env.DEMO_MODE !== 'true') return;
  const prisma = new PrismaClient();
  try {
    if ((await prisma.organization.count()) === 0) {
      await seedDemo(prisma);
      console.log('Seeded the fictional demo organization.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
