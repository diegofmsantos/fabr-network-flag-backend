-- CreateTable
CREATE TABLE "Materia" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "subtitulo" TEXT NOT NULL,
    "imagem" TEXT NOT NULL,
    "legenda" TEXT,
    "texto" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorImage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Materia_pkey" PRIMARY KEY ("id")
);
