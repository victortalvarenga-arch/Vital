import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { db, iniciarBanco, getConfig, listarServicos, staffOut, clientOut, apptOut, templateOut } from './db.js';
import { hoje, addDias } from './lib/dates.js';
import { catalogo } from './routes/catalogo.js';
import { clientes } from './routes/clientes.js';
import { agendamentos } from './routes/agendamentos.js';
import { publico } from './routes/publico.js';
import { mensagens } from './routes/mensagens.js';
import { relatorios } from './routes/relatorios.js';
import { uploads, PASTA as PASTA_UPLOADS } from './routes/uploads.js';
import { auth } from './routes/auth.js';
import { sessaoDe, NOME_COOKIE, exige, escopoDe } from './lib/auth.js';
import { iniciarJobs } from './jobs/mensagens.js';
import { rota } from './lib/rota.js';
import { comEmpresa } from './lib/tenant.js';

const app = express();
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/**
 * Descobre quem está logado, se estiver, e põe em `req.usuario`.
 *
 * Não recusa ninguém: rota pública e tela de login precisam passar por aqui
 * sem sessão. Quem recusa é `exigeLogin` abaixo.
 */
const identificar = rota(async (req, res, next) => {
  const s = await sessaoDe(req.cookies?.[NOME_COOKIE]);
  // Sessão de outra empresa não vale nesta: no dia do subdomínio, o cookie de
  // um cliente não pode abrir o painel de outro.
  if (s && s.tenantId === req.tenantId) req.usuario = s.usuario;
  next();
});

/** Barra quem não está logado. Tudo do painel passa por aqui. */
function exigeLogin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ erro: 'faça login para continuar' });
  next();
}

app.get('/api/saude', (req, res) => res.json({ ok: true, data: hoje() }));

/**
 * Imagens enviadas pela empresa: logo, capa, foto de serviço.
 *
 * São públicas por natureza — aparecem no site para qualquer visitante. O que
 * protege é o nome do arquivo, gerado no servidor, e a pasta por empresa.
 * `dotfiles: 'deny'` e `index: false` evitam servir o que não foi pedido.
 */
app.use('/uploads', express.static(PASTA_UPLOADS, {
  dotfiles: 'deny',
  index: false,
  maxAge: '7d',
}));

/**
 * Toda rota de dado passa por aqui antes de qualquer outra coisa: descobre a
 * empresa e prende a conexão do Postgres a ela. Do middleware para baixo, o
 * banco recusa sozinho qualquer linha de outra empresa.
 */
app.use('/api', comEmpresa(db));
app.use('/api', identificar);

/* Login e primeiro acesso: abertos, senão ninguém entra na primeira vez. */
app.use('/api/auth', auth);

/* Site: aberto. */
app.use('/api/publico', publico);

/* Painel: exige sessão. */
app.use('/api', exigeLogin);

// A guarda vai na ROTA, não só na tela. Esconder o botão evita erro feio para
// quem não pode; recusar aqui é o que impede a chamada direta.
app.use('/api/uploads', exige('cadastros'), uploads);
app.use('/api/relatorios', exige('financeiro'), relatorios);
app.use('/api', catalogo);
app.use('/api/clientes', clientes);
app.use('/api/agendamentos', agendamentos);
app.use('/api/mensagens', mensagens);

/**
 * Bootstrap do painel: devolve tudo o que a tela precisa numa chamada só.
 * Evita 6 requisições em cascata no carregamento e mantém o front simples.
 */
app.get('/api/estado', rota(async (req, res) => {
  const h = hoje();
  // Mesmo recorte da rota de agenda: o bootstrap não pode ser a porta dos
  // fundos que devolve o que a rota filtrada esconde.
  const so = escopoDe(req.usuario);
  const [config, servicos, equipe, clientela, agenda, modelos] = await Promise.all([
    getConfig(),
    listarServicos(),
    db.all('SELECT * FROM staff ORDER BY nome'),
    db.all('SELECT * FROM clients ORDER BY nome'),
    so
      ? db.all('SELECT * FROM appointments WHERE data >= ? AND staff_id = ? ORDER BY data, hora', addDias(h, -120), so)
      : db.all('SELECT * FROM appointments WHERE data >= ? ORDER BY data, hora', addDias(h, -120)),
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
      console.log('  Painel protegido por login (argon2 + sessão em cookie).');
      iniciarJobs();
    });
  })
  .catch(erro => {
    console.error(`\n  Não foi possível preparar o banco: ${erro.message}\n`);
    process.exit(1);
  });
