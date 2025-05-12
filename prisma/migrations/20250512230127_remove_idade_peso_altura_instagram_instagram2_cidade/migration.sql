/*
  Warnings:

  - You are about to drop the column `altura` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `cidade` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `idade` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `instagram` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `instagram2` on the `Jogador` table. All the data in the column will be lost.
  - You are about to drop the column `peso` on the `Jogador` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Jogador" DROP COLUMN "altura",
DROP COLUMN "cidade",
DROP COLUMN "idade",
DROP COLUMN "instagram",
DROP COLUMN "instagram2",
DROP COLUMN "peso";
