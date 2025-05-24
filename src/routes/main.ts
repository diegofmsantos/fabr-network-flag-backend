import express from 'express'
import { timesRouter } from './routes/times'
import { jogadoresRouter } from './routes/jogadores'
import { statsRouter } from './routes/stats'
import { adminRouter } from './routes/admin'

const server = express()

server.use('/api', timesRouter)
server.use('/api', jogadoresRouter)
server.use('/api', statsRouter)
server.use('/api', adminRouter)