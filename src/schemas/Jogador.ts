// src/schemas/Jogador.ts
import { z } from 'zod'

export const EstatisticasSchema = z.object({
    passe: z.object({
        passes_completos: z.number().optional(),
        passes_tentados: z.number().optional(),
        passes_incompletos: z.number().optional(),
        jds_passe: z.number().optional(),
        tds_passe: z.number().optional(),
        passe_xp1: z.number().optional(),
        passe_xp2: z.number().optional(),
        int_sofridas: z.number().optional(),
        sacks_sofridos: z.number().optional(),
        pressao_pct: z.string().optional(),
    }).optional(),
    corrida: z.object({
        corridas: z.number().optional(),
        jds_corridas: z.number().optional(),
        tds_corridos: z.number().optional(),
        corrida_xp1: z.number().optional(),
        corrida_xp2: z.number().optional(),
    }).optional(),
    recepcao: z.object({
        recepcoes: z.number().optional(),
        alvos: z.number().optional(),
        drops: z.number().optional(),
        jds_recepcao: z.number().optional(),
        jds_yac: z.number().optional(),
        tds_recepcao: z.number().optional(),
        recepcao_xp1: z.number().optional(),
        recepcao_xp2: z.number().optional(),
    }).optional(),
    defesa: z.object({
        tck: z.number().optional(),
        tfl: z.number().optional(),
        pressao_pct: z.string().optional(),
        sacks: z.number().optional(),
        tip: z.number().optional(),
        int: z.number().optional(),
        tds_defesa: z.number().optional(),
        defesa_xp2: z.number().optional(),
        sft: z.number().optional(),
        sft_1: z.number().optional(),
        blk: z.number().optional(),
        jds_defesa: z.number().optional(),
    }).optional(),
})

export const JogadorSchema = z.object({
    id: z.number().optional(),
    nome: z.string().optional(),
    time_nome: z.string().optional(), 
    timeId: z.number().optional(),
    numero: z.number().optional(),
    camisa: z.string().optional(),
    estatisticas: EstatisticasSchema.optional(),
})