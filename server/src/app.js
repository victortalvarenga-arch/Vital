import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { db, getConfig, listarServicos, listarUnidades, staffOut, clientOut, apptOut, templateOut, blockOut } from './db.js';
import { hoje, addDias } from './lib/dates.js';
import { catalogo } from './routes/catalogo.js';
import { clientes } from './routes/clientes.js';
import { agendamentos } from './routes/agendamentos.js';
import { publico } from './routes/publico.js';
import { mensagens } from './routes/mensagens.js';
import { relatorios } from './routes/relatorios.js';
import { uploads, PASTA as PASTA_UPLOADS } from './routes/uploads.js';
import { auth } from './routes/auth.js';
import { cadastro } from './routes/cadastro.js';
import { plataforma } from './routes/plataforma.js';
import { bloqueios } from './routes/bloqueios.js';
import { sessaoDe, NOME_COOKIE, exige, escopoDe } from './lib/auth.js';
import { rota } from './lib/rota.js';
import { comRegistro } from './lib/registro.js';
import { comAdicionais } from './lib/adicionais.js';
import { combosAtivos } from './lib/combos.js';
import { comEmpresa } from './lib/tenant.js';
import { suporte } from './routes/suporte.js';
import { fecharAtendimentos } from './jobs/fechamento.js';

/**
 * Monta a aplicação Express, sem subir nada.
 *
 * Separado de `index.js` de propósito: importar este arquivo não abre porta nem
 * liga o cron, então o teste fala com as rotas de verdade — com o middleware de
 * empresa, o cookie de sessão e as guardas de papel no caminho — sem servidor
 * de pé nem job disparando no meio.
 */
const app = express();

/**
 * Atrás de proxy (Vercel, Cloudflare, nginx), o `Host` que chega é o do proxy,
 * não o que a pessoa digitou — e é o que a pessoa digitou que diz de qual
 * empresa é a requisição. Com `trust proxy`, o Express passa a ler
 * `X-Forwarded-Host` e `X-Forwarded-Proto`.
 *
 * Desligado por padrão, e é assim que tem de ser: ligado sem proxy na frente,
 * qualquer cliente manda `X-Forwarded-Host` e escolhe de qual empresa quer ser.
 * Em produção, o valor é o número de proxies confiáveis (`1` na maioria dos
 * provedores), nunca `true`.
 */
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v);
}

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
 * As duas rotas que rodam SEM empresa definida, e por isso vêm antes do
 * middleware que prende a conexão a uma:
 *
 *  - `/api/cadastro` cria empresa, então não pode depender de haver uma;
 *  - `/api/plataforma` é o nosso back-office, que olha todas de uma vez.
 */
app.use('/api/cadastro', cadastro);
app.use('/api/plataforma', plataforma);

/**
 * Toda rota de dado passa por aqui antes de qualquer outra coisa: descobre a
 * empresa e prende a conexão do Postgres a ela. Do middleware para baixo, o
 * banco recusa sozinho qualquer linha de outra empresa.
 */
app.use('/api', comEmpresa(db));
app.use('/api', identificar);

// `req.registrar` existe em toda rota, inclusive nas de `/api/auth` — é lá que
// se dá e se tira acesso, a ação mais sensível do painel. Ele próprio ignora a
// chamada quando não há usuário, então rota pública não gera registro sem
// autor. Montado depois de `identificar`, que é quem descobre quem é.
app.use('/api', comRegistro);

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
app.use('/api/bloqueios', bloqueios);
// Suporte é do painel da empresa, não da plataforma: quem abre chamado é quem
// opera o negócio. A fila do outro lado está em /api/plataforma/tickets.
app.use('/api/suporte', suporte);
app.use('/api/mensagens', mensagens);

/**
 * Bootstrap do painel: devolve tudo o que a tela precisa numa chamada só.
 * Evita 6 requisições em cascata no carregamento e mantém o front simples.
 */
app.get('/api/estado', rota(async (req, res) => {
  const h = hoje();

  // Fecha o que já terminou antes de montar a resposta. O cron sozinho deixava
  // até cinco minutos de defasagem, e é justamente na tela que a pessoa abre
  // para saber "como está o meu dia" que número velho incomoda.
  //
  // Escrever dentro de um GET não é bonito, e por isso está aqui e não num
  // middleware: este GET é o "abrir o painel", não uma leitura qualquer. É
  // idempotente (sem nada pendente, é um SELECT que volta vazio) e nunca
  // derruba o carregamento — painel que não abre é pior que caixa defasado.
  //
  // O cron continua existindo, e não é redundância: o pós-atendimento e a
  // reativação precisam rodar mesmo na semana em que ninguém abre o painel.
  try {
    await fecharAtendimentos();
  } catch (erro) {
    console.error('[fechamento no bootstrap]', erro.message);
  }
  // Mesmo recorte da rota de agenda: o bootstrap não pode ser a porta dos
  // fundos que devolve o que a rota filtrada esconde.
  const so = escopoDe(req.usuario);

  // Em sequência, e não em Promise.all: a requisição inteira roda numa conexão
  // só — é o que faz o RLS valer — e uma conexão do `pg` atende uma consulta
  // por vez. O Promise.all não ganhava paralelismo nenhum, só enfileirava com
  // um aviso de descontinuado no meio.
  const desde = addDias(h, -120);
  const config = await getConfig();
  const servicos = await listarServicos();
  const equipe = await db.all('SELECT * FROM staff ORDER BY nome');
  const clientela = await db.all('SELECT * FROM clients ORDER BY nome');
  const agenda = so
    ? await db.all('SELECT * FROM appointments WHERE data >= ? AND staff_id = ? ORDER BY data, hora', desde, so)
    : await db.all('SELECT * FROM appointments WHERE data >= ? ORDER BY data, hora', desde);
  const modelos = await db.all('SELECT * FROM templates ORDER BY tipo, titulo');
  const fechados = await db.all('SELECT * FROM blocks WHERE data >= ? ORDER BY data, hora_ini', desde);
  // Vencidos junto: o painel precisa achar a promoção do ano passado para
  // reaproveitar, e é ele quem marca qual está fora do ar.
  const pacotes = await combosAtivos({ incluirVencidos: true });
  // Arquivadas junto: a agenda antiga aponta para elas, e esconder o nome
  // faria um atendimento do mês passado parecer sem lugar.
  const locais = await listarUnidades();
  res.json({
    config,
    servicos,
    profissionais: equipe.map(staffOut),
    clientes: clientela.map(clientOut),
    agendamentos: await comAdicionais(agenda.map(apptOut)),
    templates: modelos.map(templateOut),
    combos: pacotes,
    unidades: locais,
    // Funcionário vê o que fecha a agenda dele: o próprio e os da empresa toda.
    bloqueios: fechados
      .filter(b => !so || !b.staff_id || b.staff_id === so)
      .map(blockOut),
  });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'erro interno', detalhe: err.message });
});

export { app };
