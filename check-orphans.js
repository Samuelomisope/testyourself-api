const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const deletedMessages = await prisma.$executeRaw`
    DELETE FROM "Message" 
    WHERE id IN (
      '8c2c8d6d-a586-4971-8d6f-8332ca93724f',
      '77f96187-c4cc-48db-86e2-46aa4b191889'
    )
  `;
  console.log('Deleted messages:', deletedMessages);

  const deletedFeedback = await prisma.$executeRaw`
    DELETE FROM "Feedback" 
    WHERE id IN (
      '930d5c13-f540-4aa2-921c-6c0282bc342c',
      'c45425f1-3825-481b-9c5c-da94cc88aec1'
    )
  `;
  console.log('Deleted feedback:', deletedFeedback);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());