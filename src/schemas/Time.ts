import { z } from 'zod'
import { JogadorSchema } from './Jogador'

export const TimeSchema = z.object({
    id: z.number().optional(),
    nome: z.string().optional(),
    temporada: z.string().optional(),
    sigla: z.string().optional(),
    cor: z.string().optional(),
    cidade: z.string().optional(),
    bandeira_estado: z.string().optional(),
    instagram: z.string().optional(),
    instagram2: z.string().optional(),
    logo: z.string().optional(),
    jogadores: z.array(JogadorSchema).optional(),
})