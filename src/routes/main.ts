import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { TimeSchema } from '../schemas/Time'
import { JogadorSchema } from '../schemas/Jogador'
import { Times } from '../data/times'
import fs from 'fs';
import path from 'path';
import multer from 'multer'
import xlsx from 'xlsx';


const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (_req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Filtro para aceitar apenas arquivos Excel
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (
        file.mimetype === 'application/vnd.ms-excel' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

const upload = multer({
    storage,
    fileFilter,
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
                temporada: teamData.temporada || '2025', // Adiciona temporada com valor padrão
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

        const estatisticas = jogadorData.estatisticas ?? {};

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
                estatisticas: estatisticas,
            }
        });

        res.status(201).json({
            jogador: jogadorCriado,
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
        const { estatisticas, numero, camisa, timeId, temporada, id: bodyId, ...dadosJogador } = req.body;

        console.log("Valor de camisa recebido:", camisa);

        // Garanta que campos numéricos sejam números
        if (dadosJogador.altura !== undefined) {
            dadosJogador.altura = Number(String(dadosJogador.altura).replace(',', '.'));
        }
        if (dadosJogador.peso !== undefined) dadosJogador.peso = Number(dadosJogador.peso);
        if (dadosJogador.idade !== undefined) dadosJogador.idade = Number(dadosJogador.idade);

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

            if (vinculoExistente) {
                // Se camisa for passada, ela será atualizada, caso contrário, mantém o valor existente
                const updateData = {
                    numero: numero !== undefined ? parseInt(String(numero)) : vinculoExistente.numero,
                    camisa: camisa !== undefined ? camisa : vinculoExistente.camisa,  // Atualização da camisa
                    estatisticas: estatisticas || vinculoExistente.estatisticas,
                };

                console.log("Atualizando vínculo com camisa:", updateData.camisa);

                // Atualiza o vínculo existente com os dados corretos
                const vinculoAtualizado = await prisma.jogadorTime.update({
                    where: { id: vinculoExistente.id },
                    data: updateData,
                });

                // Verifica se a atualização foi feita
                console.log("Camisa após atualização:", vinculoAtualizado.camisa);
            } else {
                // Cria um novo vínculo se não existir
                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: id,
                        timeId: parseInt(String(timeId)),
                        temporada: temporada,
                        numero: numero !== undefined ? parseInt(String(numero)) : 0,
                        camisa: camisa || '',  // Garante que camisa será armazenada
                        estatisticas: estatisticas || {},
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
                        camisa: true, // Campo camisa para retornar no resultado
                        estatisticas: true,
                        time: true // se quiser trazer o time relacionado
                    }
                }
            }
        });

        res.status(200).json(jogadorComVinculos);
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

    // Estatísticas de ataque
    const ataque = {
        passes_completos: 0,
        passes_tentados: 0,
        passes_percentual: 0,
        td_passado: 0,
        interceptacoes_sofridas: 0,
        sacks_sofridos: 0,
        corrida: 0,
        tds_corridos: 0,
        recepcao: 0,
        alvo: 0,
        td_recebido: 0
    };

    // Estatísticas de defesa
    const defesa = {
        sack: 0,
        pressao: 0,
        flag_retirada: 0,
        flag_perdida: 0,
        passe_desviado: 0,
        interceptacao_forcada: 0,
        td_defensivo: 0
    };

    // Calcular totais
    jogadores.forEach((jogador: any) => {
        if (jogador.estatisticas?.ataque) {
            const e = jogador.estatisticas.ataque;
            ataque.passes_completos += e.passes_completos || 0;
            ataque.passes_tentados += e.passes_tentados || 0;
            ataque.td_passado += e.td_passado || 0;
            ataque.interceptacoes_sofridas += e.interceptacoes_sofridas || 0;
            ataque.sacks_sofridos += e.sacks_sofridos || 0;
            ataque.corrida += e.corrida || 0;
            ataque.tds_corridos += e.tds_corridos || 0;
            ataque.recepcao += e.recepcao || 0;
            ataque.alvo += e.alvo || 0;
            ataque.td_recebido += e.td_recebido || 0;
        }

        if (jogador.estatisticas?.defesa) {
            const e = jogador.estatisticas.defesa;
            defesa.sack += e.sack || 0;
            defesa.pressao += e.pressao || 0;
            defesa.flag_retirada += e.flag_retirada || 0;
            defesa.flag_perdida += e.flag_perdida || 0;
            defesa.passe_desviado += e.passe_desviado || 0;
            defesa.interceptacao_forcada += e.interceptacao_forcada || 0;
            defesa.td_defensivo += e.td_defensivo || 0;
        }
    });

    // Calcular percentual de passes
    ataque.passes_percentual = ataque.passes_tentados > 0
        ? (ataque.passes_completos / ataque.passes_tentados) * 100
        : 0;

    return { ataque, defesa };
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

    // Categorias a avaliar
    const destaques: {
        ataque: {
            passador: any | null;
            corredor: any | null;
            recebedor: any | null;
        };
        defesa: {
            flagRetirada: any | null;
            pressao: any | null;
            interceptador: any | null;
        };
    } = {
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
        .filter((j: any) => j.estatisticas?.ataque?.td_passado > 0)
        .sort((a: any, b: any) => (b.estatisticas?.ataque?.td_passado || 0) - (a.estatisticas?.ataque?.td_passado || 0))[0] || null;

    // Encontrar melhor corredor (yards corridas)
    destaques.ataque.corredor = jogadores
        .filter((j: any) => j.estatisticas?.ataque?.corrida > 0)
        .sort((a: any, b: any) => (b.estatisticas?.ataque?.corrida || 0) - (a.estatisticas?.ataque?.corrida || 0))[0] || null;

    // Encontrar melhor recebedor (TD recebidos)
    destaques.ataque.recebedor = jogadores
        .filter((j: any) => j.estatisticas?.ataque?.td_recebido > 0)
        .sort((a: any, b: any) => (b.estatisticas?.ataque?.td_recebido || 0) - (a.estatisticas?.ataque?.td_recebido || 0))[0] || null;

    // Encontrar melhor em flag retirada
    destaques.defesa.flagRetirada = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.flag_retirada > 0)
        .sort((a: any, b: any) => (b.estatisticas?.defesa?.flag_retirada || 0) - (a.estatisticas?.defesa?.flag_retirada || 0))[0] || null;

    // Encontrar melhor em pressão
    destaques.defesa.pressao = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.pressao > 0)
        .sort((a: any, b: any) => (b.estatisticas?.defesa?.pressao || 0) - (a.estatisticas?.defesa?.pressao || 0))[0] || null;

    // Encontrar melhor interceptador
    destaques.defesa.interceptador = jogadores
        .filter((j: any) => j.estatisticas?.defesa?.interceptacao_forcada > 0)
        .sort((a: any, b: any) => (b.estatisticas?.defesa?.interceptacao_forcada || 0) - (a.estatisticas?.defesa?.interceptacao_forcada || 0))[0] || null;

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

                    const novoVinculo = await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: timeDestino.id,
                            temporada: ano,
                            numero: transferencia.novoNumero || relacaoAtual.numero,
                            camisa: transferencia.novaCamisa || relacaoAtual.camisa,
                            estatisticas: {}
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

                    await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: novoTimeId,
                            temporada: ano,
                            numero: jt.numero,
                            camisa: jt.camisa,
                            estatisticas: {}
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
                jogadores: jogadoresNovaTemporada,
                transferencias: totalSalvo
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
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        // Carrega o arquivo Excel
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const timeSheet = workbook.Sheets[sheetName];

        // Converte para JSON
        const times = xlsx.utils.sheet_to_json(timeSheet) as any[];

        console.log(`Processando ${times.length} times da planilha`);

        // Array para armazenar resultados
        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        // Processa cada time
        for (const time of times) {
            try {
                // Validação básica
                if (!time.nome || !time.sigla || !time.cor) {
                    resultados.erros.push({
                        time: time.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }

                // Define a temporada padrão se não estiver presente
                if (!time.temporada) {
                    time.temporada = '2025';
                }

                // Verifica se o time já existe
                const timeExistente = await prisma.time.findFirst({
                    where: {
                        nome: time.nome,
                        temporada: time.temporada
                    }
                });

                if (timeExistente) {
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
                } else {
                    // Cria um novo time
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
                            temporada: time.temporada
                        }
                    });
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

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} times importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de times:', error);

        // Garante que o arquivo seja removido em caso de erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
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

        // Carrega o arquivo Excel
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const jogadorSheet = workbook.Sheets[sheetName];

        // Converte para JSON
        const jogadores = xlsx.utils.sheet_to_json(jogadorSheet) as any[];

        console.log(`Processando ${jogadores.length} jogadores da planilha`);

        // Array para armazenar resultados
        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        // Processa cada jogador
        for (const jogador of jogadores) {
            try {
                // Validação básica
                if (!jogador.nome || !jogador.time_nome) {
                    resultados.erros.push({
                        jogador: jogador.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }

                // Define a temporada padrão se não estiver presente
                if (!jogador.temporada) {
                    jogador.temporada = '2025';
                }

                // Busca o time relacionado
                const time = await prisma.time.findFirst({
                    where: {
                        nome: jogador.time_nome,
                        temporada: jogador.temporada
                    }
                });

                if (!time) {
                    resultados.erros.push({
                        jogador: jogador.nome,
                        erro: `Time "${jogador.time_nome}" não encontrado para a temporada ${jogador.temporada}`
                    });
                    continue;
                }

                // Prepara as estatísticas iniciais (zeradas)
                const estatisticas = {
                    ataque: {
                        passes_completos: 0,
                        passes_tentados: 0,
                        td_passado: 0,
                        interceptacoes_sofridas: 0,
                        sacks_sofridos: 0,
                        corrida: 0,
                        tds_corridos: 0,
                        recepcao: 0,
                        alvo: 0,
                        td_recebido: 0
                    },
                    defesa: {
                        sack: 0,
                        pressao: 0,
                        flag_retirada: 0,
                        flag_perdida: 0,
                        passe_desviado: 0,
                        interceptacao_forcada: 0,
                        td_defensivo: 0
                    }
                };

                // Verifica se o jogador já existe
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
                    // Atualiza o jogador existente
                    await prisma.jogador.update({
                        where: { id: jogadorExistente.id },
                        data: {
                        }
                    });

                    // Atualiza o vínculo se existir
                    if (jogadorExistente.times && jogadorExistente.times.length > 0) {
                        await prisma.jogadorTime.update({
                            where: { id: jogadorExistente.times[0].id },
                            data: {
                                numero: jogador.numero || jogadorExistente.times[0].numero,
                                camisa: jogador.camisa || jogadorExistente.times[0].camisa
                                // Mantém as estatísticas existentes
                            }
                        });
                    } else {
                        // Cria um novo vínculo se não existir
                        await prisma.jogadorTime.create({
                            data: {
                                jogadorId: jogadorExistente.id,
                                timeId: time.id,
                                temporada: jogador.temporada,
                                numero: jogador.numero || 0,
                                camisa: jogador.camisa || '',
                                estatisticas: estatisticas
                            }
                        });
                    }
                } else {
                    // Cria um novo jogador
                    const novoJogador = await prisma.jogador.create({
                        data: {
                            nome: jogador.nome
                        }
                    });

                    // Cria o vínculo com o time
                    await prisma.jogadorTime.create({
                        data: {
                            jogadorId: novoJogador.id,
                            timeId: time.id,
                            temporada: jogador.temporada,
                            numero: jogador.numero || 0,
                            camisa: jogador.camisa || '',
                            estatisticas: estatisticas
                        }
                    });
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

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} jogadores importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de jogadores:', error);

        // Garante que o arquivo seja removido em caso de erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao processar a planilha de jogadores',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

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

        // Carrega o arquivo Excel
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        // Converte para JSON
        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

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

        let jogosProcessados = {};
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
        const estatisticasOriginais = [];

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
                    const temporada = stat.temporada || '2025';

                    // Busca o jogador
                    let jogador;
                    if (stat.jogador_id) {
                        jogador = await tx.jogador.findUnique({
                            where: { id: parseInt(stat.jogador_id) },
                            include: {
                                times: {
                                    where: { temporada },
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
                                temporada
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
                                        temporada
                                    }
                                }
                            },
                            include: {
                                times: {
                                    where: {
                                        timeId: time.id,
                                        temporada
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

                    // Prepara as estatísticas para este jogo
                    const estatisticasDoJogo = {
                        ataque: {
                            passes_completos: parseInt(stat.passes_completos) || 0,
                            passes_tentados: parseInt(stat.passes_tentados) || 0,
                            td_passado: parseInt(stat.td_passado) || 0,
                            interceptacoes_sofridas: parseInt(stat.interceptacoes_sofridas) || 0,
                            sacks_sofridos: parseInt(stat.sacks_sofridos) || 0,
                            corrida: parseInt(stat.corrida) || 0,
                            tds_corridos: parseInt(stat.tds_corridos) || 0,
                            recepcao: parseInt(stat.recepcao) || 0,
                            alvo: parseInt(stat.alvo) || 0,
                            td_recebido: parseInt(stat.td_recebido) || 0
                        },
                        defesa: {
                            sack: parseInt(stat.sack) || 0,
                            pressao: parseInt(stat.pressao) || 0,
                            flag_retirada: parseInt(stat.flag_retirada) || 0,
                            flag_perdida: parseInt(stat.flag_perdida) || 0,
                            passe_desviado: parseInt(stat.passe_desviado) || 0,
                            interceptacao_forcada: parseInt(stat.interceptacao_forcada) || 0,
                            td_defensivo: parseInt(stat.td_defensivo) || 0
                        }
                    };

                    // Salva as estatísticas originais para este jogador neste jogo
                    estatisticasOriginais.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada,
                        estatisticas: estatisticasDoJogo
                    });

                    // Calcula as novas estatísticas totais
                    const novasEstatisticas = {
                        ataque: {
                            passes_completos: (estatisticasAtuais.ataque?.passes_completos || 0) + estatisticasDoJogo.ataque.passes_completos,
                            passes_tentados: (estatisticasAtuais.ataque?.passes_tentados || 0) + estatisticasDoJogo.ataque.passes_tentados,
                            td_passado: (estatisticasAtuais.ataque?.td_passado || 0) + estatisticasDoJogo.ataque.td_passado,
                            interceptacoes_sofridas: (estatisticasAtuais.ataque?.interceptacoes_sofridas || 0) + estatisticasDoJogo.ataque.interceptacoes_sofridas,
                            sacks_sofridos: (estatisticasAtuais.ataque?.sacks_sofridos || 0) + estatisticasDoJogo.ataque.sacks_sofridos,
                            corrida: (estatisticasAtuais.ataque?.corrida || 0) + estatisticasDoJogo.ataque.corrida,
                            tds_corridos: (estatisticasAtuais.ataque?.tds_corridos || 0) + estatisticasDoJogo.ataque.tds_corridos,
                            recepcao: (estatisticasAtuais.ataque?.recepcao || 0) + estatisticasDoJogo.ataque.recepcao,
                            alvo: (estatisticasAtuais.ataque?.alvo || 0) + estatisticasDoJogo.ataque.alvo,
                            td_recebido: (estatisticasAtuais.ataque?.td_recebido || 0) + estatisticasDoJogo.ataque.td_recebido
                        },
                        defesa: {
                            sack: (estatisticasAtuais.defesa?.sack || 0) + estatisticasDoJogo.defesa.sack,
                            pressao: (estatisticasAtuais.defesa?.pressao || 0) + estatisticasDoJogo.defesa.pressao,
                            flag_retirada: (estatisticasAtuais.defesa?.flag_retirada || 0) + estatisticasDoJogo.defesa.flag_retirada,
                            flag_perdida: (estatisticasAtuais.defesa?.flag_perdida || 0) + estatisticasDoJogo.defesa.flag_perdida,
                            passe_desviado: (estatisticasAtuais.defesa?.passe_desviado || 0) + estatisticasDoJogo.defesa.passe_desviado,
                            interceptacao_forcada: (estatisticasAtuais.defesa?.interceptacao_forcada || 0) + estatisticasDoJogo.defesa.interceptacao_forcada,
                            td_defensivo: (estatisticasAtuais.defesa?.td_defensivo || 0) + estatisticasDoJogo.defesa.td_defensivo
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
        fs.unlinkSync(req.file.path);

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

// Rota para processar um jogo
mainRouter.get('/jogos-processados', async (req, res) => {
    try {
        const jogosProcessadosRecord = await prisma.metaDados.findFirst({
            where: { chave: 'jogos_processados' }
        });

        let jogosProcessados = {};
        if (jogosProcessadosRecord && jogosProcessadosRecord.valor) {
            try {
                jogosProcessados = JSON.parse(jogosProcessadosRecord.valor);
            } catch (e) {
                console.warn('Erro ao parsear jogos processados:', e);
            }
        }

        // Formata a saída para ser mais útil
        const jogosFormatados = Object.entries(jogosProcessados).map(([id, info]: [string, any]) => ({
            id_jogo: id,
            data_jogo: info.dataJogo,
            processado_em: info.processadoEm
        }));

        res.status(200).json({
            total: jogosFormatados.length,
            jogos: jogosFormatados
        });
    } catch (error) {
        console.error('Erro ao consultar jogos processados:', error);
        res.status(500).json({
            error: 'Erro ao consultar jogos processados',
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

        let jogosProcessados = {};
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

        let estatisticasAnteriores = [];
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

                        // Subtrair as estatísticas anteriores
                        const novasEstatisticas = {
                            ataque: {
                                passes_completos: Math.max(0, (estatisticasAtuais.ataque?.passes_completos || 0) - (estatAnterior.estatisticas.ataque?.passes_completos || 0)),
                                passes_tentados: Math.max(0, (estatisticasAtuais.ataque?.passes_tentados || 0) - (estatAnterior.estatisticas.ataque?.passes_tentados || 0)),
                                td_passado: Math.max(0, (estatisticasAtuais.ataque?.td_passado || 0) - (estatAnterior.estatisticas.ataque?.td_passado || 0)),
                                interceptacoes_sofridas: Math.max(0, (estatisticasAtuais.ataque?.interceptacoes_sofridas || 0) - (estatAnterior.estatisticas.ataque?.interceptacoes_sofridas || 0)),
                                sacks_sofridos: Math.max(0, (estatisticasAtuais.ataque?.sacks_sofridos || 0) - (estatAnterior.estatisticas.ataque?.sacks_sofridos || 0)),
                                corrida: Math.max(0, (estatisticasAtuais.ataque?.corrida || 0) - (estatAnterior.estatisticas.ataque?.corrida || 0)),
                                tds_corridos: Math.max(0, (estatisticasAtuais.ataque?.tds_corridos || 0) - (estatAnterior.estatisticas.ataque?.tds_corridos || 0)),
                                recepcao: Math.max(0, (estatisticasAtuais.ataque?.recepcao || 0) - (estatAnterior.estatisticas.ataque?.recepcao || 0)),
                                alvo: Math.max(0, (estatisticasAtuais.ataque?.alvo || 0) - (estatAnterior.estatisticas.ataque?.alvo || 0)),
                                td_recebido: Math.max(0, (estatisticasAtuais.ataque?.td_recebido || 0) - (estatAnterior.estatisticas.ataque?.td_recebido || 0))
                            },
                            defesa: {
                                sack: Math.max(0, (estatisticasAtuais.defesa?.sack || 0) - (estatAnterior.estatisticas.defesa?.sack || 0)),
                                pressao: Math.max(0, (estatisticasAtuais.defesa?.pressao || 0) - (estatAnterior.estatisticas.defesa?.pressao || 0)),
                                flag_retirada: Math.max(0, (estatisticasAtuais.defesa?.flag_retirada || 0) - (estatAnterior.estatisticas.defesa?.flag_retirada || 0)),
                                flag_perdida: Math.max(0, (estatisticasAtuais.defesa?.flag_perdida || 0) - (estatAnterior.estatisticas.defesa?.flag_perdida || 0)),
                                passe_desviado: Math.max(0, (estatisticasAtuais.defesa?.passe_desviado || 0) - (estatAnterior.estatisticas.defesa?.passe_desviado || 0)),
                                interceptacao_forcada: Math.max(0, (estatisticasAtuais.defesa?.interceptacao_forcada || 0) - (estatAnterior.estatisticas.defesa?.interceptacao_forcada || 0)),
                                td_defensivo: Math.max(0, (estatisticasAtuais.defesa?.td_defensivo || 0) - (estatAnterior.estatisticas.defesa?.td_defensivo || 0))
                            }
                        };

                        // Atualiza as estatísticas do jogador
                        await tx.jogadorTime.update({
                            where: { id: jogadorTime.id },
                            data: {
                                estatisticas: novasEstatisticas
                            }
                        });
                    } catch (error) {
                        console.error(`Erro ao reverter estatísticas para jogador ${estatAnterior.jogadorId}:`, error);
                    }
                }
            }

            // Array para armazenar as novas estatísticas deste jogo
            const novasEstatisticasJogo = [];

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
                    const temporada = stat.temporada || '2025';

                    // Busca o jogador
                    let jogador;
                    if (stat.jogador_id) {
                        jogador = await tx.jogador.findUnique({
                            where: { id: parseInt(stat.jogador_id) },
                            include: {
                                times: {
                                    where: { temporada },
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
                                temporada
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
                                        temporada
                                    }
                                }
                            },
                            include: {
                                times: {
                                    where: {
                                        timeId: time.id,
                                        temporada
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

                    // Prepara as estatísticas para este jogo
                    const estatisticasDoJogo = {
                        ataque: {
                            passes_completos: parseInt(stat.passes_completos) || 0,
                            passes_tentados: parseInt(stat.passes_tentados) || 0,
                            td_passado: parseInt(stat.td_passado) || 0,
                            interceptacoes_sofridas: parseInt(stat.interceptacoes_sofridas) || 0,
                            sacks_sofridos: parseInt(stat.sacks_sofridos) || 0,
                            corrida: parseInt(stat.corrida) || 0,
                            tds_corridos: parseInt(stat.tds_corridos) || 0,
                            recepcao: parseInt(stat.recepcao) || 0,
                            alvo: parseInt(stat.alvo) || 0,
                            td_recebido: parseInt(stat.td_recebido) || 0
                        },
                        defesa: {
                            sack: parseInt(stat.sack) || 0,
                            pressao: parseInt(stat.pressao) || 0,
                            flag_retirada: parseInt(stat.flag_retirada) || 0,
                            flag_perdida: parseInt(stat.flag_perdida) || 0,
                            passe_desviado: parseInt(stat.passe_desviado) || 0,
                            interceptacao_forcada: parseInt(stat.interceptacao_forcada) || 0,
                            td_defensivo: parseInt(stat.td_defensivo) || 0
                        }
                    };

                    // Salva as estatísticas deste jogo para este jogador
                    novasEstatisticasJogo.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada,
                        estatisticas: estatisticasDoJogo
                    });

                    // Calcula as novas estatísticas totais
                    const novasEstatisticasTotais = {
                        ataque: {
                            passes_completos: (estatisticasAtuais.ataque?.passes_completos || 0) + estatisticasDoJogo.ataque.passes_completos,
                            passes_tentados: (estatisticasAtuais.ataque?.passes_tentados || 0) + estatisticasDoJogo.ataque.passes_tentados,
                            td_passado: (estatisticasAtuais.ataque?.td_passado || 0) + estatisticasDoJogo.ataque.td_passado,
                            interceptacoes_sofridas: (estatisticasAtuais.ataque?.interceptacoes_sofridas || 0) + estatisticasDoJogo.ataque.interceptacoes_sofridas,
                            sacks_sofridos: (estatisticasAtuais.ataque?.sacks_sofridos || 0) + estatisticasDoJogo.ataque.sacks_sofridos,
                            corrida: (estatisticasAtuais.ataque?.corrida || 0) + estatisticasDoJogo.ataque.corrida,
                            tds_corridos: (estatisticasAtuais.ataque?.tds_corridos || 0) + estatisticasDoJogo.ataque.tds_corridos,
                            recepcao: (estatisticasAtuais.ataque?.recepcao || 0) + estatisticasDoJogo.ataque.recepcao,
                            alvo: (estatisticasAtuais.ataque?.alvo || 0) + estatisticasDoJogo.ataque.alvo,
                            td_recebido: (estatisticasAtuais.ataque?.td_recebido || 0) + estatisticasDoJogo.ataque.td_recebido
                        },
                        defesa: {
                            sack: (estatisticasAtuais.defesa?.sack || 0) + estatisticasDoJogo.defesa.sack,
                            pressao: (estatisticasAtuais.defesa?.pressao || 0) + estatisticasDoJogo.defesa.pressao,
                            flag_retirada: (estatisticasAtuais.defesa?.flag_retirada || 0) + estatisticasDoJogo.defesa.flag_retirada,
                            flag_perdida: (estatisticasAtuais.defesa?.flag_perdida || 0) + estatisticasDoJogo.defesa.flag_perdida,
                            passe_desviado: (estatisticasAtuais.defesa?.passe_desviado || 0) + estatisticasDoJogo.defesa.passe_desviado,
                            interceptacao_forcada: (estatisticasAtuais.defesa?.interceptacao_forcada || 0) + estatisticasDoJogo.defesa.interceptacao_forcada,
                            td_defensivo: (estatisticasAtuais.defesa?.td_defensivo || 0) + estatisticasDoJogo.defesa.td_defensivo
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

export default mainRouter