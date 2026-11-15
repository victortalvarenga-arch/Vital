import { Router } from 'express';
import { db, uid, listarServicos, staffOut, getConfig, listarUnidades } from '../db.js';
import { hoje, soDigitos } from '../lib/dates.js';
import { foneValido } from '../lib/fone.js';
import { rota } from '../lib/rota.js';
import { criarAgendamento, criarCombo } from './agendamentos.js';
import { horariosLivres, horariosPorServico, horariosPorEquipe, diasComVaga, diasComVagaPara, foraDoPrazoDoSite } from '../lib/availability.js';
import { adicionaisDeTodos, validarAdicionais } from '../lib/adicionais.js';
import { horariosDeAtendimento } from '../lib/horarios.js';
import { marcar, etapaDoNavegador, sessaoValida } from '../lib/funil.js';
import { limite } from '../lib/limite.js';
import { convidarAniversario, conferirAniversario, segredoConfigurado } from '../lib/segredo.js';
import { empresaAtual } from '../lib/contexto.js';
import { conferirIdToken, loginGoogleConfigurado } from '../lib/google-login.js';
import { combosAtivos, comboCompleto, profissionaisDoCombo, profissionaisDosCombos, valeNoDia } from '../lib/combos.js';

export const publico = Router();

/**
 * Os limites das cinco rotas abertas que escrevem ou respondem sobre quem
 * existe. Generosos de propósito: escritório, salão e shopping saem todos pelo
 * mesmo IP, e barrar cliente de verdade para atrapalhar robô é troca ruim.
 * O porquê de cada rota estar aqui está em `lib/limite.js`.
 */
const LIMITES = {
  // Uma visita gera três chamadas; isto cobre dezenas de pessoas atrás do
  // mesmo NAT sem folga para quem sorteia sessão em série.
  evento: limite({ nome: 'evento', max: 120, janelaSeg: 600 }),
  // Marcar dez horários em dez minutos do mesmo lugar não é uso de cliente.
  agendar: limite({ nome: 'agendar', max: 10, janelaSeg: 600 }),
  // O mais apertado dos três: aqui a resposta diz se um telefone tem cadastro,
  // e sem limite isso vira varredura de quem é cliente de quem.
  identificar: limite({ nome: 'identificar', max: 30, janelaSeg: 600 }),
  // Escreve na ficha, ainda que só o dia e o mês: tem teto como o resto.
  aniversario: limite({ nome: 'aniversario', max: 20, janelaSeg: 600 }),
  // Responde se uma conta Google já é cliente aqui. Forjar token não dá, mas
  // a regra da casa vale: rota pública que responde sobre dado que existe tem
  // teto.
  google: limite({ nome: 'google', max: 30, janelaSeg: 600 }),
  // Vitrine, horários e dias livres não escrevem, mas cada pedido faz várias
  // consultas: em laço, ocupam o banco e a única máquina. Um balde para as
  // três, senão alternar entre elas triplicava o teto. Uma visita de verdade
  // faz dezenas de leituras, nunca centenas por minuto.
  leitura: limite({ nome: 'leitura', max: 300, janelaSeg: 60 }),
};

/**
 * Rotas do site, sem autenticação. Só devolvem o que é público:
 * serviços ativos, profissionais ativas e horários livres.
 * Nunca exponha aqui lista de clientes nem faturamento.
 */

/**
 * Tudo que o site precisa numa chamada: identidade, marca, serviços e equipe.
 *
 * O que sai daqui é público de verdade — qualquer pessoa na internet vê. Por
 * isso a config passa por uma lista de campos escolhidos a dedo, em vez de ir
 * inteira: nela também moram horários de disparo de mensagem e chave Pix.
 */
/**
 * Serviços com o preço já filtrado pela config e os extras que cada um oferece.
 *
 * Os extras do catálogo inteiro vêm em duas consultas, não uma por serviço:
 * ver `adicionaisDeTodos`.
 */
async function comPrecoEExtras(servicos, cfg) {
  const extras = await adicionaisDeTodos(servicos);
  const saida = [];
  for (const s of servicos) {
    // Comissão e observação são da equipe: quanto a empresa paga a quem atende
    // não é assunto de quem agenda. Tirados pelo nome, porque o resto do
    // serviço sai inteiro — campo interno novo precisa entrar nesta lista.
    const { comissao, comissoes, obs, ...publico } = s;
    saida.push({
      ...publico,
      preco: cfg.exibir?.preco && s.mostrarPreco ? s.preco : null,
      // A chave "Fotos dos serviços" do painel. Decidida aqui, e não em cada
      // componente do site: a foto aparece em três lugares (círculos, cartões
      // da Clínica e a lista do agendamento), e a chave já foi ignorada pelos
      // três sem ninguém notar.
      foto: cfg.exibir?.fotos === false ? '' : s.foto,
      adicionais: extras.get(s.id) || [],
    });
  }
  return saida;
}

/**
 * Combos para o site.
 *
 * `precoCheio` e `economia` saem sempre, mesmo com a empresa escondendo preço:
 * sem os dois números o selo de promoção não tem o que provar, e um combo sem
 * vantagem visível é só mais um item na lista.
 */
async function vitrineDeCombos() {
  const lista = await combosAtivos();
  // Quem faz cada pacote inteiro, de todos de uma vez. O site precisa da lista
  // para saber se há escolha de profissional a oferecer — e para não oferecer
  // quem não faz.
  const equipes = await profissionaisDosCombos(lista);
  const saida = [];
  for (const c of lista) {
    const profissionais = equipes.get(c.id) || [];
    // Combo que ninguém faz do começo ao fim não vai para a vitrine: o site
    // abriria um calendário sem dia nenhum, e a cliente atravessaria o fluxo
    // inteiro para descobrir isso no fim. Acontece quando cada serviço do
    // pacote é de uma pessoa diferente — o painel deixa cadastrar assim.
    if (!profissionais.length) continue;
    saida.push({
      id: c.id, nome: c.nome, descricao: c.descricao, foto: c.foto,
      preco: c.preco, precoCheio: c.precoCheio, economia: c.economia,
      duracao: c.duracao, validoAte: c.validoAte, diasSemana: c.diasSemana,
      servicos: c.servicos.map(s => ({ id: s.id, nome: s.nome, preco: s.preco })),
      profissionais,
    });
  }
  return saida;
}

/**
 * A seção está ligada em "O que mostrar"? Desligada, o dado dela nem sai da
 * vitrine — esconder só no site deixaria o conteúdo tirado no ar para quem
 * olhar a resposta. Ausente conta como ligada: é o padrão, e config antiga
 * não tem a chave.
 */
const secaoLigada = (cfg, chave) => cfg.exibir?.[chave] !== false;

function avaliacoesParaVitrine(a) {
  if (!a?.total || !a?.nota) return null;
  return {
    nota: Number(a.nota),
    total: Number(a.total),
    link: /^https:\/\//.test(a.link || '') ? a.link : '',
    lista: (a.lista || [])
      .filter(x => x?.texto && x?.nota >= 1 && x?.nota <= 5)
      .slice(0, 6)
      .map(x => ({ autor: String(x.autor || ''), nota: x.nota, texto: String(x.texto), data: String(x.data || '') })),
  };
}

publico.get('/vitrine', LIMITES.leitura, rota(async (req, res) => {
  const cfg = await getConfig();
  const equipe = await db.all('SELECT * FROM staff WHERE ativo=1 ORDER BY nome');
  const servicos = await listarServicos({ somenteAtivos: true });

  res.json({
    negocio: {
      nome: cfg.nome,
      slogan: cfg.slogan,
      sobre: secaoLigada(cfg, 'sobre') ? cfg.sobre : '',
      endereco: cfg.endereco,
      cidade: cfg.cidade,
      mapa: cfg.mapa,
      fone: cfg.fone,
      whatsapp: cfg.whatsapp || cfg.fone,
      instagram: cfg.instagram,
      janelaDias: cfg.janelaDias || 30,
      formasPagamento: cfg.formasPagamento || [],
      // Derivado da jornada da equipe, nunca um campo à parte — ver
      // `lib/horarios.js`. Vai para a página e para o schema de negócio local.
      horarios: horariosDeAtendimento(equipe.map(staffOut)),
    },
    // O id do cliente OAuth do login da cliente. **Não é segredo** — ele vai
    // na página de todo site que usa "entrar com Google", e o que protege a
    // conta é o token assinado, conferido no servidor. Vazio quando a Vital
    // não tem o login configurado: aí o botão não existe e o site funciona
    // exatamente como antes, só com o WhatsApp. O par secreto
    // (`GOOGLE_CLIENT_SECRET`) é de OUTRO cliente OAuth, o das avaliações, e
    // não sai daqui nunca.
    googleClientId: process.env.GOOGLE_LOGIN_CLIENT_ID || '',
    marca: cfg.marca,
    textos: cfg.textos,
    // Só as três chaves de cada caso, montadas a dedo como o resto desta
    // resposta: campo novo na config não vaza para a vitrine por descuido.
    // Caso sem autorização registrada não sai, venha de onde vier — nem de
    // config antiga, gravada antes de o painel exigir.
    antesDepois: (secaoLigada(cfg, 'antesDepois') ? cfg.antesDepois || [] : [])
      .filter(c => c?.antes && c?.depois && c?.autorizacao?.nome && c?.autorizacao?.data)
      .map(c => ({ antes: c.antes, depois: c.depois, titulo: c.titulo || '' })),
    // Avaliações do Google, montadas a dedo como o resto: só o que o site
    // desenha. Sem nenhuma, `null` — e o site esconde a seção, nunca uma nota
    // sem avaliação por trás.
    avaliacoes: secaoLigada(cfg, 'avaliacoes') ? avaliacoesParaVitrine(cfg.avaliacoesGoogle) : null,
    // Sem imagem não há o que mostrar; mais de 6 não cabe na grade. `tipo`
    // vem do job da conta conectada ('imagem' | 'video').
    // Desligada a seção, as fotos não saem; o perfil continua no rodapé, que
    // é contato e não a seção.
    instagramPosts: (secaoLigada(cfg, 'instagram') ? cfg.instagramPosts || [] : [])
      .filter(p => p?.imagem)
      .slice(0, 6)
      .map(p => ({ imagem: p.imagem, link: p.link || '', tipo: p.tipo === 'video' ? 'video' : 'imagem' })),
    // Só o par de cada pergunta, montado a dedo como o resto desta resposta.
    // Pergunta sem resposta não vai: a seção existe para tirar dúvida, e meia
    // entrada na tela deixa a pessoa mais insegura do que antes.
    faq: (secaoLigada(cfg, 'perguntas') ? cfg.faq || [] : [])
      .filter(p => p?.pergunta?.trim() && p?.resposta?.trim())
      .map(p => ({ pergunta: p.pergunta.trim(), resposta: p.resposta.trim() })),
    exibir: cfg.exibir,
    vocabulario: cfg.vocabulario,
    unidades: await listarUnidades({ somenteAtivas: true }),
    // Preço só sai se a empresa quiser mostrar — algumas preferem "sob consulta".
    servicos: await comPrecoEExtras(servicos, cfg),
    // Promoção vencida não sai da vitrine: `combosAtivos` já a esconde.
    combos: await vitrineDeCombos(),
    // `unidadeId` sai porque é onde a pessoa atende, não dado dela: o site
    // precisa saber para não oferecer, numa unidade, serviço que só quem está
    // na outra faz — e para dizer o endereço certo na confirmação.
    profissionais: equipe.map(staffOut)
      .map(p => ({ id: p.id, nome: p.nome, funcao: p.funcao, cor: p.cor, unidadeId: p.unidadeId })),
    // A seção Equipe, separada de `profissionais` (que é quem se agenda):
    // tirar alguém daqui não tira essa pessoa do agendamento. A descrição que
    // a empresa escreveu vence a `funcao` antiga, que não se edita mais.
    equipe: secaoLigada(cfg, 'equipe')
      ? equipe.map(staffOut)
        .filter(p => !cfg.equipeSite?.[p.id]?.oculto)
        .map(p => {
          const site = cfg.equipeSite?.[p.id] || {};
          return { id: p.id, nome: p.nome, cor: p.cor, foto: site.foto || '', descricao: site.descricao || p.funcao || '' };
        })
      : [],
  });
}));

/**
 * Horários livres, calculados pelo servidor.
 *
 * O front tem uma noção de jornada só para desenhar a grade, mas quem sabe o
 * que está ocupado é o banco. Sem esta rota o site mostraria horário já
 * vendido e a cliente só descobriria ao tentar confirmar.
 */
publico.get('/horarios', LIMITES.leitura, rota(async (req, res) => {
  const { servicoId, profissionalId, data } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) {
    return res.status(400).json({ erro: 'informe data=YYYY-MM-DD' });
  }
  // Dia passado ou além da janela: nenhum horário, nas duas formas de resposta.
  // O motor só aplica a antecedência no dia de hoje; sem isto, uma data de
  // ontem devolvia a grade inteira como livre.
  if (await foraDoPrazoDoSite(data)) {
    return res.json(profissionalId && !req.query.comboId ? { data, horarios: [] } : { data, porProfissional: [] });
  }
  // Combo ocupa a cadeira pelo pacote inteiro e só quem faz todos os serviços
  // aparece — a mesma pessoa atende do começo ao fim.
  if (req.query.comboId) {
    const combo = await comboCompleto(req.query.comboId);
    if (!combo || combo.situacao !== 'ativa') {
      return res.status(404).json({ erro: 'promoção não encontrada' });
    }
    // Dia fora do período ou da semana da promoção: nenhum horário, em vez de
    // horário que a venda recusaria no fim.
    if (!valeNoDia(combo, data)) return res.json({ data, porProfissional: [] });
    const equipe = await profissionaisDoCombo(combo.id);
    const so = profissionalId ? equipe.filter(id => id === profissionalId) : equipe;
    return res.json({ data, porProfissional: await horariosPorEquipe({ staffIds: so, data, duracao: combo.duracao }) });
  }

  if (!servicoId) return res.status(400).json({ erro: 'informe servicoId ou comboId' });

  const svc = await db.get('SELECT * FROM services WHERE id=? AND ativo=1', servicoId);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });

  // Os extras entram na conta: com adicionais escolhidos, o atendimento é mais
  // longo, e horário que caberia sozinho pode não caber mais.
  const extras = await validarAdicionais(svc, listaDeIds(req.query.adicionais));
  if (extras.erro) return res.status(extras.codigo).json({ erro: extras.erro });
  const duracao = svc.duracao + (svc.intervalo || 0) + extras.duracao;

  if (profissionalId) {
    return res.json({ data, horarios: await horariosLivres({ staffId: profissionalId, data, duracao }) });
  }
  res.json({
    data,
    porProfissional: await horariosPorServico({
      servicoId, data, duracaoExtra: extras.duracao, unidadeId: req.query.unidadeId,
    }),
  });
}));

/*
 * Houve aqui um `GET /formularios/:servicoId`, que entregava ao site as
 * perguntas da anamnese para ele montar um passo no agendamento. Saiu em
 * 2026-09-23: **ficha de anamnese é dado de saúde**, sensível na LGPD, e
 * coletá-lo de quem só quer marcar um horário — antes mesmo de ser cliente —
 * é risco que o produto não precisa correr. Quem pergunta é a profissional,
 * com a pessoa na cadeira, por `POST /api/agendamentos/:id/respostas`.
 *
 * Nada de formulário sai por `/api/publico` hoje, e essa é a regra: a rota era
 * inofensiva sozinha (devolvia pergunta, nunca resposta), mas existia só para
 * alimentar uma coleta que não devia acontecer aqui.
 */

/** 'a,b,c' → ['a','b','c']. Vem da query string, então tudo é texto. */
const listaDeIds = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);

/**
 * Quais dias do mês têm vaga — o calendário usa para saber o que pintar.
 *
 * Separado de `/horarios` de propósito: o calendário precisa de trinta dias de
 * uma vez, e a lista de horas precisa de um dia só. Misturar os dois numa rota
 * faria o desenho do mês carregar horário que ninguém pediu.
 */
publico.get('/dias-livres', LIMITES.leitura, rota(async (req, res) => {
  const { servicoId, profissionalId, mes } = req.query;
  if (!/^\d{4}-\d{2}$/.test(mes || '')) {
    return res.status(400).json({ erro: 'informe mes=YYYY-MM' });
  }
  if (req.query.comboId) {
    const combo = await comboCompleto(req.query.comboId);
    if (!combo || combo.situacao !== 'ativa') {
      return res.status(404).json({ erro: 'promoção não encontrada' });
    }
    const ids = await profissionaisDoCombo(combo.id);
    const equipe = ids.length
      ? await db.all(`SELECT * FROM staff WHERE id = ANY(?) AND ativo = 1`, ids)
      : [];
    const dias = await diasComVagaPara({ equipe, mes, duracao: combo.duracao });
    return res.json({ mes, dias: dias.filter(d => valeNoDia(combo, d)) });
  }

  if (!servicoId) return res.status(400).json({ erro: 'informe servicoId ou comboId' });

  const svc = await db.get('SELECT * FROM services WHERE id=? AND ativo=1', servicoId);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });
  const extras = await validarAdicionais(svc, listaDeIds(req.query.adicionais));
  if (extras.erro) return res.status(extras.codigo).json({ erro: extras.erro });

  res.json({
    mes,
    dias: await diasComVaga({
      servicoId, profissionalId, mes, duracaoExtra: extras.duracao,
      unidadeId: req.query.unidadeId,
    }),
  });
}));

/**
 * "Cheguei até aqui" — os passos do funil que acontecem no navegador.
 *
 * Aberta porque o site é aberto, e é o único jeito de saber em qual tela as
 * pessoas somem. O que a protege de virar depósito de lixo: a etapa vem de uma
 * lista fechada, a sessão precisa ter a forma exata de um id sorteado por nós,
 * e a chave primária (empresa, sessão, etapa) faz a mesma visita valer uma
 * linha por passo — no máximo três por aqui, para sempre.
 *
 * Responde 204 em qualquer caso, inclusive quando ignora: o que o site faz com
 * isso é nada, e uma resposta diferente por motivo diria a quem sonda como a
 * validação funciona.
 */
publico.post('/evento', LIMITES.evento, rota(async (req, res) => {
  const { sessao, etapa } = req.body || {};
  if (sessaoValida(sessao) && etapaDoNavegador(etapa)) await marcar({ sessao, etapa });
  res.status(204).end();
}));

/**
 * Identificação por WhatsApp. É o "primeiro acesso" do fluxo: se o número já
 * existe, a cliente não preenche nada de novo.
 *
 * **Responde "sim" ou "não", e nada mais.** Qualquer pessoa na internet digita
 * um número aqui, sem login e sem deixar rastro na empresa. Até 2026-11-13
 * saía também o primeiro nome, para a cliente conferir que o número era o
 * dela; digitando números a esmo, isso montava uma lista de quem é cliente de
 * quem — com nome, de graça, e a empresa nunca saberia. A conferência do
 * número volta pelo código por WhatsApp (ROADMAP, Bloco 4b), que prova o
 * número em vez de mostrar o nome a quem o digitou.
 *
 * O site não precisa do id: o `/agendar` resolve a cliente pelo telefone.
 */
publico.post('/identificar', LIMITES.identificar, rota(async (req, res) => {
  const fone = soDigitos(req.body?.fone);
  const erro = foneValido(fone);
  if (erro) return res.status(400).json({ erro });
  // `SELECT 1`, e não `SELECT nome`: o que não é lido não é devolvido por
  // descuido quando esta rota crescer.
  const c = await db.get('SELECT 1 FROM clients WHERE fone=?', fone);
  res.json({ existe: !!c });
}));

/**
 * "Entrar com Google" — a cliente, não a equipe nem a dona da empresa.
 *
 * **Opção, nunca exigência:** o caminho só com WhatsApp continua ao lado, e o
 * Google não substitui o telefone (ele não devolve número, e o número é a
 * identidade da ficha).
 *
 * Devolve o primeiro nome quando a conta já está ligada a uma ficha — e isso
 * **não** reabre o buraco que o `/identificar` fechou: lá bastava digitar um
 * número qualquer, aqui é preciso um token assinado pelo Google para aquela
 * conta. Quem recebe o nome já provou ser a dona dela.
 *
 * O que a tela faz com a resposta é pré-preencher, nada mais: quem resolve a
 * ficha é o `/agendar`, que confere o token de novo.
 */
publico.post('/google', LIMITES.google, rota(async (req, res) => {
  const quem = await comGoogle(req.body?.token);
  if (!quem) return res.status(401).json({ erro: 'não consegui confirmar essa conta do Google' });

  // O RLS faz esta busca ser "nesta empresa": a mesma conta pode ser cliente
  // do salão e da clínica, e são duas fichas (migration 041).
  const ficha = await db.get('SELECT nome FROM clients WHERE google_sub = ?', quem.sub);
  if (ficha) return res.json({ conhecida: true, primeiroNome: ficha.nome.split(' ')[0] });

  res.json({ conhecida: false, nome: quem.nome, email: quem.email });
}));

/**
 * Confere o ID token e devolve a pessoa, ou `null` — sem derrubar a rota.
 *
 * `null` em vez de exceção porque as duas rotas que usam isto querem o mesmo
 * 401 com o mesmo texto, e um `try/catch` em cada uma convida a esquecer um.
 */
async function comGoogle(token) {
  if (!token || !loginGoogleConfigurado()) return null;
  try {
    return await conferirIdToken(token);
  } catch (erro) {
    // Sem o texto do token no log: ele é credencial.
    console.warn('[login google] token recusado:', erro.message);
    return null;
  }
}

/**
 * O que fazer quando quem entrou com o Google cai numa ficha que já existe.
 *
 * Três situações, e nenhuma delas liga a conta à ficha:
 *
 * - **a ficha já é dela** (mesma conta): nada a fazer;
 * - **a ficha não tem conta**: fica o PEDIDO, e quem confirma é a profissional
 *   no painel. Ligar aqui seria entregar a ficha de outra pessoa — com
 *   histórico, endereço e observações — a quem errou um dígito do telefone;
 * - **a ficha tem OUTRA conta**: não se toca em nada. Vira registro, porque é
 *   o sinal de alguém digitando número alheio, e isso a empresa precisa poder
 *   ver depois.
 *
 * Tudo em `db.opcional`: nada disto pode derrubar o agendamento, que é o que
 * a cliente veio fazer.
 */
async function resolverVinculo(cliente, quem) {
  if (cliente.google_sub === quem.sub) return;

  if (!cliente.google_sub) {
    await db.opcional(async () => {
      await db.run(
        `UPDATE clients SET google_sub_pendente = ?, email_pendente = ?, vinculo_pedido_em = ?
          WHERE id = ?`,
        quem.sub, quem.email, hoje(), cliente.id
      );
      // Sem registro, um pedido sobrescreve o outro e a empresa nunca fica
      // sabendo que alguém reivindicou a ficha. O e-mail de quem pediu não vai
      // para o resumo: ele já está na ficha, para a profissional decidir.
      await db.run(
        `INSERT INTO logs (user_id, usuario_nome, acao, alvo_tipo, alvo_id, resumo, detalhe)
         VALUES (NULL, 'site', 'vinculo.pedido', 'cliente', ?, ?, '{}')`,
        cliente.id, 'uma conta do Google pediu para ser ligada a esta ficha'
      );
    });
    return;
  }

  // Sem o e-mail de quem pediu e sem o nome da ficha: o registro é para
  // contar que aconteceu, não para espalhar dado de ninguém.
  await db.opcional(() => db.run(
    `INSERT INTO logs (user_id, usuario_nome, acao, alvo_tipo, alvo_id, resumo, detalhe)
     VALUES (NULL, 'site', 'vinculo.conflito', 'cliente', ?, ?, '{}')`,
    cliente.id, 'uma conta do Google diferente agendou por este telefone'
  ));
}

/**
 * Agendamento pelo site. Cria a cliente se for primeiro acesso.
 * Ignora o preço vindo do cliente de propósito: quem manda é o banco.
 */
publico.post('/agendar', LIMITES.agendar, rota(async (req, res) => {
  const b = req.body || {};

  // Entrou com o Google? O token é conferido aqui de novo — o que a tela
  // mandou no `/google` não vale nada, porque a tela não é fonte confiável.
  const quem = b.googleToken ? await comGoogle(b.googleToken) : null;
  if (b.googleToken && !quem) {
    return res.status(401).json({ erro: 'não consegui confirmar essa conta do Google' });
  }

  // Conta já ligada a uma ficha: é ela, e o telefone nem é pedido. É o
  // "quem volta não digita nada" que o login promete.
  let cliente = quem ? await db.get('SELECT * FROM clients WHERE google_sub = ?', quem.sub) : null;
  // Ela provou ser a dona desta ficha? Pelo Google, sim — a conta está ligada
  // a ela. Só pelo telefone, não: digitar um número não prova nada. Vira
  // `true` também quando a ficha nasce agora, logo abaixo.
  let provou = !!cliente;

  const fone = soDigitos(b.fone);
  if (!cliente) {
    // A mesma conferência do `/identificar`, e não uma mais frouxa: a tela chama
    // as duas, mas quem chamar só esta não pode ter um caminho mais fácil.
    const erroDoFone = foneValido(fone);
    if (erroDoFone) return res.status(400).json({ erro: erroDoFone });
    cliente = await db.get('SELECT * FROM clients WHERE fone=?', fone);
  }

  if (cliente && quem) await resolverVinculo(cliente, quem);

  if (!cliente) {
    if (!b.nome || b.nome.trim().length < 3) {
      return res.status(400).json({ erro: 'primeiro acesso: informe o nome completo' });
    }
    // Nome e WhatsApp são o mínimo que o negócio precisa: sem nome não dá para
    // atender, sem número não dá para avisar. A conferência vive aqui também
    // porque validação de front se contorna.
    //
    // **O nascimento saiu daqui em 2026-11-13** (ROADMAP, Bloco 4c): três
    // listas no meio do agendamento custam agendamento, e a data só serve para
    // uma mensagem por ano — ela é perguntada depois, com o horário já
    // confirmado. Quem manda a data continua tendo ela gravada: o painel manda,
    // e a rota do aniversário também.
    if (b.nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(b.nascimento)) {
      return res.status(400).json({ erro: 'data de nascimento inválida' });
    }
    if (b.nascimento && b.nascimento > hoje()) {
      return res.status(400).json({ erro: 'data de nascimento no futuro' });
    }
    const id = uid();
    // `optin_em`/`optin_origem`: o aceite (ou a recusa) de mensagens precisa de
    // data e de por onde veio — é a prova que a LGPD pede, e a recusa também é
    // fato com data.
    // Número que ninguém tinha: aqui o vínculo é seguro — não há ficha de
    // outra pessoa para invadir, porque não havia ficha.
    await db.run(
      `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,optin_em,optin_origem,criado_em,
                            google_sub,email)
       VALUES (?,?,?,?,?,?,?,?,'site',?,?,?)`,
      id, b.nome.trim(), fone, b.nascimento || null, b.endereco || '', '',
      b.aceitaMensagens === false ? 0 : 1, hoje(), hoje(),
      quem?.sub || null, quem?.email || ''
    );
    cliente = await db.get('SELECT * FROM clients WHERE id=?', id);
    // Ficha que nasce neste agendamento é dela por construção: não havia nada
    // de ninguém ali para invadir.
    provou = true;
  }

  // Recado da cliente ("prefiro tons nude", "sou alérgica a acetona"). Texto
  // livre vindo da internet: corta no limite em vez de recusar, porque
  // devolver erro por causa de um recado longo perderia o agendamento inteiro.
  const obs = String(b.obs || '').trim().slice(0, 500);

  const dados = {
    clienteId: cliente.id, profissionalId: b.profissionalId,
    data: b.data, hora: b.hora, obs,
    pagamento: { status: 'aberto', forma: b.formaPagamento || 'local' },
  };

  // Combo vira vários agendamentos em sequência, não um só. O resto da resposta
  // é igual, para o site não ter dois caminhos de confirmação.
  //
  // Quem marca é a cliente, mesmo que o navegador tenha um login do painel
  // aberto: o histórico (migration 031) precisa separar o que ela escolheu do
  // que a equipe encaixou.
  const r = await db.comAutoria({ tipo: 'cliente', origem: 'site' }, () => b.comboId
    ? criarCombo({ ...dados, comboId: b.comboId }, { origem: 'site' })
    : criarAgendamento(
        // Sem `respostas`: a anamnese não é perguntada aqui, e mandar o campo
        // adiante deixaria a porta entreaberta para o site voltar a coletá-la.
        // `criarAgendamento` também ignora, pela origem — são duas guardas.
        { ...dados, servicoId: b.servicoId, adicionaisIds: b.adicionaisIds },
        { origem: 'site' }
      ));
  if (r.erro) return res.status(r.codigo).json({ erro: r.erro });

  // O quarto passo do funil é gravado AQUI, e não pelo navegador: é o único
  // com consequência — o que separa "quase marcou" de "marcou" — e front não é
  // fonte confiável para isso. O id do agendamento vai junto porque é o fio
  // que liga esta sessão ao comparecimento, lá na frente.
  const primeiro = r.agendamento || r.agendamentos?.[0];
  await marcar({ sessao: b.sessao, etapa: 'confirmou', appointmentId: primeiro?.id });

  res.status(201).json({
    agendamento: r.agendamento || r.agendamentos[0],
    agendamentos: r.agendamentos,
    combo: r.combo,
    // Só o primeiro nome, e só para quem provou ser a dona da ficha (decisão
    // do dono, 2026-11-14). Para quem apenas digitou um telefone que já tem
    // cadastro, a saudação sai sem nome: devolvê-lo seria a varredura que a
    // etapa 2 fechou no `/identificar`, aqui ao preço de ocupar um horário.
    // O id da ficha também saía daqui, e id vaza em link e em histórico.
    cliente: { primeiroNome: provou ? cliente.nome.split(' ')[0] : '' },
    // O convite para informar o aniversário, ou `null`.
    aniversario: conviteDeAniversario(cliente, provou),
    // O pagamento online entra aqui: gere a cobrança no gateway e devolva a URL.
    // Veja server/src/routes/pagamentos.js (ainda não implementado).
    pagamento: b.formaPagamento === 'local' ? null : { pendente: true, url: null },
  });
}));

/* ------------------------------------------------------------------ *
 * O aniversário, perguntado depois — nunca no meio do agendamento
 * ------------------------------------------------------------------ */

/**
 * O convite que vai na tela de "horário confirmado", ou `null`.
 *
 * **Só para quem provou ser a dona da ficha** (decisão do dono, 2026-11-14,
 * depois do `revisor-isolamento`): ficha que nasceu neste agendamento — não há
 * ficha alheia para invadir — ou cliente identificada pelo Google, que provou
 * ser dona da conta ligada à ficha. Sem isso, quem digitasse o número de outra
 * pessoa (o buraco do Bloco 4b) ganhava um papel que ESCREVE na ficha dela: um
 * aniversário falso, que ninguém vê acontecer, e que impede a data verdadeira
 * de ser pedida para sempre — o convite só aparece para ficha sem data.
 *
 * O preço é que cliente antiga sem data não é perguntada pelo site. Quem
 * pergunta é a profissional, com a pessoa na cadeira, e a lista de Clientes
 * marca quem está sem (Bloco 4c, etapa 6).
 *
 * Perguntar de novo a quem já respondeu seria pedir duas vezes a mesma coisa.
 * E sem `CONEXOES_SEGREDO` não há papel: a pergunta some, porque ela é o
 * pedaço mais dispensável do fluxo e não pode derrubar o agendamento.
 */
function conviteDeAniversario(cliente, provou) {
  if (!provou || cliente.nascimento || !segredoConfigurado()) return null;
  // A empresa vai no papel e é conferida na volta: o papel é cifrado, mas o
  // endereço por onde ele volta é escolhido por quem o tem na mão.
  return { token: convidarAniversario({ c: cliente.id, t: empresaAtual() }) };
}

/** O ano que quer dizer "ela não informou". Ver `ARQUITETURA.md`. */
const SEM_ANO = '0000';

const diaExiste = (dia, mes) =>
  Number.isInteger(dia) && Number.isInteger(mes) && mes >= 1 && mes <= 12 && dia >= 1
  // Ano bissexto no teste de 29/02: quem nasceu nesse dia tem aniversário, e
  // recusar aqui seria dizer que não.
  && dia <= new Date(Date.UTC(2024, mes, 0)).getUTCDate();

/**
 * Dia e mês, vindos da tela de confirmação.
 *
 * **Sem ano, de propósito:** ninguém no sistema usa o ano do nascimento — o
 * job compara `substr(nascimento,6)`, o template corta em `slice(0,5)` e o
 * painel mostra `dd/mm`. Uma lista de cem anos para guardar o que nada lê é
 * campo a mais numa tela que a pessoa já podia ter fechado.
 *
 * **Quem autoriza é o papel cifrado**, porque o site não tem login. Ele vale
 * meia hora, é preso a esta cliente e a esta empresa, e tem chave própria —
 * um `state` de autorização do Google não abre esta porta. Cifrado, e não
 * assinado, porque papel assinado é legível por quem o carrega e este leva o
 * id da ficha.
 */
publico.post('/aniversario', LIMITES.aniversario, rota(async (req, res) => {
  const b = req.body || {};
  // Sem segredo não há papel para conferir, e `conferirAniversario` levantaria
  // 503 — que vira 500 com pilha no log a cada pedido de quem insistir.
  // Papel que não vale é 401, tenha ele vindo torto ou não havendo como ler.
  const papel = segredoConfigurado() ? conferirAniversario(b.token) : null;
  if (!papel?.c || papel.t !== empresaAtual()) {
    return res.status(401).json({ erro: 'este convite venceu ou não é válido' });
  }
  const dia = Number(b.dia);
  const mes = Number(b.mes);
  if (!diaExiste(dia, mes)) return res.status(400).json({ erro: 'escolha o dia e o mês' });

  const p2 = n => String(n).padStart(2, '0');
  // `AND nascimento IS NULL` é a regra, não uma conferência antes: entre ler e
  // gravar cabe outra gravação, e o que não pode acontecer é a resposta de
  // hoje apagar a data que a profissional conferiu com a cliente na cadeira.
  // O RLS cuida da empresa — por isso não há `tenant_id` aqui.
  await db.run(
    `UPDATE clients SET nascimento = ? WHERE id = ? AND nascimento IS NULL`,
    `${SEM_ANO}-${p2(mes)}-${p2(dia)}`, papel.c
  );
  // Sempre a mesma resposta: dizer "já tinha data" contaria algo da ficha a
  // quem só tem um papel na mão.
  res.json({ ok: true });
}));
