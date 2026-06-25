// test-pooled.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // uses DATABASE_URL (pooled) by default

async function main() {
  const start = Date.now();
  const result = await prisma.$queryRaw`SELECT 1`;
  console.log('Connected in', Date.now() - start, 'ms:', result);
}

main()
  .catch((e) => console.error('FAILED:', e))
  .finally(() => prisma.$disconnect());