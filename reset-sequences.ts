// reset-sequences.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function resetSequences() {
  try {
    // Resetar todas as tabelas mencionadas
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Time_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "MetaDados_id_seq" RESTART WITH 1;');
    
    console.log('Sequences resetadas com sucesso!');
  } catch (error) {
    console.error('Erro ao resetar sequences:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetSequences();