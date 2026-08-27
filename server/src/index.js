import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { db, iniciarBanco, getConfig, listarServicos, staffOut, clientOut, apptOut, templateOut } from './db.js';
import { hoje, addDias } from './lib/dates.js';
import { catalogo } from './routes/catalogo.js';
import { clientes } from './routes/clientes.js';
import { agendamentos } from './routes/agendamentos.js';
import { publico } from './routes/publico.js';
import { mensagens } from './routes/mensagens.js';
import { relatorios } from './routes/relatorios.js';
import { iniciarJobs } from './jobs/mensagens.js';
import { rota } from './lib/rota.js';

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
app.get('/api/estado', rota(async (req, res) => {
  const h = hoje();
  const [config, servicos, equipe, clientela, agenda, modelos] = await Promise.all([
    getConfig(),
    listarServicos(),
    db.all('SELECT * FROM staff ORDER BY nome'),
    db.all('SELECT * FROM clients ORDER BY nome'),
    db.all('SELECT * FROM appointments WHERE data >= ? ORDER BY data, hora', addDias(h, -120)),
    db.all('SELECT * FROM templates ORDER BY tipo, titulo'),
  ]);
  res.json({
    config,
    servicos,
    profissionais: equipe.map(staffOut),
    clientes: clientela.map(clientOut),
    agendamentos: agenda.map(apptOut),
    templates: modelos.map(templateOut),
  });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'erro interno', detalhe: err.message });
});

const porta = process.env.PORT || 3333;

// As migrations rodam antes de aceitar requisição: subir a API contra um banco
// com esquema velho é pior do que não subir.
iniciarBanco()
  .then(() => {
    app.listen(porta, () => {
      // A URL carrega a senha do banco; nunca imprima inteira.
      const alvo = (process.env.DATABASE_URL || '').replace(/:[^:@/]*@/, ':***@');
      console.log(`\n  Estúdio Agenda · API em http://localhost:${porta}`);
      console.log(`  Banco: ${alvo || '(DATABASE_URL não definida)'}`);
      if (!process.env.ADMIN_TOKEN) console.log('  ⚠  ADMIN_TOKEN vazio: o painel está sem senha (ok em dev).');
      iniciarJobs();
    });
  })
  .catch(erro => {
    console.error(`\n  Não foi possível preparar o banco: ${erro.message}\n`);
    process.exit(1);
  });
