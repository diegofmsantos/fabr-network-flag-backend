import { Time } from '../types/time'

export const Times: Time[] = [
    {
        id: 1,
        nome: "Fortaleza Tritões",
        temporada: "2025",
        sigla: 'FOR',
        cor: '#011D44',
        cidade: "Fortaleza/CE",
        bandeira_estado: "ceara.png",
        instagram: 'https://www.instagram.com/fortalezatritoes/',
        instagram2: '@fortalezatritoes',
        logo: "fortaleza-tritoes.png",
        regiao: "Nordeste",
        sexo: "masculino",
        jogadores: [
            {
                id: 1,
                nome: "JP Mingau",
                timeId: 1,
                numero: 47,
                time_nome: "Fortaleza Tritões",
                camisa: "camisa-teste-flag.png",
                estatisticas: {
                    passe: {
                        passes_completos: 0,
                        passes_tentados: 0,
                        passes_incompletos: 0,
                        jds_passe: 0,
                        tds_passe: 0,
                        passe_xp1: 0,
                        passe_xp2: 0,
                        int_sofridas: 0,
                        sacks_sofridos: 0,
                        pressao_pct: "0",
                    },
                    corrida: {
                        corridas: 2,
                        jds_corridas: 393,
                        tds_corridos: 0,
                        corrida_xp1: 2,
                        corrida_xp2: 2,
                    },
                    recepcao: {
                        recepcoes: 1,
                        alvos: 1,
                        drops: 5,
                        jds_recepcao: 401,
                        jds_yac: 401,
                        tds_recepcao: 1,
                        recepcao_xp1: 2,
                        recepcao_xp2: 2
                    },
                    defesa: {
                        tck: 14,
                        tfl: 1,
                        pressao_pct: "50%",
                        sacks: 0,
                        tip: 3,
                        int: 4,
                        tds_defesa: 1,
                        defesa_xp2: 0,
                        sft: 0,
                        sft_1: 0,
                        blk: 3,
                        jds_defesa: 43
                    },
                }
            },
        ]
    }
]