import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "_prisma_migrations" 
    SET "rolled_back_at" = NOW()
    WHERE "migration_name" = '20260607071730_merge_chat_modelsnpx'
    AND "finished_at" IS NULL
  `);
  console.log('Done! Rows updated:', result);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });