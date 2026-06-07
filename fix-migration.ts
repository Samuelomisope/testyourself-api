import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // Recreate ChatRoom table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ChatRoom" (
      "id" TEXT NOT NULL,
      "name" TEXT,
      "isGroup" BOOLEAN NOT NULL DEFAULT false,
      "universityId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
    );
  `);

  // Add foreign key only if it doesn't already exist
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ChatRoom_universityId_fkey'
      ) THEN
        ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_universityId_fkey"
        FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  // Mark the failed migration as rolled back
  await client.query(`
    UPDATE "_prisma_migrations" 
    SET "rolled_back_at" = NOW()
    WHERE "migration_name" = '20260607071730_merge_chat_modelsnpx'
    AND "finished_at" IS NULL
  `);

  console.log('Done! ChatRoom table recreated.');
  await client.end();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });