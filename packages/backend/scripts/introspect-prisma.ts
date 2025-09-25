import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  // We just want to access type info (will not run type reflection at runtime). Console simple queries.
  console.log('Introspect start');
  const gp = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table';`;
  console.log('Tables:', gp);
}
main().finally(()=>prisma.$disconnect());
