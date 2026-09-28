import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../src/demo/seed';

const prisma = new PrismaClient();

seedDemo(prisma)
  .then(() => console.log('Seeded the fictional demo organization.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
