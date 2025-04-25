import { z } from 'zod'

export const EstatisticasSchema = z.object({
    passe: z.object({
        passes_completos: z.number().optional(),
        passes_tentados: z.number().optional(),
        jardas_de_passe: z.number().optional(),
        td_passados: z.number().optional(),
        interceptacoes_sofridas: z.number().optional(),
        sacks_sofridos: z.number().optional(),
        fumble_de_passador: z.number().optional(),
    }).optional(),
    corrida: z.object({
        corridas: z.number().optional(),
        jardas_corridas: z.number().optional(),
        tds_corridos: z.number().optional(),
        fumble_de_corredor: z.number().optional(),
    }).optional(),
    recepcao: z.object({
        recepcoes: z.number().optional(),
        alvo: z.number().optional(),
        jardas_recebidas: z.number().optional(),
        tds_recebidos: z.number().optional(),
    }).optional(),
    retorno: z.object({
        retornos: z.number().optional(),
        jardas_retornadas: z.number().optional(),
        td_retornados: z.number().optional(),
    }).optional(),
    defesa: z.object({
        tackles_totais: z.number().optional(),
        tackles_for_loss: z.number().optional(),
        sacks_forcado: z.number().optional(),
        fumble_forcado: z.number().optional(),
        interceptacao_forcada: z.number().optional(),
        passe_desviado: z.number().optional(),
        safety: z.number().optional(),
        td_defensivo: z.number().optional(),
    }).optional(),
    kicker: z.object({
        xp_bons: z.number().optional(),
        tentativas_de_xp: z.number().optional(),
        fg_bons: z.number().optional(),
        tentativas_de_fg: z.number().optional(),
        fg_mais_longo: z.number().optional(),
    }).optional(),
    punter: z.object({
        punts: z.number().optional(),
        jardas_de_punt: z.number().optional(),
    }).optional(),
})

export const JogadorSchema = z.object({
    id: z.number().optional(),
    nome: z.string().optional(),
    time: z.string().optional(),
    timeId: z.number().optional(),
    timeFormador: z.string().optional(),
    posicao: z.string().optional(),
    setor: z.enum(["Ataque", "Defesa", "Special"]).optional(),
    experiencia: z.number().optional(),
    numero: z.number().optional(),
    idade: z.number().optional(),
    altura: z.number().optional(),
    peso: z.number().optional(),
    instagram: z.string().optional(),
    instagram2: z.string().optional(),
    cidade: z.string().optional(),
    nacionalidade: z.string().optional(),
    camisa: z.string().optional(),
    estatisticas: EstatisticasSchema.optional(),
})
