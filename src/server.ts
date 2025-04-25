import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'
import { mainRouter } from './routes/main'

const server = express()

server.use(helmet())
server.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}))
server.use(express.json({ limit: '50mb' }))
server.use(express.urlencoded({ extended: true, limit: '50mb' }))
server.use(express.static(path.join(__dirname, '../public')))

server.use('/api', mainRouter)

const port = process.env.PORT || 5000

server.listen(port, () => {
    console.log(`Servidor rodando no link: http://localhost:${port}`)
})
