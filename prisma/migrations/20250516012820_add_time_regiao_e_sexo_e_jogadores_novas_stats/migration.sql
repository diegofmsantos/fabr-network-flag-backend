/*
  Warnings:

  - Added the required column `regiao` to the `Time` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sexo` to the `Time` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Time" ADD COLUMN     "regiao" TEXT NOT NULL,
ADD COLUMN     "sexo" TEXT NOT NULL;
