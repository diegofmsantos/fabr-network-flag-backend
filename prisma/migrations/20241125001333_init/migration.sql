-- CreateEnum
CREATE TYPE "Plano" AS ENUM ('BASICO', 'PADRAO', 'PREMIUM');

-- CreateTable
CREATE TABLE "Time" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "bandeira_estado" TEXT NOT NULL,
    "fundacao" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "capacete" TEXT NOT NULL,
    "instagram" TEXT NOT NULL,
    "instagram2" TEXT NOT NULL,
    "estadio" TEXT NOT NULL,
    "presidente" TEXT NOT NULL,
    "head_coach" TEXT NOT NULL,
    "instagram_coach" TEXT NOT NULL,
    "coord_ofen" TEXT NOT NULL,
    "coord_defen" TEXT NOT NULL,
    "titulos" JSONB NOT NULL,

    CONSTRAINT "Time_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jogador" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "posicao" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "experiencia" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "idade" INTEGER NOT NULL,
    "altura" DOUBLE PRECISION NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL,
    "instagram" TEXT NOT NULL,
    "instagram2" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "nacionalidade" TEXT NOT NULL,
    "camisa" TEXT NOT NULL,
    "estatisticas" JSONB NOT NULL,
    "timeId" INTEGER NOT NULL,
    "timeFormador" TEXT NOT NULL,

    CONSTRAINT "Jogador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "plano" "Plano" NOT NULL DEFAULT 'BASICO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- AddForeignKey
ALTER TABLE "Jogador" ADD CONSTRAINT "Jogador_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
