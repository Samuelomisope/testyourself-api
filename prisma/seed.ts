import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const UNIVERSITIES = [
  { name: 'FUTA', fullName: 'Federal University of Technology, Akure' },
  { name: 'OAU', fullName: 'Obafemi Awolowo University, Ile-Ife' },
  { name: 'UNILAG', fullName: 'University of Lagos' },
  { name: 'UI', fullName: 'University of Ibadan' },
  { name: 'ABU', fullName: 'Ahmadu Bello University, Zaria' },
  { name: 'UNIBEN', fullName: 'University of Benin' },
  { name: 'UNIPORT', fullName: 'University of Port Harcourt' },
  { name: 'LASU', fullName: 'Lagos State University' },
];

async function main() {
  console.log('🌱 Seeding universities...');

  for (const uni of UNIVERSITIES) {
    const exists = await prisma.university.findUnique({ where: { name: uni.fullName } });
    if (!exists) {
      await prisma.university.create({
        data: {
          name: uni.fullName,
          shortName: uni.name,
          country: 'Nigeria',
        },
      });
      console.log(`✅ Created: ${uni.fullName}`);
    } else {
      console.log(`⏭️  Skipped (exists): ${uni.fullName}`);
    }
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());