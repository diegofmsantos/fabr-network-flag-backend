import { z } from 'zod'

export const EstatisticasSchema = z.object({
    ataque: z.object({
        passes_completos: z.number().optional(),
        passes_tentados: z.number().optional(),
        td_passado: z.number().optional(),
        interceptacoes_sofridas: z.number().optional(),
        sacks_sofridos: z.number().optional(),
        corrida: z.number().optional(),
        tds_corridos: z.number().optional(),
        recepcao: z.number().optional(),
        alvo: z.number().optional(),
        td_recebido: z.number().optional(),
    }).optional(),
    defesa: z.object({
        sack: z.number().optional(),
        pressao: z.number().optional(),
        flag_retirada: z.number().optional(),
        flag_perdida: z.number().optional(),
        passe_desviado: z.number().optional(),
        interceptacao_forcada: z.number().optional(),
        td_defensivo: z.number().optional(),
    }).optional(),
})

export const JogadorSchema = z.object({
    id: z.number().optional(),
    nome: z.string().optional(),
    timeId: z.number().optional(),
    numero: z.number().optional(), // Adicionando número
    camisa: z.string().optional(), // Adicionando camisa
    estatisticas: EstatisticasSchema.optional(),
})