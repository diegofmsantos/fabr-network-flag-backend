import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { JogadorSchema } from '../schemas/Jogador'
import fs from 'fs';
import path from 'path';
import multer from 'multer'
import xlsx from 'xlsx';
import { JogadorComHistorico } from '../types/jogador';

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

        const whereCondition: any = {
            temporada: String(temporada)
        };

        if (timeId) {
            whereCondition.timeId = parseInt(String(timeId));
        }

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

        const jogadoresComHistorico: JogadorComHistorico[] = jogadoresFormatados.map(jogador => ({
            ...jogador,
            historicoTemporadas: undefined
        }));

        if (includeAllTemporadas === 'true' && !timeId) {
            const jogadoresTodasTemporadas = await prisma.jogadorTime.findMany({
                where: {
                    jogadorId: { in: jogadoresComHistorico.map(j => j.id) }
                },
                include: {
                    jogador: true,
                    time: true
                },
                distinct: ['jogadorId', 'temporada']
            });

            jogadoresComHistorico.forEach(jogador => {
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

        console.log(`Jogadores encontrados: ${jogadoresComHistorico.length}`);

        res.status(200).json(jogadoresComHistorico);
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

mainRouter.post('/jogador', async (req, res) => {
    try {
        const { temporada = '2025', ...jogadorRawData } = req.body;
        const jogadorData = JogadorSchema.parse(jogadorRawData);

        const estatisticas = {
            passe: jogadorData.estatisticas?.passe ?? {},
            corrida: jogadorData.estatisticas?.corrida ?? {},
            recepcao: jogadorData.estatisticas?.recepcao ?? {},
            defesa: jogadorData.estatisticas?.defesa ?? {}
        };

        if (!jogadorData.timeId) {
            res.status(400).json({ error: 'O campo "timeId" é obrigatório.' });
            return;
        }

        const timeExiste = await prisma.time.findUnique({
            where: { id: jogadorData.timeId }
        });

        if (!timeExiste) {
            res.status(404).json({ error: 'Time não encontrado.' });
            return;
        }

        const time_nome = timeExiste.nome;

        const jogadorCriado = await prisma.jogador.create({
            data: {
                nome: jogadorData.nome ?? '',
            },
        });

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
                time_nome
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

mainRouter.put('/jogador/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {

        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" });
            return;
        }

        const { estatisticas, numero, camisa, timeId, time_nome, temporada, id: bodyId, ...dadosJogador } = req.body;

        console.log("Dados recebidos para atualização:", req.body);

        const updatedJogador = await prisma.jogador.update({
            where: { id },
            data: dadosJogador,
        });

        if (temporada && timeId) {

            const vinculoExistente = await prisma.jogadorTime.findFirst({
                where: {
                    jogadorId: id,
                    timeId: parseInt(String(timeId)),
                    temporada: temporada,
                }
            });

            const estatisticasAtualizadas = {
                passe: estatisticas?.passe || {},
                corrida: estatisticas?.corrida || {},
                recepcao: estatisticas?.recepcao || {},
                defesa: estatisticas?.defesa || {}
            };

            if (vinculoExistente) {
                const updateData = {
                    numero: numero !== undefined ? parseInt(String(numero)) : vinculoExistente.numero,
                    camisa: camisa !== undefined ? camisa : vinculoExistente.camisa,
                    estatisticas: {
                        ...vinculoExistente.estatisticas as any,
                        ...estatisticasAtualizadas
                    }
                };

                const vinculoAtualizado = await prisma.jogadorTime.update({
                    where: { id: vinculoExistente.id },
                    data: updateData,
                });

                console.log("Vínculo atualizado:", vinculoAtualizado);
            } else {

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
                        time: true // 
                    }
                }
            }
        });

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