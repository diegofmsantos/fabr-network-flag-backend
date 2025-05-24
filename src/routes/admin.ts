import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { Times } from '../data/times'
import fs from 'fs';
import path from 'path';
import multer from 'multer'

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

mainRouter.get('/transferencias-json', (req: Request, res: Response) => {
    try {
        const temporadaOrigem = req.query.temporadaOrigem as string;
        const temporadaDestino = req.query.temporadaDestino as string;

        // Validar parâmetros
        if (!temporadaOrigem || !temporadaDestino) {
            res.status(400).json({
                error: 'Parâmetros temporadaOrigem e temporadaDestino são obrigatórios'
            });
            return;
        }

        // Caminho para o arquivo JSON
        const filePath = path.join(process.cwd(), 'public', 'data',
            `transferencias_${temporadaOrigem}_${temporadaDestino}.json`);

        console.log(`Buscando arquivo de transferências: ${filePath}`);

        // Verificar se o arquivo existe
        if (!fs.existsSync(filePath)) {
            console.log(`Arquivo de transferências não encontrado: ${filePath}`);
            res.status(404).json({
                error: `Não foram encontradas transferências de ${temporadaOrigem} para ${temporadaDestino}`
            });
            return;
        }

        // Ler o conteúdo do arquivo
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');

            // Processar o JSON
            try {
                const transferencias = JSON.parse(fileContent);
                res.status(200).json(transferencias);
            } catch (parseError) {
                console.error('Erro ao fazer parse do JSON:', parseError);
                res.status(500).json({ error: 'Arquivo de transferências está corrompido' });
            }
        } catch (readError) {
            console.error('Erro ao ler arquivo:', readError);
            res.status(500).json({ error: 'Erro ao ler arquivo de transferências' });
        }
    } catch (error) {
        console.error('Erro geral ao buscar transferências:', error);
        res.status(500).json({ error: 'Erro ao buscar transferências' });
    }
});

// Rota para iniciar nova temporada
mainRouter.post('/iniciar-temporada/:ano', async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
        try {
            const { ano } = req.params;
            const anoAnterior = (parseInt(ano) - 1).toString();

            interface TimeChange {
                timeId: number;
                nome?: string;
                sigla?: string;
                cor?: string;
                instagram?: string;
                instagram2?: string;
                logo?: string;
                regiao?: string;
                sexo?: string;
            }

            interface Transferencia {
                jogadorId: number;
                jogadorNome?: string;
                timeOrigemId?: number;
                timeOrigemNome?: string;
                novoTimeId: number;
                novoTimeNome?: string;
                novoNumero?: number;
                novaCamisa?: string;
            }

            const timesAnoAnterior = await tx.time.findMany({
                where: { temporada: anoAnterior },
            });

            if (timesAnoAnterior.length === 0) {
                throw new Error(`Nenhum time encontrado na temporada ${anoAnterior}`);
            }

            const mapeamentoIds = new Map();
            const mapeamentoNomes = new Map();

            const timesNovos = [];
            for (const time of timesAnoAnterior) {
                const timeId = time.id;
                const nomeAntigo = time.nome;

                const timeChanges: TimeChange[] = req.body.timeChanges || [];
                const timeChange = timeChanges.find((tc: TimeChange) => tc.timeId === timeId);

                const nomeNovo = timeChange?.nome || time.nome;

                const novoTime = await tx.time.create({
                    data: {
                        nome: nomeNovo,
                        sigla: timeChange?.sigla || time.sigla,
                        cor: timeChange?.cor || time.cor,
                        cidade: time.cidade,
                        bandeira_estado: time.bandeira_estado,
                        instagram: timeChange?.instagram || time.instagram,
                        instagram2: timeChange?.instagram2 || time.instagram2,
                        logo: timeChange?.logo || time.logo,
                        temporada: ano,
                        regiao: timeChange?.regiao || time.regiao || "", 
                        sexo: timeChange?.sexo || time.sexo || "", 
                    },
                });

                mapeamentoIds.set(timeId, novoTime.id);

                if (nomeAntigo !== nomeNovo) {
                    mapeamentoNomes.set(nomeAntigo, {
                        novoNome: nomeNovo,
                        novoId: novoTime.id
                    });
                }

                timesNovos.push(novoTime);
            }

            const jogadoresTimesAnoAnterior = await tx.jogadorTime.findMany({
                where: { temporada: anoAnterior },
                include: { jogador: true, time: true },
            });

            const jogadoresProcessados = new Set<number>();

            const transferencias = req.body.transferencias || [];

            for (const transferencia of transferencias) {
                try {
                    const jogadorId = transferencia.jogadorId;

                    if (jogadoresProcessados.has(jogadorId)) {
                        continue;
                    }

                    const jogador = await tx.jogador.findUnique({
                        where: { id: jogadorId }
                    });

                    if (!jogador) {
                        continue;
                    }

                    const relacaoAtual = await tx.jogadorTime.findFirst({
                        where: {
                            jogadorId: jogadorId,
                            temporada: anoAnterior
                        },
                        include: { time: true }
                    });

                    if (!relacaoAtual) {
                        continue;
                    }

                    let timeDestino = null;

                    if (transferencia.novoTimeId) {
                        const novoId = mapeamentoIds.get(transferencia.novoTimeId);
                        if (novoId) {
                            timeDestino = await tx.time.findUnique({
                                where: { id: novoId }
                            });
                        }
                    }

                    if (!timeDestino && transferencia.novoTimeNome) {
                        timeDestino = await tx.time.findFirst({
                            where: {
                                nome: transferencia.novoTimeNome,
                                temporada: ano
                            }
                        });
                    }

                    if (!timeDestino && transferencia.novoTimeNome) {
                        for (const [antigo, info] of mapeamentoNomes.entries()) {
                            if (info.novoNome === transferencia.novoTimeNome) {
                                timeDestino = await tx.time.findUnique({
                                    where: { id: info.novoId }
                                });
                                if (timeDestino) {
                                    break;
                                }
                            }
                        }
                    }

                    if (!timeDestino) {
                        continue;
                    }

                    const estatisticasVazias = {
                        passe: {},
                        corrida: {},
                        recepcao: {},
                        defesa: {}
                    };

                    let estatisticasNovas = estatisticasVazias;

                    if (relacaoAtual.estatisticas) {
                        const estatisticasAntigas = relacaoAtual.estatisticas as any;

                        if (estatisticasAntigas.passe || estatisticasAntigas.corrida ||
                            estatisticasAntigas.recepcao || estatisticasAntigas.defesa) {

                            estatisticasNovas = estatisticasAntigas;
                        } else {
                            try {
                                estatisticasNovas = {
                                    passe: {
                                        passes_completos: estatisticasAntigas.ataque?.passes_completos || 0,
                                        passes_tentados: estatisticasAntigas.ataque?.passes_tentados || 0,
                                        passes_incompletos: 0,
                                        jds_passe: 0,
                                        tds_passe: estatisticasAntigas.ataque?.td_passado || 0,
                                        passe_xp1: 0,
                                        passe_xp2: 0,
                                        int_sofridas: estatisticasAntigas.ataque?.interceptacoes_sofridas || 0,
                                        sacks_sofridos: estatisticasAntigas.ataque?.sacks_sofridos || 0,
                                        pressao_pct: "0"
                                    },
                                    corrida: {
                                        corridas: 0,
                                        jds_corridas: estatisticasAntigas.ataque?.corrida || 0,
                                        tds_corridos: estatisticasAntigas.ataque?.tds_corridos || 0,
                                        corrida_xp1: 0,
                                        corrida_xp2: 0
                                    },
                                    recepcao: {
                                        recepcoes: estatisticasAntigas.ataque?.recepcao || 0,
                                        alvos: estatisticasAntigas.ataque?.alvo || 0,
                                        drops: 0,
                                        jds_recepcao: 0,
                                        jds_yac: 0,
                                        tds_recepcao: estatisticasAntigas.ataque?.td_recebido || 0,
                                        recepcao_xp1: 0,
                                        recepcao_xp2: 0
                                    },
                                    defesa: {
                                        tck: 0,
                                        tfl: 0,
                                        pressao_pct: "0",
                                        sacks: estatisticasAntigas.defesa?.sack || 0,
                                        tip: estatisticasAntigas.defesa?.passe_desviado || 0,
                                        int: estatisticasAntigas.defesa?.interceptacao_forcada || 0,
                                        tds_defesa: estatisticasAntigas.defesa?.td_defensivo || 0,
                                        defesa_xp2: 0,
                                        sft: 0,
                                        sft_1: 0,
                                        blk: 0,
                                        jds_defesa: 0
                                    }
                                };
                            } catch (convError) {
                                console.error("Erro ao converter estatísticas:", convError);
                                estatisticasNovas = estatisticasVazias;
                            }
                        }
                    }

                    const novoVinculo = await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: timeDestino.id,
                            temporada: ano,
                            numero: transferencia.novoNumero || relacaoAtual.numero,
                            camisa: transferencia.novaCamisa || relacaoAtual.camisa,
                            estatisticas: estatisticasNovas
                        }
                    });

                    jogadoresProcessados.add(jogadorId);

                } catch (error) {
                    console.error(`Erro ao processar transferência:`, error);
                }
            }

            let jogadoresRegularesProcessados = 0;

            for (const jt of jogadoresTimesAnoAnterior) {
                try {
                    const jogadorId = jt.jogadorId;

                    if (jogadoresProcessados.has(jogadorId)) {
                        continue;
                    }

                    const timeOriginalId = jt.timeId;
                    const novoTimeId = mapeamentoIds.get(timeOriginalId);

                    if (!novoTimeId) {
                        console.error(`Não foi encontrado novo ID para o time original ${timeOriginalId}`);
                        continue;
                    }

                    const estatisticasVazias = {
                        passe: {},
                        corrida: {},
                        recepcao: {},
                        defesa: {}
                    };

                    let estatisticasNovas = estatisticasVazias;

                    if (jt.estatisticas) {
                        const estatisticasAntigas = jt.estatisticas as any;

                        if (estatisticasAntigas.passe || estatisticasAntigas.corrida ||
                            estatisticasAntigas.recepcao || estatisticasAntigas.defesa) {

                            estatisticasNovas = estatisticasAntigas;
                        } else {

                            try {
                                estatisticasNovas = {
                                    passe: {
                                        passes_completos: estatisticasAntigas.ataque?.passes_completos || 0,
                                        passes_tentados: estatisticasAntigas.ataque?.passes_tentados || 0,
                                        passes_incompletos: 0,
                                        jds_passe: 0,
                                        tds_passe: estatisticasAntigas.ataque?.td_passado || 0,
                                        passe_xp1: 0,
                                        passe_xp2: 0,
                                        int_sofridas: estatisticasAntigas.ataque?.interceptacoes_sofridas || 0,
                                        sacks_sofridos: estatisticasAntigas.ataque?.sacks_sofridos || 0,
                                        pressao_pct: "0"
                                    },
                                    corrida: {
                                        corridas: 0,
                                        jds_corridas: estatisticasAntigas.ataque?.corrida || 0,
                                        tds_corridos: estatisticasAntigas.ataque?.tds_corridos || 0,
                                        corrida_xp1: 0,
                                        corrida_xp2: 0
                                    },
                                    recepcao: {
                                        recepcoes: estatisticasAntigas.ataque?.recepcao || 0,
                                        alvos: estatisticasAntigas.ataque?.alvo || 0,
                                        drops: 0,
                                        jds_recepcao: 0,
                                        jds_yac: 0,
                                        tds_recepcao: estatisticasAntigas.ataque?.td_recebido || 0,
                                        recepcao_xp1: 0,
                                        recepcao_xp2: 0
                                    },
                                    defesa: {
                                        tck: 0,
                                        tfl: 0,
                                        pressao_pct: "0",
                                        sacks: estatisticasAntigas.defesa?.sack || 0,
                                        tip: estatisticasAntigas.defesa?.passe_desviado || 0,
                                        int: estatisticasAntigas.defesa?.interceptacao_forcada || 0,
                                        tds_defesa: estatisticasAntigas.defesa?.td_defensivo || 0,
                                        defesa_xp2: 0,
                                        sft: 0,
                                        sft_1: 0,
                                        blk: 0,
                                        jds_defesa: 0
                                    }
                                };
                            } catch (convError) {
                                console.error("Erro ao converter estatísticas:", convError);

                                estatisticasNovas = estatisticasVazias;
                            }
                        }
                    }

                    await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: novoTimeId,
                            temporada: ano,
                            numero: jt.numero,
                            camisa: jt.camisa,
                            estatisticas: estatisticasNovas
                        }
                    });

                    jogadoresRegularesProcessados++;

                    jogadoresProcessados.add(jogadorId);

                } catch (error) {
                    console.error(`Erro ao processar jogador regular:`, error);
                }
            }


            const saveTransferenciasToJson = async (
                transferencias: Transferencia[],
                anoOrigem: string,
                anoDestino: string
            ): Promise<number> => {
                try {
                    const dirPath = path.join(process.cwd(), 'public', 'data');

                    if (!fs.existsSync(dirPath)) {
                        console.log(`Criando diretório: ${dirPath}`);
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    const transferenciasFormatadas = [];

                    for (const transferencia of transferencias) {
                        const jogador = await prisma.jogador.findUnique({
                            where: { id: transferencia.jogadorId }
                        });

                        const timeOrigem = transferencia.timeOrigemId ?
                            await prisma.time.findUnique({ where: { id: transferencia.timeOrigemId } }) :
                            null;

                        const timeDestino = await prisma.time.findUnique({
                            where: { id: transferencia.novoTimeId }
                        });

                        transferenciasFormatadas.push({
                            id: transferencia.jogadorId,
                            jogadorNome: jogador?.nome || transferencia.jogadorNome,
                            timeOrigemId: transferencia.timeOrigemId,
                            timeOrigemNome: timeOrigem?.nome || '',
                            timeOrigemSigla: timeOrigem?.sigla || '',
                            timeDestinoId: transferencia.novoTimeId,
                            timeDestinoNome: timeDestino?.nome || transferencia.novoTimeNome,
                            timeDestinoSigla: timeDestino?.sigla || '',
                            novoNumero: transferencia.novoNumero || null,
                            novaCamisa: transferencia.novaCamisa || null,
                            data: new Date().toISOString()
                        });
                    }

                    const filePath = path.join(dirPath, `transferencias_${anoOrigem}_${anoDestino}.json`);
                    console.log(`Salvando transferências em: ${filePath}`);

                    fs.writeFileSync(filePath, JSON.stringify(transferenciasFormatadas, null, 2));
                    console.log(`${transferenciasFormatadas.length} transferências salvas com sucesso em ${filePath}`);
                    return transferenciasFormatadas.length;
                } catch (error) {
                    console.error('Erro ao salvar transferências em JSON:', error);
                    return 0;
                }
            };

            const totalSalvo = await saveTransferenciasToJson(transferencias, anoAnterior, ano);
            console.log(`Total de ${totalSalvo} transferências salvas em JSON`);
            const jogadoresNovaTemporada = await tx.jogadorTime.count({
                where: { temporada: ano }
            });

            console.log(`Contagem final: ${jogadoresNovaTemporada} jogadores na temporada ${ano}`);

            return {
                message: `Temporada ${ano} iniciada com sucesso!`,
                times: timesNovos.length,
                jogadores: jogadoresRegularesProcessados + transferencias.length,
                transferencias: transferencias.length
            };

        } catch (error) {
            console.error(`Erro ao iniciar temporada:`, error);
            throw error;
        }
    }, {
        timeout: 120000,
    });

    res.status(200).json(result);
});



mainRouter.post('/importar-dados', async (req, res) => {
    try {
        const teamsData = Times
        const createdTeams = []

        for (const teamData of teamsData) {
            // Cria o time
            const createdTeam = await prisma.time.create({
                data: {
                    nome: teamData.nome || '',
                    sigla: teamData.sigla || '',
                    cor: teamData.cor || '',
                    cidade: teamData.cidade || '',
                    bandeira_estado: teamData.bandeira_estado || '',
                    instagram: teamData.instagram || '',
                    instagram2: teamData.instagram2 || '',
                    logo: teamData.logo || '',
                    temporada: teamData.temporada || '2025',
                    regiao: teamData.regiao || '',
                    sexo: teamData.sexo || ''
                },
            })

            createdTeams.push(createdTeam)

            if (teamData.jogadores && teamData.jogadores.length > 0) {
                for (const player of teamData.jogadores) {

                    const jogadorCriado = await prisma.jogador.create({
                        data: {
                            nome: player.nome || '',
                        },
                    })

                    await prisma.jogadorTime.create({
                        data: {
                            jogadorId: jogadorCriado.id,
                            timeId: createdTeam.id,
                            temporada: teamData.temporada || '2025', 
                            numero: player.numero || 0, 
                            camisa: player.camisa || '', 
                            estatisticas: player.estatisticas || {},
                        },
                    })
                }
            }
        }

        res.status(201).json({ message: 'Dados importados com sucesso!', teams: createdTeams.length })
    } catch (error) {
        console.error('Erro ao importar os dados:', error)
        res.status(500).json({ error: 'Erro ao importar os dados' })
    }
})