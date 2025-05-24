import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import fs from 'fs';
import path from 'path';
import multer from 'multer'
import xlsx from 'xlsx';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir); 
    },
    filename: (_req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (
            file.mimetype === 'application/vnd.ms-excel' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } 
});

const prisma = new PrismaClient()

export const mainRouter = express.Router()

mainRouter.get('/comparar-times', async function (req: Request, res: Response) {
    try {
        const time1Id = req.query.time1Id as string;
        const time2Id = req.query.time2Id as string;
        const temporada = (req.query.temporada as string) || '2025';


        if (!time1Id || !time2Id) {
            res.status(400).json({ error: 'É necessário fornecer IDs de dois times diferentes' });
            return;
        }

        if (time1Id === time2Id) {
            res.status(400).json({ error: 'Os times precisam ser diferentes para comparação' });
            return;
        }

        const [time1, time2] = await Promise.all([
            prisma.time.findUnique({
                where: { id: Number(time1Id) },
                include: {
                    jogadores: {
                        where: { temporada: temporada },
                        include: { jogador: true }
                    }
                }
            }),
            prisma.time.findUnique({
                where: { id: Number(time2Id) },
                include: {
                    jogadores: {
                        where: { temporada: temporada },
                        include: { jogador: true }
                    }
                }
            })
        ]);

        if (!time1 || !time2) {
            res.status(404).json({ error: 'Um ou ambos os times não foram encontrados' });
            return;
        }

        const time1Estatisticas = calcularEstatisticasTime(time1);
        const time2Estatisticas = calcularEstatisticasTime(time2);

        const time1Destaques = identificarJogadoresDestaque(time1);
        const time2Destaques = identificarJogadoresDestaque(time2);

        const result = {
            teams: {
                time1: {
                    id: time1.id,
                    nome: time1.nome,
                    sigla: time1.sigla,
                    cor: time1.cor,
                    logo: time1.logo,
                    estatisticas: time1Estatisticas,
                    destaques: time1Destaques
                },
                time2: {
                    id: time2.id,
                    nome: time2.nome,
                    sigla: time2.sigla,
                    cor: time2.cor,
                    logo: time2.logo,
                    estatisticas: time2Estatisticas,
                    destaques: time2Destaques
                }
            }
        };

        res.status(200).json(result);
    } catch (error) {
        console.error('Erro ao comparar times:', error);
        res.status(500).json({ error: 'Erro ao processar comparação de times' });
    }
});

function calcularEstatisticasTime(time: any) {
    const jogadores = time.jogadores.map((jt: any) => ({
        ...jt.jogador,
        estatisticas: jt.estatisticas,
        numero: jt.numero,
        camisa: jt.camisa
    }));

    const passe = {
        passes_completos: 0,
        passes_tentados: 0,
        passes_incompletos: 0,
        jds_passe: 0,
        tds_passe: 0,
        passe_xp1: 0,
        passe_xp2: 0,
        int_sofridas: 0,
        sacks_sofridos: 0,
        pressao_pct: "0"
    };

    const corrida = {
        corridas: 0,
        jds_corridas: 0,
        tds_corridos: 0,
        corrida_xp1: 0,
        corrida_xp2: 0
    };

    const recepcao = {
        recepcoes: 0,
        alvos: 0,
        drops: 0,
        jds_recepcao: 0,
        jds_yac: 0,
        tds_recepcao: 0,
        recepcao_xp1: 0,
        recepcao_xp2: 0
    };

    const defesa = {
        tck: 0,
        tfl: 0,
        pressao_pct: "0",
        sacks: 0,
        tip: 0,
        int: 0,
        tds_defesa: 0,
        defesa_xp2: 0,
        sft: 0,
        sft_1: 0,
        blk: 0,
        jds_defesa: 0
    };

    jogadores.forEach((jogador: any) => {

        if (jogador.estatisticas?.passe) {
            const e = jogador.estatisticas.passe;
            passe.passes_completos += e.passes_completos || 0;
            passe.passes_tentados += e.passes_tentados || 0;
            passe.passes_incompletos += e.passes_incompletos || 0;
            passe.jds_passe += e.jds_passe || 0;
            passe.tds_passe += e.tds_passe || 0;
            passe.passe_xp1 += e.passe_xp1 || 0;
            passe.passe_xp2 += e.passe_xp2 || 0;
            passe.int_sofridas += e.int_sofridas || 0;
            passe.sacks_sofridos += e.sacks_sofridos || 0;
            passe.pressao_pct = e.pressao_pct || "0";
        }

        if (jogador.estatisticas?.corrida) {
            const e = jogador.estatisticas.corrida;
            corrida.corridas += e.corridas || 0;
            corrida.jds_corridas += e.jds_corridas || 0;
            corrida.tds_corridos += e.tds_corridos || 0;
            corrida.corrida_xp1 += e.corrida_xp1 || 0;
            corrida.corrida_xp2 += e.corrida_xp2 || 0;
        }

        if (jogador.estatisticas?.recepcao) {
            const e = jogador.estatisticas.recepcao;
            recepcao.recepcoes += e.recepcoes || 0;
            recepcao.alvos += e.alvos || 0;
            recepcao.drops += e.drops || 0;
            recepcao.jds_recepcao += e.jds_recepcao || 0;
            recepcao.jds_yac += e.jds_yac || 0;
            recepcao.tds_recepcao += e.tds_recepcao || 0;
            recepcao.recepcao_xp1 += e.recepcao_xp1 || 0;
            recepcao.recepcao_xp2 += e.recepcao_xp2 || 0;
        }

        if (jogador.estatisticas?.defesa) {
            const e = jogador.estatisticas.defesa;
            defesa.tck += e.tck || 0;
            defesa.tfl += e.tfl || 0;
            defesa.sacks += e.sacks || 0;
            defesa.tip += e.tip || 0;
            defesa.int += e.int || 0;
            defesa.tds_defesa += e.tds_defesa || 0;
            defesa.defesa_xp2 += e.defesa_xp2 || 0;
            defesa.sft += e.sft || 0;
            defesa.sft_1 += e.sft_1 || 0;
            defesa.blk += e.blk || 0;
            defesa.jds_defesa += e.jds_defesa || 0;
            defesa.pressao_pct = e.pressao_pct || "0";
        }
    });

    return { passe, corrida, recepcao, defesa };
}

function identificarJogadoresDestaque(time: any) {
    const jogadores = time.jogadores.map((jt: any) => ({
        id: jt.jogador.id,
        nome: jt.jogador.nome,
        camisa: jt.camisa,
        numero: jt.numero,
        estatisticas: jt.estatisticas
    }));

    const destaques = {
        ataque: {
            passador: null,
            corredor: null,
            recebedor: null
        },
        defesa: {
            flagRetirada: null,
            pressao: null,
            interceptador: null
        }
    };

    destaques.ataque.passador = jogadores
        .filter((j: any) => j.estatisticas?.passe?.tds_passe > 0)
        .sort((a: any, b: any) => (b.estatisticas?.passe?.tds_passe || 0) - (a.estatisticas?.passe?.tds_passe || 0))[0] || null;
    destaques.ataque.corredor = jogadores
        .filter((j: any) => j.estatisticas?.corrida?.jds_corridas > 0)
        .sort((a: any, b: any) => (b.estatisticas?.corrida?.jds_corridas || 0) - (a.estatisticas?.corrida?.jds_corridas || 0))[0] || null;
    destaques.ataque.recebedor = jogadores
        .filter((j: any) => j.estatisticas?.recepcao?.tds_recepcao > 0)
        .sort((a: any, b: any) => (b.estatisticas?.recepcao?.tds_recepcao || 0) - (a.estatisticas?.recepcao?.tds_recepcao || 0))[0] || null;
    destaques.defesa.flagRetirada = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.tck > 0)
        .sort((a: any, b: any) => (b.estatisticas?.defesa?.tck || 0) - (a.estatisticas?.defesa?.tck || 0))[0] || null;
    destaques.defesa.pressao = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.pressao_pct)
        .sort((a: any, b: any) => {
            const valA = parseFloat(a.estatisticas?.defesa?.pressao_pct || '0');
            const valB = parseFloat(b.estatisticas?.defesa?.pressao_pct || '0');
            return valB - valA;
        })[0] || null;

    destaques.defesa.interceptador = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.int > 0)
        .sort((a: any, b: any) => (b.estatisticas?.defesa?.int || 0) - (a.estatisticas?.defesa?.int || 0))[0] || null;

    return destaques;
}

mainRouter.post('/atualizar-estatisticas', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const { id_jogo, data_jogo } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }

        const workbook = xlsx.readFile(req.file.path, {
            raw: true, 
            cellText: true,  
            cellDates: false 
        });

        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        estatisticasJogo.forEach(stat => {

            if (stat.temporada !== undefined) {
                stat.temporada = String(stat.temporada);
            }

            ['jogador_id', 'passes_completos', 'passes_tentados', 'passes_incompletos',
                'jds_passe', 'tds_passe', 'passe_xp1', 'passe_xp2', 'int_sofridas',
                'sacks_sofridos', 'corridas', 'jds_corridas', 'tds_corridos',
                'corrida_xp1', 'corrida_xp2', 'recepcoes', 'alvos', 'drops',
                'jds_recepcao', 'jds_yac', 'tds_recepcao', 'recepcao_xp1',
                'recepcao_xp2', 'tck', 'tfl', 'sacks', 'tip', 'int',
                'tds_defesa', 'defesa_xp2', 'sft', 'sft_1', 'blk', 'jds_defesa'].forEach(field => {
                    if (stat[field] !== undefined) {
                        stat[field] = isNaN(Number(stat[field])) ? 0 : Number(stat[field]);
                    }
                });
        });

        console.log(`Processando estatísticas de ${estatisticasJogo.length} jogadores para o jogo ${id_jogo}`);

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        const jogosJaProcessados = await prisma.metaDados.findFirst({
            where: { chave: 'jogos_processados' }
        });

        let jogosProcessados: Record<string, any> = {};
        if (jogosJaProcessados && jogosJaProcessados.valor) {
            try {
                jogosProcessados = JSON.parse(jogosJaProcessados.valor);
            } catch (e) {
                console.warn('Erro ao parsear jogos processados:', e);
                jogosProcessados = {};
            }
        }

        if (jogosProcessados[id_jogo]) {
            res.status(400).json({
                error: `O jogo ${id_jogo} já foi processado anteriormente.`,
                message: 'Use a rota /reprocessar-jogo se deseja atualizar os dados.'
            });
            return;
        }

        const estatisticasOriginais: Array<{
            jogadorId: number;
            timeId: number;
            temporada: string;
            estatisticas: Record<string, any>;
        }> = [];

        await prisma.$transaction(async (tx) => {
            for (const stat of estatisticasJogo) {
                try {
                    if (!stat.jogador_id && !stat.jogador_nome) {
                        resultados.erros.push({
                            linha: JSON.stringify(stat),
                            erro: 'ID ou nome do jogador é obrigatório'
                        });
                        continue;
                    }

                    const temporada = String(stat.temporada || '2025');

                    let jogador;
                    let jogadorTime;

                    if (stat.jogador_id) {
                        const jogadorId = Number(stat.jogador_id);

                        jogador = await tx.jogador.findUnique({
                            where: { id: jogadorId }
                        });

                        if (!jogador) {
                            throw new Error(`Jogador ID ${jogadorId} não encontrado`);
                        }

                        const jogadorTimes = await tx.jogadorTime.findMany({
                            where: {
                                jogadorId: jogadorId,
                                temporada: temporada 
                            }
                        });

                        if (!jogadorTimes || jogadorTimes.length === 0) {
                            throw new Error(`Jogador ID ${jogadorId} não tem relação com time na temporada ${temporada}`);
                        }

                        jogadorTime = jogadorTimes[0];
                    } else {

                    }

                    if (!jogador || !jogadorTime) {
                        resultados.erros.push({
                            jogador: stat.jogador_nome || stat.jogador_id,
                            erro: 'Jogador não encontrado ou não relacionado a nenhum time'
                        });
                        continue;
                    }

                    const estatisticasAtuais = jogadorTime.estatisticas as Record<string, any> || {};

                    const estatisticasDoJogo = {
                        passe: {
                            passes_completos: Number(stat.passes_completos || 0),
                            passes_tentados: Number(stat.passes_tentados || 0),
                            passes_incompletos: Number(stat.passes_incompletos || 0),
                            jds_passe: Number(stat.jds_passe || 0),
                            tds_passe: Number(stat.tds_passe || 0),
                            passe_xp1: Number(stat.passe_xp1 || 0),
                            passe_xp2: Number(stat.passe_xp2 || 0),
                            int_sofridas: Number(stat.int_sofridas || 0),
                            sacks_sofridos: Number(stat.sacks_sofridos || 0),
                            pressao_pct: String(stat.pressao_pct || "0")
                        },
                        corrida: {
                            corridas: Number(stat.corridas || 0),
                            jds_corridas: Number(stat.jds_corridas || 0),
                            tds_corridos: Number(stat.tds_corridos || 0),
                            corrida_xp1: Number(stat.corrida_xp1 || 0),
                            corrida_xp2: Number(stat.corrida_xp2 || 0)
                        },
                        recepcao: {
                            recepcoes: Number(stat.recepcoes || 0),
                            alvos: Number(stat.alvos || 0),
                            drops: Number(stat.drops || 0),
                            jds_recepcao: Number(stat.jds_recepcao || 0),
                            jds_yac: Number(stat.jds_yac || 0),
                            tds_recepcao: Number(stat.tds_recepcao || 0),
                            recepcao_xp1: Number(stat.recepcao_xp1 || 0),
                            recepcao_xp2: Number(stat.recepcao_xp2 || 0)
                        },
                        defesa: {
                            tck: Number(stat.tck || 0),
                            tfl: Number(stat.tfl || 0),
                            pressao_pct: String(stat.pressao_pct_def || "0"),
                            sacks: Number(stat.sacks || 0),
                            tip: Number(stat.tip || 0),
                            int: Number(stat.int || 0),
                            tds_defesa: Number(stat.tds_defesa || 0),
                            defesa_xp2: Number(stat.defesa_xp2 || 0),
                            sft: Number(stat.sft || 0),
                            sft_1: Number(stat.sft_1 || 0),
                            blk: Number(stat.blk || 0),
                            jds_defesa: Number(stat.jds_defesa || 0)
                        }
                    };

                    estatisticasOriginais.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada: temporada,
                        estatisticas: { ...estatisticasDoJogo }
                    });

                    const temPasse = typeof estatisticasAtuais?.passe === 'object' && estatisticasAtuais.passe !== null;
                    const temCorrida = typeof estatisticasAtuais?.corrida === 'object' && estatisticasAtuais.corrida !== null;
                    const temRecepcao = typeof estatisticasAtuais?.recepcao === 'object' && estatisticasAtuais.recepcao !== null;
                    const temDefesa = typeof estatisticasAtuais?.defesa === 'object' && estatisticasAtuais.defesa !== null;

                    const novasEstatisticas = {
                        passe: {
                            passes_completos: (temPasse ? Number(estatisticasAtuais.passe.passes_completos || 0) : 0) + estatisticasDoJogo.passe.passes_completos,
                            passes_tentados: (temPasse ? Number(estatisticasAtuais.passe.passes_tentados || 0) : 0) + estatisticasDoJogo.passe.passes_tentados,
                            passes_incompletos: (temPasse ? Number(estatisticasAtuais.passe.passes_incompletos || 0) : 0) + estatisticasDoJogo.passe.passes_incompletos,
                            jds_passe: (temPasse ? Number(estatisticasAtuais.passe.jds_passe || 0) : 0) + estatisticasDoJogo.passe.jds_passe,
                            tds_passe: (temPasse ? Number(estatisticasAtuais.passe.tds_passe || 0) : 0) + estatisticasDoJogo.passe.tds_passe,
                            passe_xp1: (temPasse ? Number(estatisticasAtuais.passe.passe_xp1 || 0) : 0) + estatisticasDoJogo.passe.passe_xp1,
                            passe_xp2: (temPasse ? Number(estatisticasAtuais.passe.passe_xp2 || 0) : 0) + estatisticasDoJogo.passe.passe_xp2,
                            int_sofridas: (temPasse ? Number(estatisticasAtuais.passe.int_sofridas || 0) : 0) + estatisticasDoJogo.passe.int_sofridas,
                            sacks_sofridos: (temPasse ? Number(estatisticasAtuais.passe.sacks_sofridos || 0) : 0) + estatisticasDoJogo.passe.sacks_sofridos,
                            pressao_pct: estatisticasDoJogo.passe.pressao_pct // Substitui o valor
                        },
                        corrida: {
                            corridas: (temCorrida ? Number(estatisticasAtuais.corrida.corridas || 0) : 0) + estatisticasDoJogo.corrida.corridas,
                            jds_corridas: (temCorrida ? Number(estatisticasAtuais.corrida.jds_corridas || 0) : 0) + estatisticasDoJogo.corrida.jds_corridas,
                            tds_corridos: (temCorrida ? Number(estatisticasAtuais.corrida.tds_corridos || 0) : 0) + estatisticasDoJogo.corrida.tds_corridos,
                            corrida_xp1: (temCorrida ? Number(estatisticasAtuais.corrida.corrida_xp1 || 0) : 0) + estatisticasDoJogo.corrida.corrida_xp1,
                            corrida_xp2: (temCorrida ? Number(estatisticasAtuais.corrida.corrida_xp2 || 0) : 0) + estatisticasDoJogo.corrida.corrida_xp2
                        },
                        recepcao: {
                            recepcoes: (temRecepcao ? Number(estatisticasAtuais.recepcao.recepcoes || 0) : 0) + estatisticasDoJogo.recepcao.recepcoes,
                            alvos: (temRecepcao ? Number(estatisticasAtuais.recepcao.alvos || 0) : 0) + estatisticasDoJogo.recepcao.alvos,
                            drops: (temRecepcao ? Number(estatisticasAtuais.recepcao.drops || 0) : 0) + estatisticasDoJogo.recepcao.drops,
                            jds_recepcao: (temRecepcao ? Number(estatisticasAtuais.recepcao.jds_recepcao || 0) : 0) + estatisticasDoJogo.recepcao.jds_recepcao,
                            jds_yac: (temRecepcao ? Number(estatisticasAtuais.recepcao.jds_yac || 0) : 0) + estatisticasDoJogo.recepcao.jds_yac,
                            tds_recepcao: (temRecepcao ? Number(estatisticasAtuais.recepcao.tds_recepcao || 0) : 0) + estatisticasDoJogo.recepcao.tds_recepcao,
                            recepcao_xp1: (temRecepcao ? Number(estatisticasAtuais.recepcao.recepcao_xp1 || 0) : 0) + estatisticasDoJogo.recepcao.recepcao_xp1,
                            recepcao_xp2: (temRecepcao ? Number(estatisticasAtuais.recepcao.recepcao_xp2 || 0) : 0) + estatisticasDoJogo.recepcao.recepcao_xp2
                        },
                        defesa: {
                            tck: (temDefesa ? Number(estatisticasAtuais.defesa.tck || 0) : 0) + estatisticasDoJogo.defesa.tck,
                            tfl: (temDefesa ? Number(estatisticasAtuais.defesa.tfl || 0) : 0) + estatisticasDoJogo.defesa.tfl,
                            pressao_pct: estatisticasDoJogo.defesa.pressao_pct, // Substitui o valor
                            sacks: (temDefesa ? Number(estatisticasAtuais.defesa.sacks || 0) : 0) + estatisticasDoJogo.defesa.sacks,
                            tip: (temDefesa ? Number(estatisticasAtuais.defesa.tip || 0) : 0) + estatisticasDoJogo.defesa.tip,
                            int: (temDefesa ? Number(estatisticasAtuais.defesa.int || 0) : 0) + estatisticasDoJogo.defesa.int,
                            tds_defesa: (temDefesa ? Number(estatisticasAtuais.defesa.tds_defesa || 0) : 0) + estatisticasDoJogo.defesa.tds_defesa,
                            defesa_xp2: (temDefesa ? Number(estatisticasAtuais.defesa.defesa_xp2 || 0) : 0) + estatisticasDoJogo.defesa.defesa_xp2,
                            sft: (temDefesa ? Number(estatisticasAtuais.defesa.sft || 0) : 0) + estatisticasDoJogo.defesa.sft,
                            sft_1: (temDefesa ? Number(estatisticasAtuais.defesa.sft_1 || 0) : 0) + estatisticasDoJogo.defesa.sft_1,
                            blk: (temDefesa ? Number(estatisticasAtuais.defesa.blk || 0) : 0) + estatisticasDoJogo.defesa.blk,
                            jds_defesa: (temDefesa ? Number(estatisticasAtuais.defesa.jds_defesa || 0) : 0) + estatisticasDoJogo.defesa.jds_defesa
                        }
                    };

                    await tx.jogadorTime.update({
                        where: { id: jogadorTime.id },
                        data: {
                            estatisticas: novasEstatisticas
                        }
                    });

                    resultados.sucesso++;
                } catch (error) {
                    console.error(`Erro ao processar estatísticas para jogador:`, error);
                    resultados.erros.push({
                        jogador: stat.jogador_nome || stat.jogador_id || 'Desconhecido',
                        erro: error instanceof Error ? error.message : 'Erro desconhecido'
                    });
                }
            }

            // Resto do código da transação (sem alterações)
            // ...

            // Registra as estatísticas originais do jogo para futuras correções
            await tx.metaDados.create({
                data: {
                    chave: `estatisticas_jogo_${id_jogo}`,
                    valor: JSON.stringify(estatisticasOriginais)
                }
            });

            // Registra que o jogo foi processado
            jogosProcessados[id_jogo] = {
                dataJogo: data_jogo,
                processadoEm: new Date().toISOString()
            };

            // Atualiza o registro de jogos processados
            await tx.metaDados.upsert({
                where: { chave: 'jogos_processados' },
                update: { valor: JSON.stringify(jogosProcessados) },
                create: {
                    chave: 'jogos_processados',
                    valor: JSON.stringify(jogosProcessados)
                }
            });

            // Registra informações detalhadas sobre este jogo
            await tx.metaDados.create({
                data: {
                    chave: `jogo_${id_jogo}`,
                    valor: JSON.stringify({
                        id_jogo,
                        data_jogo,
                        processadoEm: new Date().toISOString(),
                        jogadoresProcessados: resultados.sucesso,
                        nomeArquivo: req.file?.originalname
                    })
                }
            });
        });

        // Remove o arquivo após processamento
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(200).json({
            mensagem: `Estatísticas do jogo ${id_jogo} processadas com sucesso para ${resultados.sucesso} jogadores`,
            data_jogo,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar estatísticas do jogo:', error);

        // Garante que o arquivo seja removido em caso de erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao processar estatísticas do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

mainRouter.post('/reprocessar-jogo', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const { id_jogo, data_jogo, force } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }

        const jogosJaProcessados = await prisma.metaDados.findFirst({
            where: { chave: 'jogos_processados' }
        });

        let jogosProcessados: Record<string, any> = {};
        if (jogosJaProcessados && jogosJaProcessados.valor) {
            try {
                jogosProcessados = JSON.parse(jogosJaProcessados.valor);
            } catch (e) {
                console.warn('Erro ao parsear jogos processados:', e);
                jogosProcessados = {};
            }
        }

        if (!jogosProcessados[id_jogo] && !force) {
            res.status(400).json({
                error: `O jogo ${id_jogo} não foi processado anteriormente.`,
                message: 'Use a rota /atualizar-estatisticas para processá-lo pela primeira vez.'
            });
            return;
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        console.log(`Reprocessando estatísticas de ${estatisticasJogo.length} jogadores para o jogo ${id_jogo}`);

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        const estatisticasOriginais = await prisma.metaDados.findFirst({
            where: { chave: `estatisticas_jogo_${id_jogo}` }
        });

        let estatisticasAnteriores: Array<{
            jogadorId: number;
            timeId: number;
            temporada: string;
            estatisticas: any;
        }> = [];

        if (estatisticasOriginais && estatisticasOriginais.valor) {
            try {
                estatisticasAnteriores = JSON.parse(estatisticasOriginais.valor);
            } catch (e) {
                console.warn('Erro ao parsear estatísticas originais:', e);
                estatisticasAnteriores = [];
            }
        }

        await prisma.$transaction(async (tx) => {
            if (estatisticasAnteriores.length > 0) {
                console.log(`Revertendo estatísticas anteriores do jogo ${id_jogo}`);

                for (const estatAnterior of estatisticasAnteriores) {
                    try {
                        const jogador = await tx.jogador.findUnique({
                            where: { id: estatAnterior.jogadorId },
                            include: {
                                times: {
                                    where: {
                                        temporada: estatAnterior.temporada,
                                        timeId: estatAnterior.timeId
                                    }
                                }
                            }
                        });

                        if (!jogador || !jogador.times || jogador.times.length === 0) {
                            console.warn(`Jogador ${estatAnterior.jogadorId} não encontrado para reverter estatísticas`);
                            continue;
                        }

                        const jogadorTime = jogador.times[0];
                        const estatisticasAtuais = jogadorTime.estatisticas as any;

                        const temNovaEstrutura =
                            estatisticasAtuais.passe !== undefined ||
                            estatisticasAtuais.corrida !== undefined ||
                            estatisticasAtuais.recepcao !== undefined;

                        if (temNovaEstrutura && estatAnterior.estatisticas.passe) {
                            const novasEstatisticas = {
                                passe: {
                                    passes_completos: Math.max(0, (estatisticasAtuais.passe?.passes_completos || 0) - (estatAnterior.estatisticas.passe?.passes_completos || 0)),
                                    passes_tentados: Math.max(0, (estatisticasAtuais.passe?.passes_tentados || 0) - (estatAnterior.estatisticas.passe?.passes_tentados || 0)),
                                    passes_incompletos: Math.max(0, (estatisticasAtuais.passe?.passes_incompletos || 0) - (estatAnterior.estatisticas.passe?.passes_incompletos || 0)),
                                    jds_passe: Math.max(0, (estatisticasAtuais.passe?.jds_passe || 0) - (estatAnterior.estatisticas.passe?.jds_passe || 0)),
                                    tds_passe: Math.max(0, (estatisticasAtuais.passe?.tds_passe || 0) - (estatAnterior.estatisticas.passe?.tds_passe || 0)),
                                    passe_xp1: Math.max(0, (estatisticasAtuais.passe?.passe_xp1 || 0) - (estatAnterior.estatisticas.passe?.passe_xp1 || 0)),
                                    passe_xp2: Math.max(0, (estatisticasAtuais.passe?.passe_xp2 || 0) - (estatAnterior.estatisticas.passe?.passe_xp2 || 0)),
                                    int_sofridas: Math.max(0, (estatisticasAtuais.passe?.int_sofridas || 0) - (estatAnterior.estatisticas.passe?.int_sofridas || 0)),
                                    sacks_sofridos: Math.max(0, (estatisticasAtuais.passe?.sacks_sofridos || 0) - (estatAnterior.estatisticas.passe?.sacks_sofridos || 0)),
                                    pressao_pct: estatisticasAtuais.passe?.pressao_pct || "0" // Mantém o valor atual
                                },
                                corrida: {
                                    corridas: Math.max(0, (estatisticasAtuais.corrida?.corridas || 0) - (estatAnterior.estatisticas.corrida?.corridas || 0)),
                                    jds_corridas: Math.max(0, (estatisticasAtuais.corrida?.jds_corridas || 0) - (estatAnterior.estatisticas.corrida?.jds_corridas || 0)),
                                    tds_corridos: Math.max(0, (estatisticasAtuais.corrida?.tds_corridos || 0) - (estatAnterior.estatisticas.corrida?.tds_corridos || 0)),
                                    corrida_xp1: Math.max(0, (estatisticasAtuais.corrida?.corrida_xp1 || 0) - (estatAnterior.estatisticas.corrida?.corrida_xp1 || 0)),
                                    corrida_xp2: Math.max(0, (estatisticasAtuais.corrida?.corrida_xp2 || 0) - (estatAnterior.estatisticas.corrida?.corrida_xp2 || 0))
                                },
                                recepcao: {
                                    recepcoes: Math.max(0, (estatisticasAtuais.recepcao?.recepcoes || 0) - (estatAnterior.estatisticas.recepcao?.recepcoes || 0)),
                                    alvos: Math.max(0, (estatisticasAtuais.recepcao?.alvos || 0) - (estatAnterior.estatisticas.recepcao?.alvos || 0)),
                                    drops: Math.max(0, (estatisticasAtuais.recepcao?.drops || 0) - (estatAnterior.estatisticas.recepcao?.drops || 0)),
                                    jds_recepcao: Math.max(0, (estatisticasAtuais.recepcao?.jds_recepcao || 0) - (estatAnterior.estatisticas.recepcao?.jds_recepcao || 0)),
                                    jds_yac: Math.max(0, (estatisticasAtuais.recepcao?.jds_yac || 0) - (estatAnterior.estatisticas.recepcao?.jds_yac || 0)),
                                    tds_recepcao: Math.max(0, (estatisticasAtuais.recepcao?.tds_recepcao || 0) - (estatAnterior.estatisticas.recepcao?.tds_recepcao || 0)),
                                    recepcao_xp1: Math.max(0, (estatisticasAtuais.recepcao?.recepcao_xp1 || 0) - (estatAnterior.estatisticas.recepcao?.recepcao_xp1 || 0)),
                                    recepcao_xp2: Math.max(0, (estatisticasAtuais.recepcao?.recepcao_xp2 || 0) - (estatAnterior.estatisticas.recepcao?.recepcao_xp2 || 0))
                                },
                                defesa: {
                                    tck: Math.max(0, (estatisticasAtuais.defesa?.tck || 0) - (estatAnterior.estatisticas.defesa?.tck || 0)),
                                    tfl: Math.max(0, (estatisticasAtuais.defesa?.tfl || 0) - (estatAnterior.estatisticas.defesa?.tfl || 0)),
                                    pressao_pct: estatisticasAtuais.defesa?.pressao_pct || "0", // Mantém o valor atual
                                    sacks: Math.max(0, (estatisticasAtuais.defesa?.sacks || 0) - (estatAnterior.estatisticas.defesa?.sacks || 0)),
                                    tip: Math.max(0, (estatisticasAtuais.defesa?.tip || 0) - (estatAnterior.estatisticas.defesa?.tip || 0)),
                                    int: Math.max(0, (estatisticasAtuais.defesa?.int || 0) - (estatAnterior.estatisticas.defesa?.int || 0)),
                                    tds_defesa: Math.max(0, (estatisticasAtuais.defesa?.tds_defesa || 0) - (estatAnterior.estatisticas.defesa?.tds_defesa || 0)),
                                    defesa_xp2: Math.max(0, (estatisticasAtuais.defesa?.defesa_xp2 || 0) - (estatAnterior.estatisticas.defesa?.defesa_xp2 || 0)),
                                    sft: Math.max(0, (estatisticasAtuais.defesa?.sft || 0) - (estatAnterior.estatisticas.defesa?.sft || 0)),
                                    sft_1: Math.max(0, (estatisticasAtuais.defesa?.sft_1 || 0) - (estatAnterior.estatisticas.defesa?.sft_1 || 0)),
                                    blk: Math.max(0, (estatisticasAtuais.defesa?.blk || 0) - (estatAnterior.estatisticas.defesa?.blk || 0)),
                                    jds_defesa: Math.max(0, (estatisticasAtuais.defesa?.jds_defesa || 0) - (estatAnterior.estatisticas.defesa?.jds_defesa || 0))
                                }
                            };

                            await tx.jogadorTime.update({
                                where: { id: jogadorTime.id },
                                data: {
                                    estatisticas: novasEstatisticas
                                }
                            });
                        }
                        else {
                            const novasEstatisticas = {
                                passe: {},
                                corrida: {},
                                recepcao: {},
                                defesa: {}
                            };

                            await tx.jogadorTime.update({
                                where: { id: jogadorTime.id },
                                data: {
                                    estatisticas: novasEstatisticas
                                }
                            });
                        }

                    } catch (error) {
                        console.error(`Erro ao reverter estatísticas para jogador ${estatAnterior.jogadorId}:`, error);
                    }
                }
            }

            const novasEstatisticasJogo: Array<{
                jogadorId: number;
                timeId: number;
                temporada: string;
                estatisticas: any;
            }> = [];

            for (const stat of estatisticasJogo) {
                try {

                    if (!stat.jogador_id && !stat.jogador_nome) {
                        resultados.erros.push({
                            linha: JSON.stringify(stat),
                            erro: 'ID ou nome do jogador é obrigatório'
                        });
                        continue;
                    }

                    const temporada = String(stat.temporada || '2025');

                    let jogador;
                    if (stat.jogador_id) {
                        jogador = await tx.jogador.findUnique({
                            where: { id: parseInt(stat.jogador_id) },
                            include: {
                                times: {
                                    where: { temporada: String(temporada || '2025') },
                                    include: { time: true }
                                }
                            }
                        });
                    } else {
                        if (!stat.time_nome) {
                            resultados.erros.push({
                                jogador: stat.jogador_nome,
                                erro: 'Nome do time é obrigatório quando não há ID do jogador'
                            });
                            continue;
                        }

                        const time = await tx.time.findFirst({
                            where: {
                                nome: stat.time_nome,
                                temporada: String(temporada)
                            }
                        });

                        if (!time) {
                            resultados.erros.push({
                                jogador: stat.jogador_nome,
                                erro: `Time "${stat.time_nome}" não encontrado para a temporada ${temporada}`
                            });
                            continue;
                        }

                        jogador = await tx.jogador.findFirst({
                            where: {
                                nome: stat.jogador_nome,
                                times: {
                                    some: {
                                        timeId: time.id,
                                        temporada: String(temporada)
                                    }
                                }
                            },
                            include: {
                                times: {
                                    where: {
                                        timeId: time.id,
                                        temporada: String(temporada)
                                    }
                                }
                            }
                        });
                    }

                    if (!jogador || !jogador.times || jogador.times.length === 0) {
                        resultados.erros.push({
                            jogador: stat.jogador_nome || stat.jogador_id,
                            erro: 'Jogador não encontrado ou não relacionado a nenhum time'
                        });
                        continue;
                    }

                    const jogadorTime = jogador.times[0];
                    const estatisticasAtuais = jogadorTime.estatisticas as any;

                    const estatisticasDoJogo = {
                        passe: {
                            passes_completos: parseInt(stat.passes_completos) || 0,
                            passes_tentados: parseInt(stat.passes_tentados) || 0,
                            passes_incompletos: parseInt(stat.passes_incompletos) || 0,
                            jds_passe: parseInt(stat.jds_passe) || 0,
                            tds_passe: parseInt(stat.tds_passe) || 0,
                            passe_xp1: parseInt(stat.passe_xp1) || 0,
                            passe_xp2: parseInt(stat.passe_xp2) || 0,
                            int_sofridas: parseInt(stat.int_sofridas) || 0,
                            sacks_sofridos: parseInt(stat.sacks_sofridos) || 0,
                            pressao_pct: stat.pressao_pct || "0"
                        },
                        corrida: {
                            corridas: parseInt(stat.corridas) || 0,
                            jds_corridas: parseInt(stat.jds_corridas) || 0,
                            tds_corridos: parseInt(stat.tds_corridos) || 0,
                            corrida_xp1: parseInt(stat.corrida_xp1) || 0,
                            corrida_xp2: parseInt(stat.corrida_xp2) || 0
                        },
                        recepcao: {
                            recepcoes: parseInt(stat.recepcoes) || 0,
                            alvos: parseInt(stat.alvos) || 0,
                            drops: parseInt(stat.drops) || 0,
                            jds_recepcao: parseInt(stat.jds_recepcao) || 0,
                            jds_yac: parseInt(stat.jds_yac) || 0,
                            tds_recepcao: parseInt(stat.tds_recepcao) || 0,
                            recepcao_xp1: parseInt(stat.recepcao_xp1) || 0,
                            recepcao_xp2: parseInt(stat.recepcao_xp2) || 0
                        },
                        defesa: {
                            tck: parseInt(stat.tck) || 0,
                            tfl: parseInt(stat.tfl) || 0,
                            pressao_pct: stat.pressao_pct_def || "0",
                            sacks: parseInt(stat.sacks) || 0,
                            tip: parseInt(stat.tip) || 0,
                            int: parseInt(stat.int) || 0,
                            tds_defesa: parseInt(stat.tds_defesa) || 0,
                            defesa_xp2: parseInt(stat.defesa_xp2) || 0,
                            sft: parseInt(stat.sft) || 0,
                            sft_1: parseInt(stat.sft_1) || 0,
                            blk: parseInt(stat.blk) || 0,
                            jds_defesa: parseInt(stat.jds_defesa) || 0
                        }
                    };

                    novasEstatisticasJogo.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada,
                        estatisticas: estatisticasDoJogo
                    });

                    const temNovaEstrutura =
                        estatisticasAtuais.passe !== undefined ||
                        estatisticasAtuais.corrida !== undefined ||
                        estatisticasAtuais.recepcao !== undefined ||
                        estatisticasAtuais.defesa !== undefined;

                    const baseEstatisticas = temNovaEstrutura ? estatisticasAtuais : {
                        passe: {},
                        corrida: {},
                        recepcao: {},
                        defesa: {}
                    };

                    const novasEstatisticasTotais = {
                        passe: {
                            passes_completos: (baseEstatisticas.passe?.passes_completos || 0) + estatisticasDoJogo.passe.passes_completos,
                            passes_tentados: (baseEstatisticas.passe?.passes_tentados || 0) + estatisticasDoJogo.passe.passes_tentados,
                            passes_incompletos: (baseEstatisticas.passe?.passes_incompletos || 0) + estatisticasDoJogo.passe.passes_incompletos,
                            jds_passe: (baseEstatisticas.passe?.jds_passe || 0) + estatisticasDoJogo.passe.jds_passe,
                            tds_passe: (baseEstatisticas.passe?.tds_passe || 0) + estatisticasDoJogo.passe.tds_passe,
                            passe_xp1: (baseEstatisticas.passe?.passe_xp1 || 0) + estatisticasDoJogo.passe.passe_xp1,
                            passe_xp2: (baseEstatisticas.passe?.passe_xp2 || 0) + estatisticasDoJogo.passe.passe_xp2,
                            int_sofridas: (baseEstatisticas.passe?.int_sofridas || 0) + estatisticasDoJogo.passe.int_sofridas,
                            sacks_sofridos: (baseEstatisticas.passe?.sacks_sofridos || 0) + estatisticasDoJogo.passe.sacks_sofridos,
                            pressao_pct: estatisticasDoJogo.passe.pressao_pct 
                        },
                        corrida: {
                            corridas: (baseEstatisticas.corrida?.corridas || 0) + estatisticasDoJogo.corrida.corridas,
                            jds_corridas: (baseEstatisticas.corrida?.jds_corridas || 0) + estatisticasDoJogo.corrida.jds_corridas,
                            tds_corridos: (baseEstatisticas.corrida?.tds_corridos || 0) + estatisticasDoJogo.corrida.tds_corridos,
                            corrida_xp1: (baseEstatisticas.corrida?.corrida_xp1 || 0) + estatisticasDoJogo.corrida.corrida_xp1,
                            corrida_xp2: (baseEstatisticas.corrida?.corrida_xp2 || 0) + estatisticasDoJogo.corrida.corrida_xp2
                        },
                        recepcao: {
                            recepcoes: (baseEstatisticas.recepcao?.recepcoes || 0) + estatisticasDoJogo.recepcao.recepcoes,
                            alvos: (baseEstatisticas.recepcao?.alvos || 0) + estatisticasDoJogo.recepcao.alvos,
                            drops: (baseEstatisticas.recepcao?.drops || 0) + estatisticasDoJogo.recepcao.drops,
                            jds_recepcao: (baseEstatisticas.recepcao?.jds_recepcao || 0) + estatisticasDoJogo.recepcao.jds_recepcao,
                            jds_yac: (baseEstatisticas.recepcao?.jds_yac || 0) + estatisticasDoJogo.recepcao.jds_yac,
                            tds_recepcao: (baseEstatisticas.recepcao?.tds_recepcao || 0) + estatisticasDoJogo.recepcao.tds_recepcao,
                            recepcao_xp1: (baseEstatisticas.recepcao?.recepcao_xp1 || 0) + estatisticasDoJogo.recepcao.recepcao_xp1,
                            recepcao_xp2: (baseEstatisticas.recepcao?.recepcao_xp2 || 0) + estatisticasDoJogo.recepcao.recepcao_xp2
                        },
                        defesa: {
                            tck: (baseEstatisticas.defesa?.tck || 0) + estatisticasDoJogo.defesa.tck,
                            tfl: (baseEstatisticas.defesa?.tfl || 0) + estatisticasDoJogo.defesa.tfl,
                            pressao_pct: estatisticasDoJogo.defesa.pressao_pct, 
                            sacks: (baseEstatisticas.defesa?.sacks || 0) + estatisticasDoJogo.defesa.sacks,
                            tip: (baseEstatisticas.defesa?.tip || 0) + estatisticasDoJogo.defesa.tip,
                            int: (baseEstatisticas.defesa?.int || 0) + estatisticasDoJogo.defesa.int,
                            tds_defesa: (baseEstatisticas.defesa?.tds_defesa || 0) + estatisticasDoJogo.defesa.tds_defesa,
                            defesa_xp2: (baseEstatisticas.defesa?.defesa_xp2 || 0) + estatisticasDoJogo.defesa.defesa_xp2,
                            sft: (baseEstatisticas.defesa?.sft || 0) + estatisticasDoJogo.defesa.sft,
                            sft_1: (baseEstatisticas.defesa?.sft_1 || 0) + estatisticasDoJogo.defesa.sft_1,
                            blk: (baseEstatisticas.defesa?.blk || 0) + estatisticasDoJogo.defesa.blk,
                            jds_defesa: (baseEstatisticas.defesa?.jds_defesa || 0) + estatisticasDoJogo.defesa.jds_defesa
                        }
                    };

                    await tx.jogadorTime.update({
                        where: { id: jogadorTime.id },
                        data: {
                            estatisticas: novasEstatisticasTotais
                        }
                    });

                    resultados.sucesso++;
                } catch (error) {
                    console.error(`Erro ao processar estatísticas para jogador:`, error);
                    resultados.erros.push({
                        jogador: stat.jogador_nome || stat.jogador_id || 'Desconhecido',
                        erro: error instanceof Error ? error.message : 'Erro desconhecido'
                    });
                }
            }
            await tx.metaDados.upsert({
                where: { chave: `estatisticas_jogo_${id_jogo}` },
                update: { valor: JSON.stringify(novasEstatisticasJogo) },
                create: {
                    chave: `estatisticas_jogo_${id_jogo}`,
                    valor: JSON.stringify(novasEstatisticasJogo)
                }
            });

            jogosProcessados[id_jogo] = {
                dataJogo: data_jogo,
                processadoEm: new Date().toISOString(),
                reprocessado: true
            };

            await tx.metaDados.upsert({
                where: { chave: 'jogos_processados' },
                update: { valor: JSON.stringify(jogosProcessados) },
                create: {
                    chave: 'jogos_processados',
                    valor: JSON.stringify(jogosProcessados)
                }
            });

            await tx.metaDados.upsert({
                where: { chave: `jogo_${id_jogo}` },
                update: {
                    valor: JSON.stringify({
                        id_jogo,
                        data_jogo,
                        processadoEm: new Date().toISOString(),
                        jogadoresProcessados: resultados.sucesso,
                        nomeArquivo: req.file?.originalname,
                        reprocessado: true
                    })
                },
                create: {
                    chave: `jogo_${id_jogo}`,
                    valor: JSON.stringify({
                        id_jogo,
                        data_jogo,
                        processadoEm: new Date().toISOString(),
                        jogadoresProcessados: resultados.sucesso,
                        nomeArquivo: req.file?.originalname,
                        reprocessado: true
                    })
                }
            });
        });

        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Estatísticas do jogo ${id_jogo} reprocessadas com sucesso para ${resultados.sucesso} jogadores`,
            data_jogo,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao reprocessar estatísticas do jogo:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao reprocessar estatísticas do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

mainRouter.get('/jogos-processados', async (req, res) => {
    try {
        console.log('Rota /jogos-processados acessada');

        const metaDados = await prisma.metaDados.findFirst({
            where: { chave: 'jogos_processados' }
        });

        if (!metaDados || !metaDados.valor) {
            console.log('Nenhum jogo processado encontrado');
            res.status(200).json({ jogos: [] });
            return; 
        }

        if (metaDados.valor.length > 5000000) { 
            console.warn('Dados muito grandes, enviando versão simplificada');
            res.status(200).json({
                jogos: [],
                error: 'Dados muito grandes para processar',
                message: 'Por favor, contate o administrador do sistema'
            });
            return;
        }

        let jogosProcessados: Record<string, any> = {};
        try {
            const parsed = JSON.parse(metaDados.valor);

            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Formato de dados inválido');
            }

            jogosProcessados = parsed as Record<string, any>;

            console.log(`Encontrados ${Object.keys(jogosProcessados).length} jogos processados`);
        } catch (e) {
            console.error('Erro ao fazer parse do JSON de jogos processados:', e);
            res.status(200).json({
                jogos: [],
                error: 'Erro ao processar dados de jogos'
            });
            return; 
        }

        const MAX_JOGOS = 100;
        const jogoKeys = Object.keys(jogosProcessados).slice(0, MAX_JOGOS);

        const jogosArray = [];
        for (const id_jogo of jogoKeys) {
            const dados = jogosProcessados[id_jogo];
            if (dados && typeof dados === 'object') {
                jogosArray.push({
                    id_jogo,
                    data_jogo: dados.dataJogo || 'Data desconhecida',
                    processado_em: dados.processadoEm || new Date().toISOString(),
                    reprocessado: !!dados.reprocessado
                });
            }
        }

        jogosArray.sort((a, b) => {

            const dateA = new Date(a.processado_em).getTime();
            const dateB = new Date(b.processado_em).getTime();

            if (isNaN(dateA) || isNaN(dateB)) return 0;

            return dateB - dateA; 
        });

        res.status(200).json({
            jogos: jogosArray,
            total: Object.keys(jogosProcessados).length,
            limit: MAX_JOGOS
        });
        return; 

    } catch (error) {
        console.error('Erro ao buscar jogos processados:', error);
        res.status(200).json({
            jogos: [],
            error: 'Erro interno ao buscar jogos processados'
        });
    }
});