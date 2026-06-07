import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "_prisma_migrations" 
    SET "finished_at" = NOW(), 
        "applied_steps_count" = 1,
        "logs" = NULL,
        "rolled_back_at" = NULL
    WHERE "migration_name" = '20260607071730_merge_chat_modelsnpx'
  `);
  console.log('Migration fixed! Rows updated:', result);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });