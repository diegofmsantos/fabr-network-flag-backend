import { PrismaClient } from '@prisma/client'
import { TimeSchema } from '../schemas/Time'
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
    limits: { fileSize: 5 * 1024 * 1024 }
});


export const mainRouter = express.Router()
const prisma = new PrismaClient()

mainRouter.get('/times', async (req, res) => {
    console.log('Rota /api/times chamada')
    try {
        const { temporada } = req.query
        const temporadaFiltro = temporada ? String(temporada) : '2025'
        const times = await prisma.time.findMany({
            where: { temporada: temporadaFiltro },
            include: {
                jogadores: {
                    where: { temporada: temporadaFiltro },
                    include: { jogador: true }
                },
            },
        });

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

mainRouter.post('/time', async (req, res) => {
    try {
        const teamData = TimeSchema.parse(req.body)

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

mainRouter.put('/time/:id', async (req, res) => {
    const { id } = req.params

    try {

        const timeData = TimeSchema.parse(req.body)
        const { id: _, jogadores, ...updateData } = timeData 

        const updatedTime = await prisma.time.update({
            where: { id: parseInt(id) },
            data: updateData, 
        })

        res.status(200).json(updatedTime)
    } catch (error) {
        console.error('Erro ao atualizar o time:', error)
        res.status(500).json({ error: 'Erro ao atualizar o time' })
    }
})


mainRouter.delete('/time/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {

        const id = parseInt(req.params.id, 10)

        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" })
            return
        }

        const existingTime = await prisma.time.findUnique({
            where: { id },
        })

        if (!existingTime) {
            res.status(404).json({ error: "Time não encontrado" })
            return
        }

        await prisma.jogadorTime.deleteMany({
            where: { timeId: id },
        })

        await prisma.time.delete({
            where: { id },
        })

        res.status(200).json({ message: "Time excluído com sucesso!" })
    } catch (error) {
        console.error("Erro ao excluir time:", error)
        res.status(500).json({ error: "Erro ao excluir time" })
    }
})

mainRouter.post('/importar-times', upload.single('arquivo'), async (req, res) => {
    console.log('Rota /importar-times chamada')
    try {
        if (!req.file) {
            console.log('Nenhum arquivo enviado');
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        console.log('Arquivo recebido:', req.file.path);

        console.log('Tentando ler o arquivo Excel...');
        const workbook = xlsx.readFile(req.file.path);
        console.log('Arquivo Excel lido com sucesso');

        const sheetName = workbook.SheetNames[0];
        console.log('Nome da planilha:', sheetName);

        const timeSheet = workbook.Sheets[sheetName];

        console.log('Convertendo planilha para JSON...');
        let timesRaw = xlsx.utils.sheet_to_json(timeSheet) as any[];
        console.log(`Processando ${timesRaw.length} times da planilha`);

        const times = timesRaw.map(time => ({
            ...time,
            temporada: time.temporada ? String(time.temporada) : '2025'
        }));

        console.log('Times pré-processados com temporada convertida para string');

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        for (const time of times) {
            try {
                console.log(`Processando time: ${time.nome}, temporada: ${time.temporada}, tipo: ${typeof time.temporada}`);

                if (!time.nome || !time.sigla || !time.cor) {
                    console.log(`Time com dados incompletos: ${JSON.stringify(time)}`);
                    resultados.erros.push({
                        time: time.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }
                
                console.log(`Verificando se o time ${time.nome} já existe na temporada ${time.temporada}`);

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

        fs.unlinkSync(req.file.path);
        console.log('Arquivo removido após processamento');

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} times importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de times:', error);

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