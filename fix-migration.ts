import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // Recreate ChatRoom table
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

  // Recreate ChatRoomMember table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ChatRoomMember" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "roomId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("id")
    );
  `);

  // Recreate MessageReaction table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "MessageReaction" (
      "id" TEXT NOT NULL,
      "messageId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "emoji" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
    );
  `);

  // Foreign keys and indexes
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ChatRoom_universityId_fkey') THEN
        ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ChatRoomMember_userId_fkey') THEN
        ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ChatRoomMember_roomId_fkey') THEN
        ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ChatRoomMember_userId_roomId_key') THEN
        CREATE UNIQUE INDEX "ChatRoomMember_userId_roomId_key" ON "ChatRoomMember"("userId", "roomId");
      END IF;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MessageReaction_messageId_fkey') THEN
        ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MessageReaction_userId_fkey') THEN
        ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'MessageReaction_messageId_userId_key') THEN
        CREATE UNIQUE INDEX "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");
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

  console.log('Done! All tables recreated.');
  await client.end();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });