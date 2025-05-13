import { Jogador } from "./jogador"

export type Time = {
  id?: number
  nome?: string
  temporada?: string
  sigla?: string
  cor?: string
  cidade?: string
  bandeira_estado?: string
  logo?: string
  instagram?: string
  instagram2?: string
  jogadores?: Jogador[]
}