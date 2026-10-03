import { Router } from 'express';
import { db, uid, staffOut, serviceOut, unitOut, listarServicos, listarUnidades, salvarVinculos, comissaoValida, getConfig, setConfig } from '../db.js';
import { hoje, soDigitos } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { adicionaisDe } from '../lib/adicionais.js';
import { comboCompleto, combosAtivos, economiaDe, profissionaisDoCombo } from '../lib/combos.js';
import { exige, pode, escopoDe } from '../lib/auth.js';
import { mudancas } from '../lib/registro.js';
import { formCompleto, formsDoServico, ultimaResposta, TIPOS_DE_CAMPO } from '../lib/formularios.js';

export const catalogo = Router();

/* ── Configuração do negócio ── */
catalogo.get('/config', rota(async (req, res) => res.json(await getConfig())));
catalogo.put('/config', exige('site'), rota(async (req, res) => {
  const salva = await setConfig(req.body || {});
  // Só as seções tocadas: a config inteira no registro seria ilegível, e o que
  // se quer saber é "quem mexeu na marca do site na terça".
  await req.registrar('config.alterada', {
    alvoId: 'config',
    resumo: `mudou a configuração (${Object.keys(req.body || {}).join(', ') || 'nada'})`,
    detalhe: { secoes: Object.keys(req.body || {}) },
  });
  res.json(salva);
}));

/* ── Serviços ── */

/**
 * As comissões do corpo do pedido, já conferidas — ou o erro, para a rota
 * responder 400 antes de gravar qualquer coisa. Conferir no meio do caminho
 * deixaria o serviço salvo e os vínculos pela metade.
 */
function comissoesDoPedido(b) {
  try {
    const comissoes = b.comissoes === undefined ? undefined
      : Object.fromEntries(Object.entries(b.comissoes || {}).map(([k, v]) => [k, comissaoValida(v)]));
    return { comissao: comissaoValida(b.comissao), comissoes };
  } catch (e) {
    return { erro: e.message };
  }
}
catalogo.get('/servicos', rota(async (req, res) =>
  res.json(await listarServicos({ somenteAtivos: req.query.ativos === '1' }))));

catalogo.post('/servicos', exige('cadastros'), rota(async (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  const c = comissoesDoPedido(b);
  if (c.erro) return res.status(400).json({ erro: c.erro });
  const id = uid();
  await db.run(
    `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem,
                           foto,mostrar_preco,somente_adicional,comissao,obs)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, b.nome, b.categoria || 'Geral', b.descricao || '', +b.preco || 0,
    +b.duracao || 60, +b.intervalo || 0, b.ativo === false ? 0 : 1, +b.ordem || 0,
    b.foto || '', b.mostrarPreco === false ? 0 : 1, b.somenteAdicional ? 1 : 0,
    c.comissao, String(b.obs || '').slice(0, 1000)
  );
  await salvarVinculos(id, b.profissionais, c.comissoes);
  await req.registrar('servico.criado', { alvoId: id, resumo: `criou o serviço ${b.nome}` });
  const servicos = await listarServicos();
  res.status(201).json(servicos.find(s => s.id === id));
}));

catalogo.put('/servicos/:id', exige('cadastros'), rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM services WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'serviço não encontrado' });
  const b = { ...serviceOut(atual), ...req.body };
  const c = comissoesDoPedido(b);
  if (c.erro) return res.status(400).json({ erro: c.erro });
  await db.run(
    `UPDATE services SET nome=?, categoria=?, descricao=?, preco=?, duracao=?,
            intervalo=?, ativo=?, ordem=?, foto=?, mostrar_preco=?, somente_adicional=?,
            comissao=?, obs=?
      WHERE id=?`,
    b.nome, b.categoria, b.descricao, +b.preco, +b.duracao, +b.intervalo || 0,
    b.ativo ? 1 : 0, +b.ordem || 0, b.foto || '', b.mostrarPreco === false ? 0 : 1,
    b.somenteAdicional ? 1 : 0, c.comissao, String(b.obs || '').slice(0, 1000),
    req.params.id
  );
  if (req.body.profissionais) {
    await salvarVinculos(req.params.id, req.body.profissionais, req.body.comissoes === undefined ? undefined : c.comissoes);
  }
  const servicos = await listarServicos();
  const depois = servicos.find(s => s.id === req.params.id);

  const mudou = mudancas(serviceOut(atual), depois,
    ['nome', 'preco', 'duracao', 'intervalo', 'categoria', 'ativo', 'somenteAdicional', 'comissao']);
  if (Object.keys(mudou).length) {
    // Preço no meio de propósito: mudança de tabela é a que mais gera pergunta
    // depois, e a que ninguém lembra de ter feito.
    await req.registrar('servico.alterado', {
      alvoId: req.params.id,
      resumo: `editou ${depois.nome} (${Object.keys(mudou).join(', ')})`,
      detalhe: mudou,
    });
  }
  res.json(depois);
}));

catalogo.delete('/servicos/:id', exige('cadastros'), rota(async (req, res) => {
  const alvo = await db.get('SELECT nome FROM services WHERE id=?', req.params.id);
  const { n: usos } = await db.get('SELECT COUNT(*) n FROM appointments WHERE service_id=?', req.params.id);
  if (usos > 0) {
    // Não apaga histórico: só some do site. Relatório do mês passado precisa do nome.
    await db.run('UPDATE services SET ativo=0 WHERE id=?', req.params.id);
    await req.registrar('servico.arquivado', {
      alvoId: req.params.id, resumo: `arquivou o serviço ${alvo?.nome || ''}`, detalhe: { usos },
    });
    return res.json({ ok: true, arquivado: true, motivo: `${usos} agendamentos usam este serviço` });
  }
  await db.run('DELETE FROM services WHERE id=?', req.params.id);
  await req.registrar('servico.apagado', {
    alvoId: req.params.id, resumo: `apagou o serviço ${alvo?.nome || ''}`,
  });
  res.json({ ok: true });
}));

/* ── Serviços adicionais ── */

/**
 * O que a empresa cadastrou de extras.
 *
 * Duas listas separadas, e não a união: aqui a empresa está EDITANDO as regras,
 * e precisa ver de onde cada oferta vem para saber onde mexer. A união só
 * interessa ao site, na hora de oferecer.
 */
catalogo.get('/adicionais', rota(async (req, res) => {
  const porServico = await db.all('SELECT service_id, addon_id FROM service_addons');
  const porCategoria = await db.all('SELECT categoria, addon_id FROM category_addons');
  res.json({
    porServico: agrupar(porServico, 'service_id', 'addon_id'),
    porCategoria: agrupar(porCategoria, 'categoria', 'addon_id'),
  });
}));

/** Substitui os extras de um serviço pela lista enviada. */
catalogo.put('/adicionais/servico/:id', exige('cadastros'), rota(async (req, res) => {
  const svc = await db.get('SELECT id FROM services WHERE id=?', req.params.id);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });

  const ids = [...new Set(req.body?.adicionais || [])].filter(i => i && i !== req.params.id);
  await db.transacao(async tx => {
    await tx.run('DELETE FROM service_addons WHERE service_id=?', req.params.id);
    for (const addon of ids) {
      await tx.run(
        'INSERT INTO service_addons (service_id, addon_id) VALUES (?,?) ON CONFLICT DO NOTHING',
        req.params.id, addon
      );
    }
  });
  res.json({ servicoId: req.params.id, adicionais: ids });
}));

/** Substitui os extras de uma categoria inteira. */
catalogo.put('/adicionais/categoria/:nome', exige('cadastros'), rota(async (req, res) => {
  const categoria = req.params.nome;
  const ids = [...new Set(req.body?.adicionais || [])].filter(Boolean);
  await db.transacao(async tx => {
    await tx.run('DELETE FROM category_addons WHERE categoria=?', categoria);
    for (const addon of ids) {
      await tx.run(
        'INSERT INTO category_addons (categoria, addon_id) VALUES (?,?) ON CONFLICT DO NOTHING',
        categoria, addon
      );
    }
  });
  res.json({ categoria, adicionais: ids });
}));

/**
 * Em quais categorias este serviço é oferecido como extra.
 *
 * É a mesma tabela da rota acima, editada pelo outro lado. As duas direções
 * existem porque a empresa pensa das duas formas: "na limpeza de pele, ofereça
 * buço" quando está montando o serviço principal, e "ofereça buço em toda a
 * Facial" quando está cadastrando o próprio buço.
 */
catalogo.put('/adicionais/addon/:id/categorias', exige('cadastros'), rota(async (req, res) => {
  const svc = await db.get('SELECT id FROM services WHERE id=?', req.params.id);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });

  const categorias = [...new Set(req.body?.categorias || [])].filter(Boolean);
  await db.transacao(async tx => {
    // Apaga só as linhas DESTE extra: outras ofertas da mesma categoria,
    // cadastradas pelo lado do serviço principal, não podem ser perdidas.
    await tx.run('DELETE FROM category_addons WHERE addon_id=?', req.params.id);
    for (const cat of categorias) {
      await tx.run(
        'INSERT INTO category_addons (categoria, addon_id) VALUES (?,?) ON CONFLICT DO NOTHING',
        cat, req.params.id
      );
    }
  });
  res.json({ addonId: req.params.id, categorias });
}));

/** O que o site vai oferecer para um serviço: a união das duas regras. */
catalogo.get('/adicionais/oferta/:id', rota(async (req, res) => {
  const svc = await db.get('SELECT id, categoria FROM services WHERE id=?', req.params.id);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });
  res.json({ adicionais: await adicionaisDe(svc.id, svc.categoria) });
}));

function agrupar(linhas, chave, valor) {
  const mapa = {};
  for (const l of linhas) (mapa[l[chave]] ||= []).push(l[valor]);
  return mapa;
}

/* ── Equipe ── */
catalogo.get('/profissionais', rota(async (req, res) => {
  const rows = await db.all(
    `SELECT * FROM staff ${req.query.ativos === '1' ? 'WHERE ativo=1' : ''} ORDER BY nome`
  );
  res.json(rows.map(staffOut));
}));

/**
 * A comissão padrão da pessoa: percentual (0 a 100) ou valor fixo por
 * atendimento (migration 022). Devolve o que gravar, ou o erro — conferido
 * antes de qualquer escrita.
 */
function comissaoPadrao(b) {
  const tipo = b.comissaoTipo === 'fixo' ? 'fixo' : 'percentual';
  const pct = Number(b.comissao) || 0;
  if (pct < 0 || pct > 100) return { erro: 'comissão precisa ser um percentual de 0 a 100' };
  let fixo = null;
  if (tipo === 'fixo') {
    // Vazio não é zero: Number('') daria R$ 0 e a pessoa ficaria sem comissão
    // sem ninguém ter decidido isso.
    fixo = b.comissaoFixo === '' || b.comissaoFixo == null ? NaN : Number(b.comissaoFixo);
    if (!Number.isFinite(fixo) || fixo < 0) return { erro: 'informe o valor fixo da comissão' };
    fixo = Math.round(fixo * 100) / 100;
  }
  return { tipo, pct, fixo };
}

catalogo.post('/profissionais', exige('equipe'), rota(async (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  const c = comissaoPadrao(b);
  if (c.erro) return res.status(400).json({ erro: c.erro });
  const id = uid();
  await db.run(
    `INSERT INTO staff (id,nome,funcao,fone,cor,comissao,jornada,unit_id,ativo,criado_em,
                        comissao_tipo,comissao_fixo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, b.nome, b.funcao || '', soDigitos(b.fone), b.cor || '#A32A4E',
    c.pct, JSON.stringify(b.jornada || {}),
    await unidadeValida(b.unidadeId), b.ativo === false ? 0 : 1, hoje(),
    c.tipo, c.fixo
  );
  res.status(201).json(staffOut(await db.get('SELECT * FROM staff WHERE id=?', id)));
}));

catalogo.put('/profissionais/:id', exige('equipe'), rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM staff WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'profissional não encontrada' });
  const b = { ...staffOut(atual), ...req.body };
  const c = comissaoPadrao(b);
  if (c.erro) return res.status(400).json({ erro: c.erro });
  await db.run(
    `UPDATE staff SET nome=?, funcao=?, fone=?, cor=?, comissao=?, jornada=?, unit_id=?, ativo=?,
                     comissao_tipo=?, comissao_fixo=?
      WHERE id=?`,
    b.nome, b.funcao, soDigitos(b.fone), b.cor, c.pct,
    JSON.stringify(b.jornada || {}), await unidadeValida(b.unidadeId),
    b.ativo ? 1 : 0, c.tipo, c.fixo, req.params.id
  );
  res.json(staffOut(await db.get('SELECT * FROM staff WHERE id=?', req.params.id)));
}));

/**
 * As exceções de comissão de uma pessoa, serviço a serviço — o outro lado do
 * que a tela de Serviços edita. `{ comissoes: { [servicoId]: 50 | null } }`;
 * nulo apaga a exceção e volta a valer a do serviço (ou a dela).
 *
 * Só mexe em vínculo que já existe: dar comissão num serviço que ela não faz
 * não a habilita a fazê-lo — isso é decisão da tela de Serviços.
 */
catalogo.put('/profissionais/:id/comissoes', exige('equipe'), rota(async (req, res) => {
  const alvo = await db.get('SELECT id, nome FROM staff WHERE id=?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'profissional não encontrada' });
  let pedidas;
  try {
    pedidas = Object.entries(req.body?.comissoes || {}).map(([sid, v]) => [sid, comissaoValida(v)]);
  } catch (e) {
    return res.status(400).json({ erro: e.message });
  }
  let alteradas = 0;
  for (const [sid, v] of pedidas) {
    alteradas += await db.run(
      'UPDATE service_staff SET comissao=? WHERE staff_id=? AND service_id=?', v, req.params.id, sid
    );
  }
  if (alteradas) {
    await req.registrar('profissional.comissoes', {
      alvoId: req.params.id, resumo: `ajustou a comissão de ${alvo.nome} por serviço`,
      detalhe: Object.fromEntries(pedidas),
    });
  }
  res.json({ ok: true, alteradas });
}));

/**
 * Quais serviços ela faz, e a exceção de comissão em cada um — pelo lado da
 * pessoa, o mesmo vínculo que a tela de Serviços edita pelo lado do serviço.
 *
 * `{ servicos: [ids], comissoes: { [servicoId]: 50 | null } }`. Liga o que
 * entrou, desliga o que saiu e acerta a exceção de quem ficou. Serviço que não
 * está na lista perde o vínculo junto com a exceção — voltar a marcar começa
 * da comissão padrão, como na tela de Serviços.
 */
catalogo.put('/profissionais/:id/servicos', exige('equipe'), rota(async (req, res) => {
  const alvo = await db.get('SELECT id, nome FROM staff WHERE id=?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'profissional não encontrada' });

  const pedidos = [...new Set((req.body?.servicos || []).filter(Boolean))];
  let comissoes;
  try {
    comissoes = Object.fromEntries(Object.entries(req.body?.comissoes || {})
      .map(([sid, v]) => [sid, comissaoValida(v)]));
  } catch (e) {
    return res.status(400).json({ erro: e.message });
  }
  const existentes = pedidos.length
    ? await db.all('SELECT id FROM services WHERE id = ANY(?)', pedidos)
    : [];
  if (existentes.length !== pedidos.length) return res.status(400).json({ erro: 'algum serviço não existe' });

  const atuais = (await db.all('SELECT service_id FROM service_staff WHERE staff_id = ?', req.params.id))
    .map(v => v.service_id);
  for (const sid of atuais.filter(x => !pedidos.includes(x))) {
    await db.run('DELETE FROM service_staff WHERE staff_id = ? AND service_id = ?', req.params.id, sid);
  }
  for (const sid of pedidos) {
    await db.run(
      `INSERT INTO service_staff (service_id, staff_id, comissao) VALUES (?,?,?)
       ON CONFLICT (service_id, staff_id) DO UPDATE SET comissao = EXCLUDED.comissao`,
      sid, req.params.id, comissoes[sid] ?? null
    );
  }
  await req.registrar('profissional.servicos', {
    alvoId: req.params.id,
    resumo: `ajustou os serviços de ${alvo.nome}`,
    detalhe: { servicos: pedidos.length, saiu: atuais.filter(x => !pedidos.includes(x)).length },
  });
  res.json({ ok: true });
}));

catalogo.delete('/profissionais/:id', exige('equipe'), rota(async (req, res) => {
  const alvo = await db.get('SELECT nome FROM staff WHERE id=?', req.params.id);
  const { n: usos } = await db.get('SELECT COUNT(*) n FROM appointments WHERE staff_id=?', req.params.id);
  if (usos > 0) {
    await db.run('UPDATE staff SET ativo=0 WHERE id=?', req.params.id);
    await req.registrar('profissional.arquivada', {
      alvoId: req.params.id, resumo: `arquivou ${alvo?.nome || ''}`, detalhe: { usos },
    });
    return res.json({ ok: true, arquivado: true, motivo: `${usos} agendamentos no histórico` });
  }
  await db.run('DELETE FROM staff WHERE id=?', req.params.id);
  await req.registrar('profissional.apagada', {
    alvoId: req.params.id, resumo: `apagou ${alvo?.nome || ''} da equipe`,
  });
  res.json({ ok: true });
}));

/* ── combos e promoções ──────────────────────────────────────────────────── *
 *
 * Sem `exige()`: quem atende também cria promoção. Foi decisão do negócio —
 * é a pessoa no balcão que sabe qual serviço está parado e vale empurrar junto,
 * e esperar o dono aprovar mataria a ideia antes de ela virar venda.
 *
 * Combo não é agenda nem dinheiro de ninguém em particular, então não passa por
 * `escopoDe`: é catálogo, e catálogo é da empresa inteira.
 */

/** Confere o pacote e devolve a lista de serviços já lida do banco. */
async function conferirCombo(b) {
  const nome = String(b.nome || '').trim();
  if (nome.length < 2) return { erro: 'informe o nome da promoção' };

  const ids = [...new Set((b.servicosIds || []).filter(Boolean))];
  // Pacote de um item só é o serviço avulso com outro nome — e faria a tela
  // prometer uma economia que não existe.
  if (ids.length < 2) return { erro: 'um combo precisa de ao menos dois serviços' };

  const servicos = await db.all(
    `SELECT id, nome, preco FROM services WHERE id = ANY(?) AND ativo = 1`, ids
  );
  if (servicos.length !== ids.length) return { erro: 'algum serviço do combo não existe ou está arquivado' };

  const preco = Number(b.preco);
  if (!(preco >= 0)) return { erro: 'informe o preço do pacote' };

  // Combo que custa o mesmo ou mais que a soma não é promoção: é a tabela de
  // preços com um nome novo, e o selo de vantagem estaria mentindo.
  if (economiaDe(servicos, preco) <= 0) {
    const cheio = servicos.reduce((n, s) => n + Number(s.preco), 0);
    return { erro: `o pacote precisa custar menos que os serviços avulsos (R$ ${cheio.toFixed(2)})` };
  }

  const DATA = /^\d{4}-\d{2}-\d{2}$/;
  if (b.validoAte && !DATA.test(b.validoAte)) return { erro: 'data final inválida (use YYYY-MM-DD)' };
  if (b.validoDe && !DATA.test(b.validoDe)) return { erro: 'data inicial inválida (use YYYY-MM-DD)' };
  if (b.validoDe && b.validoAte && b.validoAte < b.validoDe) {
    return { erro: 'a promoção termina antes de começar' };
  }

  // Todos os dias marcados é o mesmo que nenhum: guarda nulo, para "todo dia"
  // ter um jeito só de ser escrito.
  const dias = [...new Set((b.diasSemana || []).map(Number))].sort();
  if (dias.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return { erro: 'dia da semana inválido' };
  const diasSemana = dias.length && dias.length < 7 ? dias : null;

  let limiteUsos = null;
  if (b.limiteUsos !== null && b.limiteUsos !== undefined && b.limiteUsos !== '') {
    limiteUsos = Number(b.limiteUsos);
    if (!Number.isInteger(limiteUsos) || limiteUsos < 1) return { erro: 'o limite precisa ser um número inteiro a partir de 1' };
  }
  return { nome, ids, preco, diasSemana, limiteUsos };
}

/** Reescreve a lista de serviços do combo. A ordem é a do atendimento. */
async function salvarServicosDoCombo(comboId, ids) {
  await db.run('DELETE FROM combo_services WHERE combo_id = ?', comboId);
  for (const [i, id] of ids.entries()) {
    await db.run(
      'INSERT INTO combo_services (combo_id, service_id, ordem) VALUES (?,?,?)',
      comboId, id, i
    );
  }
}

catalogo.get('/combos', rota(async (req, res) => {
  // O painel vê os vencidos também: a empresa precisa achar a promoção do ano
  // passado para reaproveitar a validade em vez de recadastrar tudo.
  // Arquivada não volta: é o "apagar" de quem já vendeu (ver migration 021).
  const linhas = await db.all('SELECT id FROM combos WHERE arquivado = 0 ORDER BY ordem, nome');
  const lista = [];
  for (const { id } of linhas) lista.push(await comboCompleto(id));
  res.json(lista);
}));

catalogo.post('/combos', rota(async (req, res) => {
  const b = req.body || {};
  const conf = await conferirCombo(b);
  if (conf.erro) return res.status(400).json({ erro: conf.erro });

  const id = uid();
  await db.run(
    `INSERT INTO combos (id,nome,descricao,preco,foto,valido_ate,ativo,ordem,criado_em,
                         valido_de,dias_semana,limite_usos)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, conf.nome, String(b.descricao || '').slice(0, 500), conf.preco,
    b.foto || '', b.validoAte || null, b.ativo === false ? 0 : 1, +b.ordem || 0, hoje(),
    b.validoDe || null, conf.diasSemana, conf.limiteUsos
  );
  await salvarServicosDoCombo(id, conf.ids);
  res.status(201).json(await comboCompleto(id));
}));

catalogo.put('/combos/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT id FROM combos WHERE id = ?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'combo não encontrado' });

  const b = req.body || {};
  const conf = await conferirCombo(b);
  if (conf.erro) return res.status(400).json({ erro: conf.erro });

  await db.run(
    `UPDATE combos SET nome=?, descricao=?, preco=?, foto=?, valido_ate=?, ativo=?, ordem=?,
                      valido_de=?, dias_semana=?, limite_usos=?
      WHERE id=?`,
    conf.nome, String(b.descricao || '').slice(0, 500), conf.preco,
    b.foto || '', b.validoAte || null, b.ativo === false ? 0 : 1, +b.ordem || 0,
    b.validoDe || null, conf.diasSemana, conf.limiteUsos,
    req.params.id
  );
  await salvarServicosDoCombo(req.params.id, conf.ids);
  res.json(await comboCompleto(req.params.id));
}));

catalogo.delete('/combos/:id', rota(async (req, res) => {
  // Os agendamentos já vendidos guardam `combo_id`; apagar a linha quebraria a
  // referência. Arquivar tira da vitrine e preserva o histórico.
  await db.run('UPDATE combos SET ativo = 0, arquivado = 1 WHERE id = ?', req.params.id);
  res.json({ ok: true, arquivado: true });
}));

/**
 * Como as promoções foram no período: vendas, quanto foi vendido e quanto saiu
 * em desconto — no total e por promoção. Datas do ATENDIMENTO, como as regras.
 *
 * Vendas contam como o limite conta (sem as canceladas). Receita e desconto
 * tiram também as faltas: dinheiro de quem não veio não entrou. O desconto é o
 * gravado na venda (`appointments.desconto`), não a tabela de hoje.
 *
 * O funcionário vê só o que ele vendeu: é dinheiro, e passa por `escopoDe`
 * como o resto dos relatórios, mesmo a tela de promoções sendo de todos.
 */
catalogo.get('/combos/desempenho', rota(async (req, res) => {
  const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : hoje().slice(0, 7) + '-01';
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : hoje();
  const so = escopoDe(req.usuario);
  const linhas = await db.all(
    `SELECT combo_id,
            COUNT(DISTINCT combo_grupo) usos,
            SUM(CASE WHEN status <> 'falta' THEN valor ELSE 0 END) receita,
            SUM(CASE WHEN status <> 'falta' THEN desconto ELSE 0 END) desconto
       FROM appointments
      WHERE combo_id IS NOT NULL AND status <> 'cancelado' AND data >= ? AND data <= ?
        ${so ? 'AND staff_id = ?' : ''}
      GROUP BY combo_id`,
    de, ate, ...(so ? [so] : [])
  );
  const porCombo = Object.fromEntries(linhas.map(l => [l.combo_id, {
    usos: Number(l.usos) || 0, receita: Number(l.receita) || 0, desconto: Number(l.desconto) || 0,
  }]));
  const soma = k => Math.round(linhas.reduce((n, l) => n + (Number(l[k]) || 0) * 100, 0)) / 100;
  res.json({
    de, ate, somenteMeu: Boolean(so), porCombo,
    total: { usos: linhas.reduce((n, l) => n + (Number(l.usos) || 0), 0), receita: soma('receita'), desconto: soma('desconto') },
  });
}));

/** Quem faz o combo inteiro — o site precisa saber para oferecer a escolha. */
catalogo.get('/combos/:id/profissionais', rota(async (req, res) => {
  res.json(await profissionaisDoCombo(req.params.id));
}));

/* ── unidades ────────────────────────────────────────────────────────────── *
 *
 * A tabela existe desde o Bloco 0 e nada a usava: uma empresa com duas lojas
 * conseguia cadastrá-las por SQL e mais nada.
 *
 * **A unidade é da profissional, não do serviço.** É ela que ocupa uma cadeira
 * num endereço, e o motor de horários já raciocina por profissional — então
 * filtrar por unidade é filtrar quem atende, e o motor não muda uma linha. Um
 * serviço é oferecido onde houver alguém que o faça.
 *
 * `unit_id` nulo quer dizer "atende em qualquer unidade", e é o estado de toda
 * profissional que já existia. Sem isso, ligar unidades sumiria com a equipe
 * inteira das telas de quem já usa o sistema.
 */

/** Confere que a unidade existe nesta empresa. Vazio vira nulo, não erro. */
async function unidadeValida(id) {
  if (!id) return null;
  const u = await db.get('SELECT id FROM units WHERE id = ?', id);
  return u ? u.id : null;
}

catalogo.get('/unidades', rota(async (req, res) =>
  res.json(await listarUnidades({ somenteAtivas: req.query.ativas === '1' }))));

catalogo.post('/unidades', exige('cadastros'), rota(async (req, res) => {
  const erro = confere(req.body || {});
  if (erro) return res.status(400).json({ erro });

  const b = req.body;
  const id = uid();
  await db.run(
    `INSERT INTO units (id,nome,endereco,fone,mapa,jornada,ordem,ativo,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, b.nome.trim(), b.endereco || '', soDigitos(b.fone), b.mapa || '',
    JSON.stringify(b.jornada || {}), +b.ordem || 0, b.ativo === false ? 0 : 1, hoje()
  );
  res.status(201).json(unitOut(await db.get('SELECT * FROM units WHERE id=?', id)));
}));

catalogo.put('/unidades/:id', exige('cadastros'), rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM units WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'unidade não encontrada' });

  const b = { ...unitOut(atual), ...req.body };
  const erro = confere(b);
  if (erro) return res.status(400).json({ erro });

  await db.run(
    `UPDATE units SET nome=?, endereco=?, fone=?, mapa=?, jornada=?, ordem=?, ativo=?
      WHERE id=?`,
    b.nome.trim(), b.endereco || '', soDigitos(b.fone), b.mapa || '',
    JSON.stringify(b.jornada || {}), +b.ordem || 0, b.ativo ? 1 : 0, req.params.id
  );
  res.json(unitOut(await db.get('SELECT * FROM units WHERE id=?', req.params.id)));
}));

catalogo.delete('/unidades/:id', exige('cadastros'), rota(async (req, res) => {
  const atual = await db.get('SELECT id, nome FROM units WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'unidade não encontrada' });

  // Agendamento antigo aponta para a unidade em que aconteceu; apagar a linha
  // quebraria o histórico. Arquivar tira do site e preserva o passado — mesma
  // escolha dos serviços e dos combos.
  const equipe = await db.all('SELECT nome FROM staff WHERE unit_id = ? AND ativo = 1', req.params.id);
  await db.run('UPDATE units SET ativo = 0 WHERE id = ?', req.params.id);
  await req.registrar('unidade.arquivada', {
    alvoId: atual.id,
    resumo: `arquivou a unidade ${atual.nome}`,
    detalhe: { semUnidade: equipe.map(p => p.nome) },
  });

  res.json({
    ok: true, arquivada: true,
    // Quem ficou sem casa. Não desvinculamos sozinhos: mover a equipe de
    // endereço é decisão de quem administra, não efeito colateral de arquivar.
    semUnidade: equipe.map(p => p.nome),
  });
}));

/** Regras da unidade. Devolve a mensagem, ou nada quando está tudo certo. */
function confere(b) {
  if (String(b.nome || '').trim().length < 2) return 'informe o nome da unidade';
  if (b.mapa && !/^https?:\/\//.test(b.mapa)) return 'o link do mapa precisa começar com http';
  return null;
}

/* ── o registro do painel ────────────────────────────────────────────────── *
 *
 * Quem fez o quê, dentro da empresa. A gravação está espalhada pelas rotas que
 * mudam alguma coisa — cada uma sabe escrever a frase que uma pessoa entende —,
 * e a leitura é aqui.
 */
catalogo.get('/logs', rota(async (req, res) => {
  const cond = [], args = [];

  // Funcionário vê o próprio rastro; dono vê o de todos. Mesma regra da agenda
  // e do financeiro — e imposta aqui, não aceita do filtro que o front mandou.
  if (!pode(req.usuario.papel, 'verDeTodos')) {
    cond.push('l.user_id = ?');
    args.push(req.usuario.id);
  }
  if (req.query.alvoId) { cond.push('l.alvo_id = ?'); args.push(req.query.alvoId); }
  if (req.query.acao) { cond.push('l.acao LIKE ?'); args.push(req.query.acao + '%'); }
  if (req.query.de) { cond.push('l.criado_em >= ?'); args.push(req.query.de); }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const linhas = await db.all(
    `SELECT l.id, l.acao, l.alvo_tipo, l.alvo_id, l.resumo, l.detalhe,
            l.criado_em, l.usuario_nome
       FROM logs l ${where}
      ORDER BY l.criado_em DESC, l.id DESC LIMIT 300`,
    ...args
  );

  res.json(linhas.map(l => ({
    id: Number(l.id), acao: l.acao, alvoTipo: l.alvo_tipo, alvoId: l.alvo_id,
    resumo: l.resumo, detalhe: l.detalhe, quando: l.criado_em,
    // Congelado no momento da ação: o acesso pode ter sido apagado desde então.
    usuario: l.usuario_nome || 'alguém',
  })));
}));

/* ── formulários ─────────────────────────────────────────────────────────── *
 *
 * A empresa monta as perguntas; a cliente responde ao agendar. O porquê do
 * modelo está em `lib/formularios.js` e na migration 012.
 */

catalogo.get('/formularios', exige('cadastros'), rota(async (req, res) => {
  const linhas = await db.all('SELECT id FROM forms ORDER BY nome');
  const saida = [];
  for (const { id } of linhas) {
    const f = await formCompleto(id);
    // Em quais serviços ele é pedido — a empresa precisa ver isso na lista.
    const svc = await db.all('SELECT service_id FROM form_services WHERE form_id = ?', id);
    saida.push({ ...f, servicosIds: svc.map(s => s.service_id) });
  }
  res.json(saida);
}));

catalogo.post('/formularios', exige('cadastros'), rota(async (req, res) => {
  const b = req.body || {};
  if (String(b.nome || '').trim().length < 2) {
    return res.status(400).json({ erro: 'informe o nome do formulário' });
  }
  const id = uid();
  await db.run(
    `INSERT INTO forms (id, nome, descricao, ativo, criado_em) VALUES (?,?,?,?,?)`,
    id, b.nome.trim(), String(b.descricao || '').slice(0, 500),
    b.ativo === false ? 0 : 1, hoje()
  );
  const erro = await salvarPerguntas(id, b.campos);
  if (erro) return res.status(400).json({ erro });
  await salvarServicosDoForm(id, b.servicosIds);

  await req.registrar('formulario.criado', { alvoId: id, resumo: `criou o formulário ${b.nome.trim()}` });
  res.status(201).json(await formCompleto(id));
}));

catalogo.put('/formularios/:id', exige('cadastros'), rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM forms WHERE id = ?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'formulário não encontrado' });

  const b = { nome: atual.nome, descricao: atual.descricao, ativo: !!atual.ativo, ...req.body };
  if (String(b.nome || '').trim().length < 2) {
    return res.status(400).json({ erro: 'informe o nome do formulário' });
  }
  await db.run(
    'UPDATE forms SET nome = ?, descricao = ?, ativo = ? WHERE id = ?',
    b.nome.trim(), String(b.descricao || '').slice(0, 500), b.ativo ? 1 : 0, req.params.id
  );
  if (req.body.campos) {
    const erro = await salvarPerguntas(req.params.id, req.body.campos);
    if (erro) return res.status(400).json({ erro });
  }
  if (req.body.servicosIds) await salvarServicosDoForm(req.params.id, req.body.servicosIds);

  await req.registrar('formulario.alterado', { alvoId: req.params.id, resumo: `editou o formulário ${b.nome.trim()}` });
  res.json(await formCompleto(req.params.id));
}));

catalogo.delete('/formularios/:id', exige('cadastros'), rota(async (req, res) => {
  const alvo = await db.get('SELECT nome FROM forms WHERE id = ?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'formulário não encontrado' });

  // Arquivar, nunca apagar: as respostas já dadas apontam para ele, e elas são
  // o histórico do que a cliente declarou.
  await db.run('UPDATE forms SET ativo = 0 WHERE id = ?', req.params.id);
  await req.registrar('formulario.arquivado', { alvoId: req.params.id, resumo: `arquivou o formulário ${alvo.nome}` });
  res.json({ ok: true, arquivado: true });
}));

/**
 * Reescreve as perguntas do formulário.
 *
 * Apaga e recria em vez de casar por id: a empresa reordena e troca perguntas
 * livremente, e casar id a id daria a ilusão de que editar o rótulo corrige o
 * passado. Não corrige — a resposta guarda o rótulo do dia, congelado.
 */
async function salvarPerguntas(formId, campos) {
  if (!Array.isArray(campos)) return null;

  for (const c of campos) {
    if (String(c.rotulo || '').trim().length < 2) return 'toda pergunta precisa de um enunciado';
    if (!TIPOS_DE_CAMPO.includes(c.tipo)) return `tipo de pergunta desconhecido: ${c.tipo}`;
    if (['escolha', 'multipla'].includes(c.tipo) && !(c.opcoes || []).length) {
      return `"${c.rotulo}" precisa de ao menos uma opção`;
    }
  }

  await db.run('DELETE FROM form_fields WHERE form_id = ?', formId);
  for (const [i, c] of campos.entries()) {
    await db.run(
      `INSERT INTO form_fields (id, form_id, rotulo, ajuda, tipo, obrigatorio, opcoes, ordem)
       VALUES (?,?,?,?,?,?,?,?)`,
      uid(), formId, c.rotulo.trim(), String(c.ajuda || '').slice(0, 200), c.tipo,
      c.obrigatorio ? 1 : 0,
      JSON.stringify((c.opcoes || []).map(o => String(o).slice(0, 80))), i
    );
  }
  return null;
}

async function salvarServicosDoForm(formId, ids) {
  await db.run('DELETE FROM form_services WHERE form_id = ?', formId);
  for (const id of ids || []) {
    await db.run(
      'INSERT INTO form_services (form_id, service_id) VALUES (?,?) ON CONFLICT DO NOTHING',
      formId, id
    );
  }
}

/**
 * O que a cliente respondeu da última vez neste formulário.
 *
 * Ficha de saúde não muda a cada visita, e obrigar a redigitar tudo faz a pessoa
 * responder qualquer coisa para se livrar — que é pior do que não perguntar.
 * Vem como sugestão; o que ela confirmar é o que fica gravado hoje.
 *
 * Só no painel, onde quem marca já escolheu a cliente numa lista. No site a
 * pessoa só é identificada no fim, depois do formulário.
 */
catalogo.get('/formularios/:id/ultima/:clienteId', rota(async (req, res) => {
  res.json({ respostas: await ultimaResposta(req.params.clienteId, req.params.id) });
}));

/** Os formulários que um serviço pede — o encaixe do painel precisa perguntar também. */
catalogo.get('/formularios/servico/:id', rota(async (req, res) =>
  res.json(await formsDoServico(req.params.id))));
