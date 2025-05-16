export type Estatisticas = {
  passe?: {
    passes_completos?: number
    passes_tentados?: number
    passes_incompletos?: number
    jds_passe?: number
    tds_passe?: number
    passe_xp1?: number
    passe_xp2?: number
    int_sofridas?: number
    sacks_sofridos?: number
    pressao_pct?: string
  }
  corrida?: {
    corridas?: number
    jds_corridas?: number
    tds_corridos?: number
    corrida_xp1?: number
    corrida_xp2?: number
  }
  recepcao?: {
    recepcoes?: number
    alvos?: number
    drops?: number
    jds_recepcao?: number
    jds_yac?: number
    tds_recepcao?: number
    recepcao_xp1?: number
    recepcao_xp2?: number
  }
  defesa?: {
    tck?: number
    tfl?: number
    pressao_pct?: string
    sacks?: number
    tip?: number
    int?: number
    tds_defesa?: number
    defesa_xp2?: number
    sft?: number
    sft_1?: number
    blk?: number
    jds_defesa?: number
  }
}

export type Jogador = {
  id?: number
  nome?: string
  time?: string
  time_nome?: string 
  timeId?: number
  numero?: number
  camisa?: string
  estatisticas?: Estatisticas
}