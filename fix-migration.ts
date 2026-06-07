import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const result = await client.query(`
    UPDATE "_prisma_migrations" 
    SET "rolled_back_at" = NOW()
    WHERE "migration_name" = '20260607071730_merge_chat_modelsnpx'
    AND "finished_at" IS NULL
  `);
  console.log('Done! Rows updated:', result.rowCount);
  await client.end();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });