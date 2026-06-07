process.env.DATABASE_URL = 'postgresql://testyourself_user:pgzsud5ixJRTHMIXdz8wuGDXtLA5MLl1@dpg-d8i90r6q1p3s73efrub0-a.virginia-postgres.render.com/testyourself';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRawUnsafe(
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`
  );
  console.log(JSON.stringify(result, null, 2));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });