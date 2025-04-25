import { z } from 'zod'

export const MateriaSchema = z.object({
    id: z.number().optional(),
    titulo: z.string(),
    subtitulo: z.string(),
    imagem: z.string(),
    legenda: z.string(),
    texto: z.string(),
    autor: z.string(),
    autorImage: z.string(),
    createdAt: z.date(),
    updatedAt: z.date() 
})

export type Materia = z.infer<typeof MateriaSchema>