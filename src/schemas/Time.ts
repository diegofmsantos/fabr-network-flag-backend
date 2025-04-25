import { z } from 'zod'
import { JogadorSchema } from './Jogador'

export const TitulosSchema = z.object({
    nacionais: z.string().optional(),
    conferencias: z.string().optional(),
    estaduais: z.string().optional(),
})

export const TimeSchema = z.object({
    id: z.number().optional(),
    nome: z.string().optional(),
    temporada: z.string().optional(),
    sigla: z.string().optional(),
    cor: z.string().optional(),
    cidade: z.string().optional(),
    bandeira_estado: z.string().optional(),
    fundacao: z.string().optional(),
    logo: z.string().optional(),
    capacete: z.string().optional(),
    instagram: z.string().optional(),
    instagram2: z.string().optional(),
    estadio: z.string().optional(),
    presidente: z.string().optional(),
    head_coach: z.string().optional(),
    instagram_coach: z.string().optional(),
    coord_ofen: z.string().optional(),
    coord_defen: z.string().optional(),
    titulos: z.array(TitulosSchema).optional(),
    jogadores: z.array(JogadorSchema).optional(),
})
