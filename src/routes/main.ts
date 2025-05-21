import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { TimeSchema } from '../schemas/Time'
import { JogadorSchema } from '../schemas/Jogador'
import { Times } from '../data/times'
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
        cb(null, uploadDir); // Usa a pasta uploads
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
    limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5 MB
});


const prisma = new PrismaClient()

export const mainRouter = express.Router()

// Rota para obter todos os times com seus jogadores, com filtro opcional de temporada
mainRouter.get('/times', async (req, res) => {
    console.log('Rota /api/times chamada')
    try {
        const { temporada } = req.query
        const temporadaFiltro = temporada ? String(temporada) : '2025' // Default para 2025 se não especificado

        const times = await prisma.time.findMany({
            where: { temporada: temporadaFiltro },
            include: {
                jogadores: {
                    where: { temporada: temporadaFiltro },
                    include: { jogador: true }
                },
            },
        });

        // Transformar os dados para manter compatibilidade com o frontend existente
        const timesFormatados = times.map(time => ({
            ...time,
            jogadores: time.jogadores.map(jt => ({
                ...jt.jogador,
                numero: jt.numero,
                camisa: jt.camisa,
                estatisticas: jt.estatisticas,
                timeId: time.id,
                temporada: jt.temporada
            }))
        }));

        res.status(200).json(timesFormatados)
    } catch (error) {
        console.error('Erro ao buscar os times:', error)
        res.status(500).json({ error: 'Erro ao buscar os times' })
    }
})

// Rota para adicionar um único time e seus jogadores
mainRouter.post('/time', async (req, res) => {
    try {
        const teamData = TimeSchema.parse(req.body)

        // Criação do time sem permitir campos `undefined`
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
                regiao: teamData.regiao || '',
                sexo: teamData.sexo || '',
                temporada: teamData.temporada || '2025',
            },
        })

        // Criação dos jogadores e seus vínculos com times
        if (teamData.jogadores && teamData.jogadores.length > 0) {
            for (const player of teamData.jogadores) {
                // Primeiro, cria o jogador
                const jogadorCriado = await prisma.jogador.create({
                    data: {
                        nome: player.nome || '',
                    },
                })

                // Depois, cria o vínculo entre jogador e time
                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: jogadorCriado.id,
                        timeId: createdTeam.id,
                        temporada: teamData.temporada || '2025', // Adicionando campo temporada
                        numero: player.numero || 0, // Adicionando número padrão
                        camisa: player.camisa || '', // Adicionando camisa padrão
                        estatisticas: player.estatisticas || {},
                    },
                })
            }
        }

        res.status(201).json({
            team: createdTeam,
            players: teamData.jogadores?.length ? 'Jogadores criados' : 'Nenhum jogador adicionado',
        })
    } catch (error) {
        console.error('Erro ao criar time e jogadores:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        })
    }
})

// Rota para atualizar informações de um time
mainRouter.put('/time/:id', async (req, res) => {
    const { id } = req.params

    try {
        // Remove o campo 'id' do objeto antes de enviar para o Prisma
        const timeData = TimeSchema.parse(req.body) // Valida os dados recebidos
        const { id: _, jogadores, ...updateData } = timeData // Remove campos indesejados como 'id' ou relações

        const updatedTime = await prisma.time.update({
            where: { id: parseInt(id) }, // Identifica o time pelo ID
            data: updateData, // Atualiza apenas os campos válidos
        })

        res.status(200).json(updatedTime)
    } catch (error) {
        console.error('Erro ao atualizar o time:', error)
        res.status(500).json({ error: 'Erro ao atualizar o time' })
    }
})

//Rota para deletar um time
mainRouter.delete('/time/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
        // Extrai o ID do time dos parâmetros da URL
        const id = parseInt(req.params.id, 10)

        // Verifica se o ID é válido
        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" })
            return
        }

        // Verifica se o time existe no banco de dados
        const existingTime = await prisma.time.findUnique({
            where: { id },
        })

        if (!existingTime) {
            res.status(404).json({ error: "Time não encontrado" })
            return
        }

        // Primeiro, exclui todos os vínculos de jogadores com esse time
        await prisma.jogadorTime.deleteMany({
            where: { timeId: id },
        })

        // Depois, deleta o time do banco de dados
        await prisma.time.delete({
            where: { id },
        })

        // Retorna uma mensagem de sucesso
        res.status(200).json({ message: "Time excluído com sucesso!" })
    } catch (error) {
        console.error("Erro ao excluir time:", error)
        res.status(500).json({ error: "Erro ao excluir time" })
    }
})

// Rota para buscar jogadores
mainRouter.get('/jogadores', async (req, res) => {
    try {
        const {
            temporada = '2025',
            timeId,
            includeAllTemporadas = false
        } = req.query;

        console.log('Parâmetros recebidos na busca de jogadores:', {
            temporada,
            timeId,
            includeAllTemporadas
        });

        // Configurações de filtro base
        const whereCondition: any = {
            temporada: String(temporada)
        };

        // Adicionar filtro de time se fornecido
        if (timeId) {
            whereCondition.timeId = parseInt(String(timeId));
        }

        // Buscar vínculos de jogadores com suas informações
        const jogadoresTimesQuery = await prisma.jogadorTime.findMany({
            where: whereCondition,
            include: {
                jogador: true,
                time: true
            },
            orderBy: [
                { numero: 'asc' },
                { jogador: { nome: 'asc' } }
            ]
        });

        // Tratamento de dados para formato consistente
        const jogadoresFormatados = jogadoresTimesQuery.map(jt => ({
            ...jt.jogador,
            numero: jt.numero,
            camisa: jt.camisa,
            estatisticas: jt.estatisticas || {},
            timeId: jt.timeId,
            time: jt.time ? {
                id: jt.time.id,
                nome: jt.time.nome,
                sigla: jt.time.sigla,
                cor: jt.time.cor
            } : null,
            temporada: jt.temporada
        }));

        // Se solicitado, incluir jogadores de outras temporadas
        if (includeAllTemporadas === 'true' && !timeId) {
            // Buscar todas as temporadas do jogador
            const jogadoresTodasTemporadas = await prisma.jogadorTime.findMany({
                where: {
                    jogadorId: { in: jogadoresFormatados.map(j => j.id) }
                },
                include: {
                    jogador: true,
                    time: true
                },
                distinct: ['jogadorId', 'temporada']
            });

            // Adicionar informações de outras temporadas
            jogadoresFormatados.forEach(jogador => { // @ts-ignore
                jogador.historicoTemporadas = jogadoresTodasTemporadas
                    .filter(jt => jt.jogadorId === jogador.id)
                    .map(jt => ({
                        temporada: jt.temporada,
                        time: jt.time ? {
                            id: jt.time.id,
                            nome: jt.time.nome,
                            sigla: jt.time.sigla
                        } : null
                    }));
            });
        }

        console.log(`Jogadores encontrados: ${jogadoresFormatados.length}`);

        res.status(200).json(jogadoresFormatados);
    } catch (error) {
        console.error('Erro na rota de jogadores:', error);
        res.status(500).json({
            error: 'Erro ao buscar jogadores',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

// Rota para buscar um jogador específico
mainRouter.get('/jogador/:id/temporada/:ano', async (req: Request, res: Response) => {
    try {
        const { id, ano } = req.params;
        const jogadorId = parseInt(id, 10);

        if (isNaN(jogadorId)) {
            res.status(400).json({ error: 'ID do jogador inválido' });
            return;
        }

        const jogadorTime = await prisma.jogadorTime.findFirst({
            where: {
                jogadorId,
                temporada: ano,
            },
            include: {
                jogador: true,
                time: true,
            },
        });

        if (!jogadorTime) {
            res.status(404).json({ error: 'Jogador não encontrado nesta temporada' });
            return;
        }

        res.status(200).json({
            jogador: jogadorTime.jogador,
            time: jogadorTime.time,
            estatisticas: jogadorTime.estatisticas,
            numero: jogadorTime.numero,
            camisa: jogadorTime.camisa,
        });
        return;

    } catch (error) {
        console.error('Erro ao buscar jogador:', error);
        res.status(500).json({ error: 'Erro ao buscar jogador' });
        return;
    }
});

// Rota para adicionar um jogador a um time
mainRouter.post('/jogador', async (req, res) => {
    try {
        const { temporada = '2025', ...jogadorRawData } = req.body;
        const jogadorData = JogadorSchema.parse(jogadorRawData);

        // Preparar os dados de estatísticas com a nova estrutura
        const estatisticas = {
            passe: jogadorData.estatisticas?.passe ?? {},
            corrida: jogadorData.estatisticas?.corrida ?? {},
            recepcao: jogadorData.estatisticas?.recepcao ?? {},
            defesa: jogadorData.estatisticas?.defesa ?? {}
        };

        // Verifica se timeId foi fornecido
        if (!jogadorData.timeId) {
            res.status(400).json({ error: 'O campo "timeId" é obrigatório.' });
            return;
        }

        // Verifica se o time existe
        const timeExiste = await prisma.time.findUnique({
            where: { id: jogadorData.timeId }
        });

        if (!timeExiste) {
            res.status(404).json({ error: 'Time não encontrado.' });
            return;
        }

        // Adiciona o nome do time ao jogador
        const time_nome = timeExiste.nome;

        // Primeiro, cria o jogador
        const jogadorCriado = await prisma.jogador.create({
            data: {
                nome: jogadorData.nome ?? '',
            },
        });

        // Depois, cria o vínculo do jogador com o time na temporada
        const jogadorTimeVinculo = await prisma.jogadorTime.create({
            data: {
                jogadorId: jogadorCriado.id,
                timeId: jogadorData.timeId,
                temporada: String(temporada),
                numero: jogadorData.numero || 0,
                camisa: jogadorData.camisa || '',
                estatisticas: estatisticas,
            }
        });

        res.status(201).json({
            jogador: {
                ...jogadorCriado,
                time_nome // Adiciona o nome do time à resposta
            },
            vinculo: jogadorTimeVinculo
        });
    } catch (error) {
        console.error('Erro ao criar o jogador:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
});

// Rota para atualizar um jogador
mainRouter.put('/jogador/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
        // Valida o ID da URL
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" });
            return;
        }

        // Clone o body e remova os campos que não devem ir para o update do jogador
        const { estatisticas, numero, camisa, timeId, time_nome, temporada, id: bodyId, ...dadosJogador } = req.body;

        console.log("Dados recebidos para atualização:", req.body);

        // Atualiza os dados básicos do jogador
        const updatedJogador = await prisma.jogador.update({
            where: { id },
            data: dadosJogador,  // Atualiza todos os dados básicos
        });

        // Atualiza o vínculo jogador-time se fornecido temporada e timeId
        if (temporada && timeId) {
            // Busca o vínculo existente
            const vinculoExistente = await prisma.jogadorTime.findFirst({
                where: {
                    jogadorId: id,
                    timeId: parseInt(String(timeId)),
                    temporada: temporada,
                }
            });

            // Prepara as estatísticas com a nova estrutura
            const estatisticasAtualizadas = {
                passe: estatisticas?.passe || {},
                corrida: estatisticas?.corrida || {},
                recepcao: estatisticas?.recepcao || {},
                defesa: estatisticas?.defesa || {}
            };

            if (vinculoExistente) {
                // Preparar dados para atualização
                const updateData = {
                    numero: numero !== undefined ? parseInt(String(numero)) : vinculoExistente.numero,
                    camisa: camisa !== undefined ? camisa : vinculoExistente.camisa,
                    estatisticas: {
                        ...vinculoExistente.estatisticas as any,
                        ...estatisticasAtualizadas
                    }
                };

                // Atualiza o vínculo existente com os dados corretos
                const vinculoAtualizado = await prisma.jogadorTime.update({
                    where: { id: vinculoExistente.id },
                    data: updateData,
                });

                console.log("Vínculo atualizado:", vinculoAtualizado);
            } else {
                // Cria um novo vínculo se não existir
                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: id,
                        timeId: parseInt(String(timeId)),
                        temporada: temporada,
                        numero: numero !== undefined ? parseInt(String(numero)) : 0,
                        camisa: camisa || '',
                        estatisticas: estatisticasAtualizadas,
                    }
                });
            }
        }

        // Retornar o jogador com seus vínculos
        const jogadorComVinculos = await prisma.jogador.findUnique({
            where: { id },
            include: {
                times: {
                    where: {
                        timeId: timeId ? parseInt(String(timeId)) : undefined,
                        temporada: temporada || undefined,
                    },
                    select: {
                        id: true,
                        temporada: true,
                        numero: true,
                        camisa: true,
                        estatisticas: true,
                        time: true // se quiser trazer o time relacionado
                    }
                }
            }
        });

        // Adicionar o time_nome na resposta
        const responseJogador = {
            ...jogadorComVinculos,
            time_nome: time_nome || (jogadorComVinculos?.times?.[0]?.time?.nome) || null
        };

        res.status(200).json(responseJogador);
    } catch (error) {
        console.error("Erro ao atualizar o jogador:", error);
        res.status(500).json({ error: "Erro ao atualizar o jogador" });
    }
});

// Rota para comparar dois times
mainRouter.get('/comparar-times', async function (req: Request, res: Response) {
    try {
        const time1Id = req.query.time1Id as string;
        const time2Id = req.query.time2Id as string;
        const temporada = (req.query.temporada as string) || '2025';

        // Validar parâmetros
        if (!time1Id || !time2Id) {
            res.status(400).json({ error: 'É necessário fornecer IDs de dois times diferentes' });
            return;
        }

        if (time1Id === time2Id) {
            res.status(400).json({ error: 'Os times precisam ser diferentes para comparação' });
            return;
        }

        // Buscar dados dos times
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

        // Processar dados dos times para comparação
        const time1Estatisticas = calcularEstatisticasTime(time1);
        const time2Estatisticas = calcularEstatisticasTime(time2);

        // Identificar jogadores destaque
        const time1Destaques = identificarJogadoresDestaque(time1);
        const time2Destaques = identificarJogadoresDestaque(time2);

        // Construir objeto de resposta
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

// Função auxiliar para calcular estatísticas agregadas de um time
function calcularEstatisticasTime(time: any) {
    const jogadores = time.jogadores.map((jt: any) => ({
        ...jt.jogador,
        estatisticas: jt.estatisticas,
        numero: jt.numero,
        camisa: jt.camisa
    }));

    // Estatísticas de ataque (agora divididas em passe, corrida e recepção)
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

    // Estatísticas de defesa
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

    // Calcular totais com a nova estrutura
    jogadores.forEach((jogador: any) => {
        // Estatísticas de passe
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
            passe.pressao_pct = e.pressao_pct || "0"; // Não somamos porcentagem
        }

        // Estatísticas de corrida
        if (jogador.estatisticas?.corrida) {
            const e = jogador.estatisticas.corrida;
            corrida.corridas += e.corridas || 0;
            corrida.jds_corridas += e.jds_corridas || 0;
            corrida.tds_corridos += e.tds_corridos || 0;
            corrida.corrida_xp1 += e.corrida_xp1 || 0;
            corrida.corrida_xp2 += e.corrida_xp2 || 0;
        }

        // Estatísticas de recepção
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

        // Estatísticas de defesa
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
            defesa.pressao_pct = e.pressao_pct || "0"; // Não somamos porcentagem
        }
    });

    // Também precisamos atualizar o objeto de retorno para refletir a nova estrutura
    return { passe, corrida, recepcao, defesa };
}

// Função para identificar jogadores destaque em cada categoria
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

    // Encontrar melhor passador (TD passes)
    destaques.ataque.passador = jogadores
        .filter((j: any) => j.estatisticas?.passe?.tds_passe > 0)
        .sort((a: any, b: any) => (b.estatisticas?.passe?.tds_passe || 0) - (a.estatisticas?.passe?.tds_passe || 0))[0] || null;

    // Encontrar melhor corredor (yards corridas)
    destaques.ataque.corredor = jogadores
        .filter((j: any) => j.estatisticas?.corrida?.jds_corridas > 0)
        .sort((a: any, b: any) => (b.estatisticas?.corrida?.jds_corridas || 0) - (a.estatisticas?.corrida?.jds_corridas || 0))[0] || null;

    // Encontrar melhor recebedor (TD recebidos)
    destaques.ataque.recebedor = jogadores
        .filter((j: any) => j.estatisticas?.recepcao?.tds_recepcao > 0)
        .sort((a: any, b: any) => (b.estatisticas?.recepcao?.tds_recepcao || 0) - (a.estatisticas?.recepcao?.tds_recepcao || 0))[0] || null;

    // Encontrar melhor em flag retirada (usando tackles como aproximação)
    destaques.defesa.flagRetirada = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.tck > 0)
        .sort((a: any, b: any) => (b.estatisticas?.defesa?.tck || 0) - (a.estatisticas?.defesa?.tck || 0))[0] || null;

    // Encontrar melhor em pressão
    destaques.defesa.pressao = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.pressao_pct)
        .sort((a: any, b: any) => {
            const valA = parseFloat(a.estatisticas?.defesa?.pressao_pct || '0');
            const valB = parseFloat(b.estatisticas?.defesa?.pressao_pct || '0');
            return valB - valA;
        })[0] || null;

    // Encontrar melhor interceptador
    destaques.defesa.interceptador = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.int > 0)
        .sort((a: any, b: any) => (b.estatisticas?.defesa?.int || 0) - (a.estatisticas?.defesa?.int || 0))[0] || null;

    return destaques;
}

// Rota para obter transferências a partir do arquivo JSON
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
                regiao?: string;  // Novo campo
                sexo?: string;    // Novo campo
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
                        regiao: timeChange?.regiao || time.regiao || "",  // Novo campo
                        sexo: timeChange?.sexo || time.sexo || "",  // Novo campo
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

                    // Inicializar com estrutura vazia para estatísticas
                    const estatisticasVazias = {
                        passe: {},
                        corrida: {},
                        recepcao: {},
                        defesa: {}
                    };

                    // Migrar estatísticas da estrutura antiga para a nova estrutura, se existirem
                    let estatisticasNovas = estatisticasVazias;

                    if (relacaoAtual.estatisticas) {
                        const estatisticasAntigas = relacaoAtual.estatisticas as any;

                        // Verifica se já está na nova estrutura
                        if (estatisticasAntigas.passe || estatisticasAntigas.corrida ||
                            estatisticasAntigas.recepcao || estatisticasAntigas.defesa) {
                            // Já está na nova estrutura, apenas copiar
                            estatisticasNovas = estatisticasAntigas;
                        } else {
                            // Converter da estrutura antiga para a nova
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
                                // Em caso de erro, mantém estatísticas vazias
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

                    // Inicializar com estrutura vazia para estatísticas
                    const estatisticasVazias = {
                        passe: {},
                        corrida: {},
                        recepcao: {},
                        defesa: {}
                    };

                    // Migrar estatísticas da estrutura antiga para a nova estrutura, se existirem
                    let estatisticasNovas = estatisticasVazias;

                    if (jt.estatisticas) {
                        const estatisticasAntigas = jt.estatisticas as any;

                        // Verifica se já está na nova estrutura
                        if (estatisticasAntigas.passe || estatisticasAntigas.corrida ||
                            estatisticasAntigas.recepcao || estatisticasAntigas.defesa) {
                            // Já está na nova estrutura, apenas copiar
                            estatisticasNovas = estatisticasAntigas;
                        } else {
                            // Converter da estrutura antiga para a nova
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
                                // Em caso de erro, mantém estatísticas vazias
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


// Rota para importar dados do arquivo Times
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

            // Cria os jogadores e seus vínculos
            if (teamData.jogadores && teamData.jogadores.length > 0) {
                for (const player of teamData.jogadores) {
                    // Primeiro, cria o jogador
                    const jogadorCriado = await prisma.jogador.create({
                        data: {
                            nome: player.nome || '',
                        },
                    })

                    // Depois, cria o vínculo entre jogador e time
                    await prisma.jogadorTime.create({
                        data: {
                            jogadorId: jogadorCriado.id,
                            timeId: createdTeam.id,
                            temporada: teamData.temporada || '2025', // Adicionando campo temporada
                            numero: player.numero || 0, // Adicionando número
                            camisa: player.camisa || '', // Adicionando camisa
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


// Rota para importar times
mainRouter.post('/importar-times', upload.single('arquivo'), async (req, res) => {
    console.log('Rota /importar-times chamada')
    try {
        if (!req.file) {
            console.log('Nenhum arquivo enviado');
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        console.log('Arquivo recebido:', req.file.path);

        // Carrega o arquivo Excel
        console.log('Tentando ler o arquivo Excel...');
        const workbook = xlsx.readFile(req.file.path);
        console.log('Arquivo Excel lido com sucesso');

        const sheetName = workbook.SheetNames[0];
        console.log('Nome da planilha:', sheetName);

        const timeSheet = workbook.Sheets[sheetName];

        // Converte para JSON
        console.log('Convertendo planilha para JSON...');
        let timesRaw = xlsx.utils.sheet_to_json(timeSheet) as any[];
        console.log(`Processando ${timesRaw.length} times da planilha`);

        // Pré-processamento para garantir tipos corretos
        const times = timesRaw.map(time => ({
            ...time,
            temporada: time.temporada ? String(time.temporada) : '2025'
        }));

        console.log('Times pré-processados com temporada convertida para string');

        // Array para armazenar resultados
        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        // Processa cada time
        for (const time of times) {
            try {
                console.log(`Processando time: ${time.nome}, temporada: ${time.temporada}, tipo: ${typeof time.temporada}`);

                // Validação básica
                if (!time.nome || !time.sigla || !time.cor) {
                    console.log(`Time com dados incompletos: ${JSON.stringify(time)}`);
                    resultados.erros.push({
                        time: time.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }

                // Verifica se o time já existe
                console.log(`Verificando se o time ${time.nome} já existe na temporada ${time.temporada}`);

                // Garantir que temporada seja string
                const temporadaString = String(time.temporada);
                console.log(`Tipo de temporadaString: ${typeof temporadaString}, valor: ${temporadaString}`);

                const timeExistente = await prisma.time.findFirst({
                    where: {
                        nome: time.nome,
                        temporada: temporadaString
                    }
                });

                if (timeExistente) {
                    console.log(`Time ${time.nome} já existe, atualizando...`);
                    // Atualiza o time existente
                    await prisma.time.update({
                        where: { id: timeExistente.id },
                        data: {
                            sigla: time.sigla,
                            cor: time.cor,
                            cidade: time.cidade || '',
                            bandeira_estado: time.bandeira_estado || '',
                            instagram: time.instagram || '',
                            instagram2: time.instagram2 || '',
                            logo: time.logo || ''
                        }
                    });
                    console.log(`Time ${time.nome} atualizado com sucesso`);
                } else {
                    console.log(`Time ${time.nome} não existe, criando novo...`);
                    // Cria um novo time com temporada explicitamente como string
                    await prisma.time.create({
                        data: {
                            nome: time.nome,
                            sigla: time.sigla,
                            cor: time.cor,
                            cidade: time.cidade || '',
                            bandeira_estado: time.bandeira_estado || '',
                            instagram: time.instagram || '',
                            instagram2: time.instagram2 || '',
                            logo: time.logo || '',
                            temporada: temporadaString,
                            regiao: time.regiao || '',
                            sexo: time.sexo || ''
                        }
                    });
                    console.log(`Time ${time.nome} criado com sucesso`);
                }

                resultados.sucesso++;
            } catch (error) {
                console.error(`Erro ao processar time ${time.nome}:`, error);
                resultados.erros.push({
                    time: time.nome || 'Desconhecido',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        // Remove o arquivo após processamento
        fs.unlinkSync(req.file.path);
        console.log('Arquivo removido após processamento');

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} times importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de times:', error);

        // Garante que o arquivo seja removido em caso de erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log('Arquivo removido após erro');
        }

        res.status(500).json({
            error: 'Erro ao processar a planilha de times',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

// Rota para importar jogadores
mainRouter.post('/importar-jogadores', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        console.log('Arquivo recebido:', req.file.path);

        // Carrega o arquivo Excel com opções para manter strings
        console.log('Tentando ler o arquivo Excel...');
        const workbook = xlsx.readFile(req.file.path, {
            raw: false,  // Não converter para tipos nativos
            cellText: true  // Manter valores de células como texto
        });
        console.log('Arquivo Excel lido com sucesso');

        const sheetName = workbook.SheetNames[0];
        console.log('Nome da planilha:', sheetName);

        const jogadorSheet = workbook.Sheets[sheetName];

        // Converte para JSON
        console.log('Convertendo planilha para JSON...');
        let jogadoresRaw = xlsx.utils.sheet_to_json(jogadorSheet) as any[];
        console.log(`Processando ${jogadoresRaw.length} jogadores da planilha`);

        // Função para converter todos os números para strings
        function convertNumbersToStrings(obj: any): any {
            if (obj === null || obj === undefined) {
                return obj;
            }

            if (typeof obj === 'number') {
                return String(obj);
            }

            if (Array.isArray(obj)) {
                return obj.map(item => convertNumbersToStrings(item));
            }

            if (typeof obj === 'object') {
                const result: any = {};
                for (const key in obj) {
                    result[key] = convertNumbersToStrings(obj[key]);
                }
                return result;
            }

            return obj;
        }

        // Converte todos os números para strings
        jogadoresRaw = convertNumbersToStrings(jogadoresRaw);
        console.log('Convertido todos os números para strings');

        // Array para armazenar resultados
        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        // Processa cada jogador
        for (const jogador of jogadoresRaw) {
            try {
                console.log(`Processando jogador: ${jogador.nome}, time: ${jogador.time_nome}, temporada: ${jogador.temporada}, tipo temporada: ${typeof jogador.temporada}`);

                // Validação básica
                if (!jogador.nome || !jogador.time_nome) {
                    console.log(`Jogador com dados incompletos: ${JSON.stringify(jogador)}`);
                    resultados.erros.push({
                        jogador: jogador.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }

                // Busca o time relacionado
                console.log(`Buscando time: ${jogador.time_nome}, temporada: ${jogador.temporada}`);
                const time = await prisma.time.findFirst({
                    where: {
                        nome: jogador.time_nome,
                        temporada: jogador.temporada
                    }
                });

                if (!time) {
                    console.log(`Time "${jogador.time_nome}" não encontrado para a temporada ${jogador.temporada}`);
                    resultados.erros.push({
                        jogador: jogador.nome,
                        erro: `Time "${jogador.time_nome}" não encontrado para a temporada ${jogador.temporada}`
                    });
                    continue;
                }

                console.log(`Time encontrado: ${time.id} - ${time.nome}`);

                // Prepara as estatísticas a partir dos dados da planilha, usando a nova estrutura
                const estatisticas = {
                    passe: {
                        passes_completos: Number(jogador.passes_completos || 0),
                        passes_tentados: Number(jogador.passes_tentados || 0),
                        passes_incompletos: Number(jogador.passes_incompletos || 0),
                        jds_passe: Number(jogador.jds_passe || 0),
                        tds_passe: Number(jogador.tds_passe || 0),
                        passe_xp1: Number(jogador.passe_xp1 || 0),
                        passe_xp2: Number(jogador.passe_xp2 || 0),
                        int_sofridas: Number(jogador.int_sofridas || 0),
                        sacks_sofridos: Number(jogador.sacks_sofridos || 0),
                        pressao_pct: jogador.pressao_pct || ""
                    },
                    corrida: {
                        corridas: Number(jogador.corridas || 0),
                        jds_corridas: Number(jogador.jds_corridas || 0),
                        tds_corridos: Number(jogador.tds_corridos || 0),
                        corrida_xp1: Number(jogador.corrida_xp1 || 0),
                        corrida_xp2: Number(jogador.corrida_xp2 || 0)
                    },
                    recepcao: {
                        recepcoes: Number(jogador.recepcoes || 0),
                        alvos: Number(jogador.alvos || 0),
                        drops: Number(jogador.drops || 0),
                        jds_recepcao: Number(jogador.jds_recepcao || 0),
                        jds_yac: Number(jogador.jds_yac || 0),
                        tds_recepcao: Number(jogador.tds_recepcao || 0),
                        recepcao_xp1: Number(jogador.recepcao_xp1 || 0),
                        recepcao_xp2: Number(jogador.recepcao_xp2 || 0)
                    },
                    defesa: {
                        tck: Number(jogador.tck || 0),
                        tfl: Number(jogador.tfl || 0),
                        pressao_pct: jogador.pressao_pct_def || "",
                        sacks: Number(jogador.sacks || 0),
                        tip: Number(jogador.tip || 0),
                        int: Number(jogador.int || 0),
                        tds_defesa: Number(jogador.tds_defesa || 0),
                        defesa_xp2: Number(jogador.defesa_xp2 || 0),
                        sft: Number(jogador.sft || 0),
                        sft_1: Number(jogador.sft_1 || 0),
                        blk: Number(jogador.blk || 0),
                        jds_defesa: Number(jogador.jds_defesa || 0)
                    }
                };

                console.log(`Estatísticas preparadas para ${jogador.nome}`);

                // Verifica se o jogador já existe
                console.log(`Verificando se o jogador ${jogador.nome} já existe`);
                let jogadorExistente = await prisma.jogador.findFirst({
                    where: {
                        nome: jogador.nome,
                        times: {
                            some: {
                                timeId: time.id,
                                temporada: jogador.temporada
                            }
                        }
                    },
                    include: {
                        times: {
                            where: {
                                timeId: time.id,
                                temporada: jogador.temporada
                            }
                        }
                    }
                });

                if (jogadorExistente) {
                    console.log(`Jogador ${jogador.nome} já existe, ID: ${jogadorExistente.id}`);
                    // Atualiza o vínculo se existir
                    if (jogadorExistente.times && jogadorExistente.times.length > 0) {
                        console.log(`Atualizando vínculo existente para ${jogador.nome}`);
                        await prisma.jogadorTime.update({
                            where: { id: jogadorExistente.times[0].id },
                            data: {
                                numero: Number(jogador.numero || 0),
                                camisa: jogador.camisa || '',
                                estatisticas: estatisticas // Atualiza estatísticas com a nova estrutura
                            }
                        });
                        console.log(`Vínculo do jogador ${jogador.nome} atualizado com sucesso`);
                    } else {
                        // Cria um novo vínculo se não existir
                        console.log(`Criando novo vínculo para jogador existente ${jogador.nome}`);
                        await prisma.jogadorTime.create({
                            data: {
                                jogadorId: jogadorExistente.id,
                                timeId: time.id,
                                temporada: jogador.temporada,
                                numero: Number(jogador.numero || 0),
                                camisa: jogador.camisa || '',
                                estatisticas: estatisticas
                            }
                        });
                        console.log(`Novo vínculo criado para jogador ${jogador.nome} existente`);
                    }
                } else {
                    console.log(`Jogador ${jogador.nome} não existe, criando novo...`);
                    // Cria um novo jogador
                    const novoJogador = await prisma.jogador.create({
                        data: {
                            nome: jogador.nome
                        }
                    });
                    console.log(`Jogador ${jogador.nome} criado com ID: ${novoJogador.id}`);

                    // Cria o vínculo com o time
                    console.log(`Criando vínculo para novo jogador ${jogador.nome}`);
                    await prisma.jogadorTime.create({
                        data: {
                            jogadorId: novoJogador.id,
                            timeId: time.id,
                            temporada: jogador.temporada,
                            numero: Number(jogador.numero || 0),
                            camisa: jogador.camisa || '',
                            estatisticas: estatisticas
                        }
                    });
                    console.log(`Jogador ${jogador.nome} e vínculo criados com sucesso`);
                }

                resultados.sucesso++;
            } catch (error) {
                console.error(`Erro ao processar jogador ${jogador.nome}:`, error);
                resultados.erros.push({
                    jogador: jogador.nome || 'Desconhecido',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        // Remove o arquivo após processamento
        fs.unlinkSync(req.file.path);
        console.log('Arquivo removido após processamento');

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} jogadores importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de jogadores:', error);

        // Garante que o arquivo seja removido em caso de erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log('Arquivo removido após erro');
        }

        res.status(500).json({
            error: 'Erro ao processar a planilha de jogadores',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

// Rota para atualizar estatísticas a partir de uma planilha de jogo
mainRouter.post('/atualizar-estatisticas', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        // Dados adicionais do jogo
        const { id_jogo, data_jogo } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }

        // Carrega o arquivo Excel com opções para controlar os tipos
        const workbook = xlsx.readFile(req.file.path, {
            raw: true,  // Manter valores crus
            cellText: true,  // Força células como texto
            cellDates: false  // Não converter datas
        });

        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        // Converte para JSON de forma simples
        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        // PRÉ-PROCESSAR TODOS OS DADOS - IMPORTANTE!
        estatisticasJogo.forEach(stat => {
            // Garantir que temporada seja string
            if (stat.temporada !== undefined) {
                stat.temporada = String(stat.temporada);
            }

            // Converter outros campos para número quando necessário
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

        // Array para armazenar resultados
        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        // Verificar se o jogo já foi processado anteriormente
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

        // Verifica se o jogo já foi processado
        if (jogosProcessados[id_jogo]) {
            res.status(400).json({
                error: `O jogo ${id_jogo} já foi processado anteriormente.`,
                message: 'Use a rota /reprocessar-jogo se deseja atualizar os dados.'
            });
            return;
        }

        // Array para armazenar as estatísticas originais deste jogo
        const estatisticasOriginais: Array<{
            jogadorId: number;
            timeId: number;
            temporada: string;
            estatisticas: Record<string, any>;
        }> = [];

        // Inicia uma transação para garantir que todos os dados sejam atualizados corretamente
        await prisma.$transaction(async (tx) => {
            // Processa cada linha de estatísticas
            for (const stat of estatisticasJogo) {
                try {
                    // Validação básica
                    if (!stat.jogador_id && !stat.jogador_nome) {
                        resultados.erros.push({
                            linha: JSON.stringify(stat),
                            erro: 'ID ou nome do jogador é obrigatório'
                        });
                        continue;
                    }

                    // Define a temporada padrão se não estiver presente
                    const temporada = String(stat.temporada || '2025');

                    // Busca o jogador
                    let jogador;
                    let jogadorTime;

                    if (stat.jogador_id) {
                        const jogadorId = Number(stat.jogador_id);

                        // Busca básica do jogador
                        jogador = await tx.jogador.findUnique({
                            where: { id: jogadorId }
                        });

                        if (!jogador) {
                            throw new Error(`Jogador ID ${jogadorId} não encontrado`);
                        }

                        // Busca a relação jogador-time
                        const jogadorTimes = await tx.jogadorTime.findMany({
                            where: {
                                jogadorId: jogadorId,
                                temporada: temporada // String literal
                            }
                        });

                        if (!jogadorTimes || jogadorTimes.length === 0) {
                            throw new Error(`Jogador ID ${jogadorId} não tem relação com time na temporada ${temporada}`);
                        }

                        jogadorTime = jogadorTimes[0];
                    } else {
                        // Busca por nome similar ao código existente
                        // ... (código omitido para brevidade)
                    }

                    if (!jogador || !jogadorTime) {
                        resultados.erros.push({
                            jogador: stat.jogador_nome || stat.jogador_id,
                            erro: 'Jogador não encontrado ou não relacionado a nenhum time'
                        });
                        continue;
                    }

                    // Obtém as estatísticas atuais (com segurança de tipo)
                    const estatisticasAtuais = jogadorTime.estatisticas as Record<string, any> || {};

                    // Cria novas estatísticas para o jogo de forma mais simples e segura
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

                    // Salvar as estatísticas originais
                    estatisticasOriginais.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada: temporada,
                        estatisticas: { ...estatisticasDoJogo }
                    });

                    // Abordagem mais simples e segura para combinar estatísticas
                    // Verifica a estrutura atual com verificação de tipo segura
                    const temPasse = typeof estatisticasAtuais?.passe === 'object' && estatisticasAtuais.passe !== null;
                    const temCorrida = typeof estatisticasAtuais?.corrida === 'object' && estatisticasAtuais.corrida !== null;
                    const temRecepcao = typeof estatisticasAtuais?.recepcao === 'object' && estatisticasAtuais.recepcao !== null;
                    const temDefesa = typeof estatisticasAtuais?.defesa === 'object' && estatisticasAtuais.defesa !== null;

                    // Combina as estatísticas de forma segura
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

                    // Atualiza as estatísticas do jogador
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

// Rota para reprocessar um jogo
mainRouter.post('/reprocessar-jogo', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        // Dados adicionais do jogo
        const { id_jogo, data_jogo, force } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }

        // Verificar se o jogo já foi processado anteriormente
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

        // Se o jogo não foi processado antes, use a rota normal
        if (!jogosProcessados[id_jogo] && !force) {
            res.status(400).json({
                error: `O jogo ${id_jogo} não foi processado anteriormente.`,
                message: 'Use a rota /atualizar-estatisticas para processá-lo pela primeira vez.'
            });
            return;
        }

        // Carrega o arquivo Excel
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        // Converte para JSON
        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        console.log(`Reprocessando estatísticas de ${estatisticasJogo.length} jogadores para o jogo ${id_jogo}`);

        // Array para armazenar resultados
        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        // Busca as estatísticas originais do jogo
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

        // Inicia uma transação
        await prisma.$transaction(async (tx) => {
            // Primeiro, vamos reverter as estatísticas anteriores
            if (estatisticasAnteriores.length > 0) {
                console.log(`Revertendo estatísticas anteriores do jogo ${id_jogo}`);

                for (const estatAnterior of estatisticasAnteriores) {
                    try {
                        // Busca o jogador e seu vínculo atual
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

                        // Verificar a estrutura das estatísticas
                        const temNovaEstrutura =
                            estatisticasAtuais.passe !== undefined ||
                            estatisticasAtuais.corrida !== undefined ||
                            estatisticasAtuais.recepcao !== undefined;

                        if (temNovaEstrutura && estatAnterior.estatisticas.passe) {
                            // Se ambos usam a nova estrutura, subtraímos os valores
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

                            // Atualiza o vínculo existente com os dados corretos
                            await tx.jogadorTime.update({
                                where: { id: jogadorTime.id },
                                data: {
                                    estatisticas: novasEstatisticas
                                }
                            });
                        }
                        // Se as estruturas forem diferentes, criar uma nova estrutura vazia
                        else {
                            // Criar estrutura vazia
                            const novasEstatisticas = {
                                passe: {},
                                corrida: {},
                                recepcao: {},
                                defesa: {}
                            };

                            // Atualiza o vínculo existente com os dados corretos
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

            // Array para armazenar as novas estatísticas deste jogo
            const novasEstatisticasJogo: Array<{
                jogadorId: number;
                timeId: number;
                temporada: string;
                estatisticas: any;
            }> = [];

            // Processa cada linha de estatísticas do novo arquivo
            for (const stat of estatisticasJogo) {
                try {
                    // Validação básica
                    if (!stat.jogador_id && !stat.jogador_nome) {
                        resultados.erros.push({
                            linha: JSON.stringify(stat),
                            erro: 'ID ou nome do jogador é obrigatório'
                        });
                        continue;
                    }

                    // Define a temporada padrão se não estiver presente
                    const temporada = String(stat.temporada || '2025');

                    // Busca o jogador
                    let jogador;
                    if (stat.jogador_id) {
                        jogador = await tx.jogador.findUnique({
                            where: { id: parseInt(stat.jogador_id) },
                            include: {
                                times: {
                                    where: { temporada: String(temporada || '2025') }, // Conversão explícita
                                    include: { time: true }
                                }
                            }
                        });
                    } else {
                        // Busca por nome e time
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

                    // Prepara as estatísticas para este jogo com a nova estrutura
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

                    // Salva as estatísticas deste jogo para este jogador
                    novasEstatisticasJogo.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada,
                        estatisticas: estatisticasDoJogo
                    });

                    // Verifica se a estrutura atual já é a nova
                    const temNovaEstrutura =
                        estatisticasAtuais.passe !== undefined ||
                        estatisticasAtuais.corrida !== undefined ||
                        estatisticasAtuais.recepcao !== undefined ||
                        estatisticasAtuais.defesa !== undefined;

                    // Inicializa estatísticas vazias na nova estrutura se necessário
                    const baseEstatisticas = temNovaEstrutura ? estatisticasAtuais : {
                        passe: {},
                        corrida: {},
                        recepcao: {},
                        defesa: {}
                    };

                    // Calcula as novas estatísticas totais
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
                            pressao_pct: estatisticasDoJogo.passe.pressao_pct // Substitui o valor, não soma
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
                            pressao_pct: estatisticasDoJogo.defesa.pressao_pct, // Substitui o valor, não soma
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

                    // Atualiza as estatísticas do jogador
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

            // Registra as estatísticas originais do jogo para futuras correções
            await tx.metaDados.upsert({
                where: { chave: `estatisticas_jogo_${id_jogo}` },
                update: { valor: JSON.stringify(novasEstatisticasJogo) },
                create: {
                    chave: `estatisticas_jogo_${id_jogo}`,
                    valor: JSON.stringify(novasEstatisticasJogo)
                }
            });

            // Atualiza os metadados do jogo
            jogosProcessados[id_jogo] = {
                dataJogo: data_jogo,
                processadoEm: new Date().toISOString(),
                reprocessado: true
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

        // Remove o arquivo após processamento
        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Estatísticas do jogo ${id_jogo} reprocessadas com sucesso para ${resultados.sucesso} jogadores`,
            data_jogo,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao reprocessar estatísticas do jogo:', error);

        // Garante que o arquivo seja removido em caso de erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao reprocessar estatísticas do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

// Adicione esta rota ao main.ts
mainRouter.get('/jogador/:id/temporada/:ano', async (req, res) => {
    try {
        const { id, ano } = req.params;
        const jogadorId = parseInt(id, 10);

        if (isNaN(jogadorId)) {
            res.status(400).json({ error: 'ID do jogador inválido' });
            return;
        }

        const jogadorTime = await prisma.jogadorTime.findFirst({
            where: {
                jogadorId,
                temporada: ano,
            },
            include: {
                jogador: true,
                time: true,
            },
        });

        if (!jogadorTime) {
            res.status(404).json({ error: 'Jogador não encontrado nesta temporada' });
            return;
        }

        res.status(200).json(jogadorTime);
    } catch (error) {
        console.error('Erro ao buscar jogador:', error);
        res.status(500).json({ error: 'Erro ao buscar jogador' });
    }
});

mainRouter.get('/jogos-processados', async (req, res) => {
    try {
        console.log('Rota /jogos-processados acessada');

        // Busca o registro de jogos processados
        const metaDados = await prisma.metaDados.findFirst({
            where: { chave: 'jogos_processados' }
        });

        // Caso de nenhum jogo processado
        if (!metaDados || !metaDados.valor) {
            console.log('Nenhum jogo processado encontrado');
            res.status(200).json({ jogos: [] });
            return; // Adicionado return explícito
        }

        // Limita o tamanho da resposta se for muito grande
        if (metaDados.valor.length > 5000000) { // ~5MB
            console.warn('Dados muito grandes, enviando versão simplificada');
            res.status(200).json({
                jogos: [],
                error: 'Dados muito grandes para processar',
                message: 'Por favor, contate o administrador do sistema'
            });
            return; // Adicionado return explícito
        }

        // Parse do JSON com tratamento de erro e limite de tamanho
        // CORREÇÃO: Tipagem mais específica para evitar erros
        let jogosProcessados: Record<string, any> = {};
        try {
            const parsed = JSON.parse(metaDados.valor);

            // Verificar se o resultado do parsing é realmente um objeto
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Formato de dados inválido');
            }

            // Atribuição com tipagem correta
            jogosProcessados = parsed as Record<string, any>;

            console.log(`Encontrados ${Object.keys(jogosProcessados).length} jogos processados`);
        } catch (e) {
            console.error('Erro ao fazer parse do JSON de jogos processados:', e);
            res.status(200).json({
                jogos: [],
                error: 'Erro ao processar dados de jogos'
            });
            return; // Adicionado return explícito
        }

        // Limitamos a quantidade de jogos para evitar sobrecarga
        const MAX_JOGOS = 100;
        const jogoKeys = Object.keys(jogosProcessados).slice(0, MAX_JOGOS);

        // Transformar de forma otimizada
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

        // Ordenar usando o método mais rápido possível
        jogosArray.sort((a, b) => {
            // Evitar conversão de data desnecessária se possível
            const dateA = new Date(a.processado_em).getTime();
            const dateB = new Date(b.processado_em).getTime();

            // Se datas inválidas, não quebrar a ordenação
            if (isNaN(dateA) || isNaN(dateB)) return 0;

            return dateB - dateA; // Mais recente primeiro
        });

        // Resposta final com limite claro
        res.status(200).json({
            jogos: jogosArray,
            total: Object.keys(jogosProcessados).length,
            limit: MAX_JOGOS
        });
        return; // Adicionado return explícito

    } catch (error) {
        console.error('Erro ao buscar jogos processados:', error);
        res.status(200).json({
            jogos: [],
            error: 'Erro interno ao buscar jogos processados'
        });
        // Sem return aqui, é o fim da função
    }
});

export default mainRouter