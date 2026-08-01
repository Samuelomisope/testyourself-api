const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.studyMaterial.count({ where: { faculty: 'ENGINEERING' } }).then((c) => {
  console.log(c);
  prisma.$disconnect();
});