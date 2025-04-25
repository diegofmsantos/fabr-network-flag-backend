/*
  Warnings:

  - You are about to drop the column `camisa` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `estatisticas` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `numero` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `timeId` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the `Materia` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[sigla,temporada]` on the table `Time` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `temporada` to the `Time` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Jogador" DROP CONSTRAINT "Jogador_timeId_fkey";

-- AlterTable
ALTER TABLE "Jogador" DROP COLUMN "camisa",
DROP COLUMN "estatisticas",
DROP COLUMN "numero",
DROP COLUMN "timeId";

-- AlterTable
ALTER TABLE "Time" ADD COLUMN     "temporada" TEXT NOT NULL;

-- DropTable
DROP TABLE "Materia";

-- CreateTable
CREATE TABLE "JogadorTime" (
    "id" SERIAL NOT NULL,
    "jogadorId" INTEGER NOT NULL,
    "timeId" INTEGER NOT NULL,
    "temporada" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "camisa" TEXT NOT NULL,
    "estatisticas" JSONB NOT NULL,

    CONSTRAINT "JogadorTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JogadorTime_jogadorId_timeId_temporada_key" ON "JogadorTime"("jogadorId", "timeId", "temporada");

-- CreateIndex
CREATE UNIQUE INDEX "Time_sigla_temporada_key" ON "Time"("sigla", "temporada");

-- AddForeignKey
ALTER TABLE "JogadorTime" ADD CONSTRAINT "JogadorTime_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JogadorTime" ADD CONSTRAINT "JogadorTime_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
