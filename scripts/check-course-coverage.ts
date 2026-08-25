import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.studyMaterial.count({
    where: { courseRef: { isNot: null } },
  });
  console.log('Materials with courseRef set:', total);

  const bySchool = await prisma.$queryRaw`
    SELECT s.name AS school, COUNT(*) AS count
    FROM "StudyMaterial" sm
    JOIN "Course" c ON sm."courseId" = c.id
    JOIN "Program" p ON c."programId" = p.id
    JOIN "Department" d ON p."departmentId" = d.id
    JOIN "School" s ON d."schoolId" = s.id
    GROUP BY s.name
    ORDER BY count DESC
  `;
  console.log(bySchool);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());