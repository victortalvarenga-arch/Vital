import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { db, getConfig, listarServicos, staffOut, clientOut, apptOut, templateOut } from './db.js';
import { hoje, addDias } from './lib/dates.js';
import { catalogo } from './routes/catalogo.js';
import { clientes } from './routes/clientes.js';
import { agendamentos } from './routes/agendamentos.js';
import { publico } from './routes/publico.js';
import { mensagens } from './routes/mensagens.js';
import { relatorios } from './routes/relatorios.js';
import { iniciarJobs } from './jobs/mensagens.js';

const app = express();
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '1mb' }));

/**
 * Autenticação do painel. Neste estágio é um token único no .env — suficiente
 * para rodar local e no primeiro cliente. Antes de colocar em produção com
 * mais de um estúdio, troque por usuários no banco com senha hasheada.
 */
function exigeToken(req, res, next) {
  const esperado = process.env.ADMIN_TOKEN;
  if (!esperado) return next();                       // sem token configurado = modo aberto (dev)
  const enviado = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (enviado !== esperado) return res.status(401).json({ erro: 'não autorizado' });
  next();
}

app.get('/api/saude', (req, res) => res.json({ ok: true, data: hoje() }));

/* Site: aberto. */
app.use('/api/publico', publico);

/* Painel: protegido. */
app.use('/api', exigeToken);
app.use('/api', catalogo);
app.use('/api/clientes', clientes);
app.use('/api/agendamentos', agendamentos);
app.use('/api/mensagens', mensagens);
app.use('/api/relatorios', relatorios);

/**
 * Bootstrap do painel: devolve tudo o que a tela precisa numa chamada só.
 * Evita 6 requisições em cascata no carregamento e mantém o front simples.
 */
app.get('/api/estado', (req, res) => {
  const h = hoje();
  res.json({
    config: getConfig(),
    servicos: listarServicos(),
    profissionais: db.prepare('SELECT * FROM staff ORDER BY nome').all().map(staffOut),
    clientes: db.prepare('SELECT * FROM clients ORDER BY nome').all().map(clientOut),
    agendamentos: db.prepare('SELECT * FROM appointments WHERE data >= ? ORDER BY data, hora')
      .all(addDias(h, -120)).map(apptOut),
    templates: db.prepare('SELECT * FROM templates ORDER BY tipo, titulo').all().map(templateOut),
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'erro interno', detalhe: err.message });
});

const porta = process.env.PORT || 3333;
app.listen(porta, () => {
  console.log(`\n  Estúdio Agenda · API em http://localhost:${porta}`);
  console.log(`  Banco: ${process.env.DB_FILE || 'server/db/estudio.db'}`);
  if (!process.env.ADMIN_TOKEN) console.log('  ⚠  ADMIN_TOKEN vazio: o painel está sem senha (ok em dev).');
  iniciarJobs();
});
