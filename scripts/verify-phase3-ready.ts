// scripts/verify-phase3-ready.ts
//
// Pre-flight check before running the Phase 3 cleanup migration
// (making Program.departmentId required, dropping Program.schoolId).
//
// schema.prisma already models the POST-migration state (departmentId
// required, no Program.school relation), so Prisma Client's generated
// types can no longer express "a Program missing departmentId" — that
// query has to go through raw SQL against the actual Postgres column
// instead, in case the NOT NULL constraint hasn't been applied to the
// database yet even though the schema file already assumes it.
//
// Confirms every Program row in the DB already has a departmentId set.
// If any are missing it, the Phase 3 migration will fail (or silently
// corrupt data if forced), so this should print 0 before you proceed.
//
// If the NOT NULL migration has already been run against the DB, this
// script has served its purpose and can be deleted.
//
// USAGE:
//   npx ts-node scripts/verify-phase3-ready.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type OrphanProgram = {
  id: string;
  name: string;
};

async function main() {
  const orphans = await prisma.$queryRaw<OrphanProgram[]>`
    SELECT id, name
    FROM "Program"
    WHERE "departmentId" IS NULL
  `;

  console.log(`Programs missing departmentId: ${orphans.length}`);

  if (orphans.length) {
    console.log('\nThese still need to be migrated/merged before Phase 3:');
    for (const p of orphans) {
      console.log(`  - ${p.id}: "${p.name}"`);
    }
    console.log('\nDo NOT run the Phase 3 migration until this list is empty.');
  } else {
    console.log('\nAll Program rows have a departmentId. Safe to proceed with Phase 3.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());