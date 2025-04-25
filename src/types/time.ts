import { Jogador } from "./jogador"

type Titulos = {
  nacionais?: string
  conferencias?: string
  estaduais?: string
}

export type Time = {
  id?: number
  nome?: string
  temporada?: string
  sigla?: string
  cor?: string
  cidade?: string
  bandeira_estado?: string
  fundacao?: string
  logo?: string
  capacete?: string
  instagram?: string
  instagram2?: string
  estadio?: string
  presidente?: string
  head_coach?: string
  instagram_coach?: string
  coord_ofen?: string
  coord_defen?: string
  titulos?: Titulos[]
  jogadores?: Jogador[]
}
