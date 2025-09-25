import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const prisma = new PrismaClient();
  const username = 'seeduser';
  const password = 'seedpass';
  let user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    user = await prisma.user.create({ data: { username, passwordHash: await argon2.hash(password) } });
    console.log('Created user:', username, '(password:', password, ')');
  } else {
    console.log('User already exists:', username);
  }
  const quiz = await prisma.quiz.create({ data: { title: 'Sample Quiz', description: 'Seed data', ownerId: user.id } });
  const q1 = await prisma.question.create({ data: { quizId: quiz.id, prompt: 'Capital of France?', type: 'mcq', timeLimitMs: 5000, order: 1 } });
  const q2 = await prisma.question.create({ data: { quizId: quiz.id, prompt: '2 + 2 = ?', type: 'mcq', timeLimitMs: 4000, order: 2 } });
  await prisma.questionOption.createMany({ data: [
    { questionId: q1.id, label: 'Paris', isCorrect: true },
    { questionId: q1.id, label: 'Lyon', isCorrect: false },
    { questionId: q2.id, label: '4', isCorrect: true },
    { questionId: q2.id, label: '5', isCorrect: false },
  ]});
  console.log('Seed quiz created with 2 questions.');
  await prisma.$disconnect();
}

main().catch(e=>{ console.error(e); process.exit(1); });
