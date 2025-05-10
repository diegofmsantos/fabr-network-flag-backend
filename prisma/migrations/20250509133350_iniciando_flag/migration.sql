/*
  Warnings:

  - You are about to drop the column `experiencia` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `nacionalidade` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `posicao` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `setor` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `timeFormador` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `capacete` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the column `coord_defen` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the column `coord_ofen` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the column `estadio` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the column `fundacao` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the column `instagram_coach` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the column `presidente` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the column `titulos` on the `Time` table. All the data in the column will be lost.
  - You are about to drop the `Materia` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Jogador" DROP COLUMN "experiencia",
DROP COLUMN "nacionalidade",
DROP COLUMN "posicao",
DROP COLUMN "setor",
DROP COLUMN "timeFormador";

-- AlterTable
ALTER TABLE "Time" DROP COLUMN "capacete",
DROP COLUMN "coord_defen",
DROP COLUMN "coord_ofen",
DROP COLUMN "estadio",
DROP COLUMN "fundacao",
DROP COLUMN "instagram_coach",
DROP COLUMN "presidente",
DROP COLUMN "titulos";

-- DropTable
DROP TABLE "Materia";
