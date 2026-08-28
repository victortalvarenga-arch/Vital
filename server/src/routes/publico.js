import { Router } from 'express';
import { db, uid, listarServicos, staffOut, getConfig, listarUnidades } from '../db.js';
import { hoje, soDigitos } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { criarAgendamento, criarCombo } from './agendamentos.js';
import { horariosLivres, horariosPorServico, horariosPorEquipe, diasComVaga, diasComVagaPara } from '../lib/availability.js';
import { adicionaisDe, validarAdicionais } from '../lib/adicionais.js';
import { combosAtivos, comboCompleto, profissionaisDoCombo } from '../lib/combos.js';

export const publico = Router();

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
 * Em sequência, e não em Promise.all: a requisição roda numa conexão só, que
 * atende uma consulta por vez — o paralelismo era aparente.
 */
async function comPrecoEExtras(servicos, cfg) {
  const saida = [];
  for (const s of servicos) {
    saida.push({
      ...s,
      preco: cfg.exibir?.preco && s.mostrarPreco ? s.preco : null,
      adicionais: await adicionaisDe(s.id, s.categoria),
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
async function vitrineDeCombos(cfg) {
  const lista = await combosAtivos();
  const saida = [];
  for (const c of lista) {
    saida.push({
      id: c.id, nome: c.nome, descricao: c.descricao, foto: c.foto,
      preco: c.preco, precoCheio: c.precoCheio, economia: c.economia,
      duracao: c.duracao, validoAte: c.validoAte,
      servicos: c.servicos.map(s => ({ id: s.id, nome: s.nome, preco: s.preco })),
      // Quem faz o pacote inteiro. O site precisa da lista para saber se há
      // escolha de profissional a oferecer — e para não oferecer quem não faz.
      profissionais: await profissionaisDoCombo(c.id),
    });
  }
  return saida;
}

publico.get('/vitrine', rota(async (req, res) => {
  const cfg = await getConfig();
  const equipe = await db.all('SELECT * FROM staff WHERE ativo=1 ORDER BY nome');
  const servicos = await listarServicos({ somenteAtivos: true });

  res.json({
    negocio: {
      nome: cfg.nome,
      slogan: cfg.slogan,
      sobre: cfg.sobre,
      endereco: cfg.endereco,
      mapa: cfg.mapa,
      fone: cfg.fone,
      whatsapp: cfg.whatsapp || cfg.fone,
      instagram: cfg.instagram,
      janelaDias: cfg.janelaDias || 30,
      formasPagamento: cfg.formasPagamento || [],
    },
    marca: cfg.marca,
    textos: cfg.textos,
    exibir: cfg.exibir,
    vocabulario: cfg.vocabulario,
    unidades: await listarUnidades({ somenteAtivas: true }),
    // Preço só sai se a empresa quiser mostrar — algumas preferem "sob consulta".
    servicos: await comPrecoEExtras(servicos, cfg),
    // Promoção vencida não sai da vitrine: `combosAtivos` já a esconde.
    combos: await vitrineDeCombos(cfg),
    profissionais: equipe.map(staffOut)
      .map(p => ({ id: p.id, nome: p.nome, funcao: p.funcao, cor: p.cor })),
  });
}));

/**
 * Horários livres, calculados pelo servidor.
 *
 * O front tem uma noção de jornada só para desenhar a grade, mas quem sabe o
 * que está ocupado é o banco. Sem esta rota o site mostraria horário já
 * vendido e a cliente só descobriria ao tentar confirmar.
 */
publico.get('/horarios', rota(async (req, res) => {
  const { servicoId, profissionalId, data } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) {
    return res.status(400).json({ erro: 'informe data=YYYY-MM-DD' });
  }
  // Combo ocupa a cadeira pelo pacote inteiro e só quem faz todos os serviços
  // aparece — a mesma pessoa atende do começo ao fim.
  if (req.query.comboId) {
    const combo = await comboCompleto(req.query.comboId);
    if (!combo || !combo.ativo || combo.vencido) {
      return res.status(404).json({ erro: 'promoção não encontrada' });
    }
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

/** 'a,b,c' → ['a','b','c']. Vem da query string, então tudo é texto. */
const listaDeIds = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);

/**
 * Quais dias do mês têm vaga — o calendário usa para saber o que pintar.
 *
 * Separado de `/horarios` de propósito: o calendário precisa de trinta dias de
 * uma vez, e a lista de horas precisa de um dia só. Misturar os dois numa rota
 * faria o desenho do mês carregar horário que ninguém pediu.
 */
publico.get('/dias-livres', rota(async (req, res) => {
  const { servicoId, profissionalId, mes } = req.query;
  if (!/^\d{4}-\d{2}$/.test(mes || '')) {
    return res.status(400).json({ erro: 'informe mes=YYYY-MM' });
  }
  if (req.query.comboId) {
    const combo = await comboCompleto(req.query.comboId);
    if (!combo || !combo.ativo || combo.vencido) {
      return res.status(404).json({ erro: 'promoção não encontrada' });
    }
    const ids = await profissionaisDoCombo(combo.id);
    const equipe = ids.length
      ? await db.all(`SELECT * FROM staff WHERE id = ANY(?) AND ativo = 1`, ids)
      : [];
    return res.json({ mes, dias: await diasComVagaPara({ equipe, mes, duracao: combo.duracao }) });
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
 * Identificação por WhatsApp. É o "primeiro acesso" do fluxo:
 * se o número já existe, a cliente não preenche nada de novo.
 *
 * Devolve só nome e primeiro acesso — nunca endereço ou histórico,
 * porque qualquer pessoa pode digitar um número aqui.
 */
publico.post('/identificar', rota(async (req, res) => {
  const fone = soDigitos(req.body?.fone);
  if (fone.length < 10) return res.status(400).json({ erro: 'informe o WhatsApp com DDD' });
  const c = await db.get('SELECT * FROM clients WHERE fone=?', fone);
  if (!c) return res.json({ cadastrada: false });
  res.json({ cadastrada: true, id: c.id, primeiroNome: c.nome.split(' ')[0] });
}));

/**
 * Agendamento pelo site. Cria a cliente se for primeiro acesso.
 * Ignora o preço vindo do cliente de propósito: quem manda é o banco.
 */
publico.post('/agendar', rota(async (req, res) => {
  const b = req.body || {};
  const fone = soDigitos(b.fone);
  if (fone.length < 10) return res.status(400).json({ erro: 'WhatsApp inválido' });

  let cliente = await db.get('SELECT * FROM clients WHERE fone=?', fone);

  if (!cliente) {
    if (!b.nome || b.nome.trim().length < 3) {
      return res.status(400).json({ erro: 'primeiro acesso: informe o nome completo' });
    }
    // Nome, WhatsApp e nascimento são o mínimo que o negócio precisa: sem nome
    // não dá para atender, sem nascimento não existe mensagem de aniversário.
    // A conferência vive aqui também porque validação de front se contorna.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.nascimento || '')) {
      return res.status(400).json({ erro: 'primeiro acesso: informe a data de nascimento' });
    }
    if (b.nascimento > hoje()) {
      return res.status(400).json({ erro: 'data de nascimento no futuro' });
    }
    const id = uid();
    await db.run(
      `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,criado_em) VALUES (?,?,?,?,?,?,?,?)`,
      id, b.nome.trim(), fone, b.nascimento || null, b.endereco || '', '',
      b.aceitaMensagens === false ? 0 : 1, hoje()
    );
    cliente = await db.get('SELECT * FROM clients WHERE id=?', id);
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
  const r = b.comboId
    ? await criarCombo({ ...dados, comboId: b.comboId }, { origem: 'site' })
    : await criarAgendamento({ ...dados, servicoId: b.servicoId, adicionaisIds: b.adicionaisIds }, { origem: 'site' });
  if (r.erro) return res.status(r.codigo).json({ erro: r.erro });

  res.status(201).json({
    agendamento: r.agendamento || r.agendamentos[0],
    agendamentos: r.agendamentos,
    combo: r.combo,
    cliente: { id: cliente.id, primeiroNome: cliente.nome.split(' ')[0] },
    // O pagamento online entra aqui: gere a cobrança no gateway e devolva a URL.
    // Veja server/src/routes/pagamentos.js (ainda não implementado).
    pagamento: b.formaPagamento === 'local' ? null : { pendente: true, url: null },
  });
}));
