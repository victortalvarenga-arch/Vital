import { Router } from 'express';
import { db, uid, apptOut, staffOut } from '../db.js';
import { hoje, agora, toMin, toHora } from '../lib/dates.js';
import { conflita, dentroDaJornada, horariosLivres, horariosPorServico } from '../lib/availability.js';
import { rota } from '../lib/rota.js';
import { escopoDe } from '../lib/auth.js';
import { mudancas } from '../lib/registro.js';
import { validarAdicionais, gravarAdicionais, comAdicionais } from '../lib/adicionais.js';
import { comboCompleto, profissionaisDoCombo, ratearCombo } from '../lib/combos.js';
import { formsDoServico, validarRespostas, gravarRespostas, respostasDoAgendamento } from '../lib/formularios.js';
import { enfileirarConfirmacao } from '../jobs/mensagens.js';

export const agendamentos = Router();

/** Só o primeiro nome, que é como o registro fica legível. */
const nomeDaCliente = async id => {
  const c = id && await db.get('SELECT nome FROM clients WHERE id=?', id);
  return c ? c.nome.split(' ')[0] : 'alguém';
};

const STATUS = ['agendado', 'confirmado', 'concluido', 'falta', 'cancelado'];
const FORMAS = ['pix', 'cartao', 'dinheiro', 'local'];

/**
 * Funcionário mexe na própria agenda e só nela; dono mexe em todas.
 *
 * A leitura já era filtrada por `escopoDe`, mas gravar não era: com o id na
 * mão — e id de agendamento circula em link de confirmação e em URL —, quem
 * atende podia remarcar ou cancelar a cliente de outra pessoa. Esconder a
 * agenda alheia da tela nunca foi controle de acesso.
 *
 * Mesma regra de `bloqueios.js`. Se algum dia existir recepcionista, o certo é
 * um papel novo com o poder `verDeTodos`, não afrouxar aqui.
 */
function podeMexer(usuario, staffId) {
  const so = escopoDe(usuario);
  return !so || staffId === so;
}

/* ── Disponibilidade ── */
/** As respostas de um agendamento. Quem atende precisa lê-las antes de começar. */
agendamentos.get('/:id/respostas', rota(async (req, res) => {
  const a = await db.get('SELECT staff_id FROM appointments WHERE id=?', req.params.id);
  if (!a) return res.status(404).json({ erro: 'agendamento não encontrado' });
  // Ficha de saúde é dado sensível: funcionário lê a de quem ele atende, e nada
  // mais. Mesma regra da agenda, e imposta aqui.
  if (!podeMexer(req.usuario, a.staff_id)) {
    return res.status(403).json({ erro: 'esta ficha não é de um atendimento seu' });
  }
  res.json(await respostasDoAgendamento(req.params.id));
}));

agendamentos.get('/horarios', rota(async (req, res) => {
  const { servicoId, profissionalId, data } = req.query;
  if (!data) return res.status(400).json({ erro: 'informe data=YYYY-MM-DD' });

  if (profissionalId && servicoId) {
    const svc = await db.get('SELECT * FROM services WHERE id=?', servicoId);
    if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });
    return res.json({
      data,
      horarios: await horariosLivres({
        staffId: profissionalId, data, duracao: svc.duracao + (svc.intervalo || 0),
      }),
    });
  }
  if (servicoId) return res.json({ data, porProfissional: await horariosPorServico({ servicoId, data }) });
  res.status(400).json({ erro: 'informe ao menos servicoId' });
}));

/* ── Listagem ── */
agendamentos.get('/', rota(async (req, res) => {
  const { data, de, ate, profissionalId, clienteId } = req.query;
  const cond = [], args = [];
  // Funcionário só enxerga a própria agenda — e o recorte é imposto aqui, não
  // aceito do filtro que o front mandou.
  const so = escopoDe(req.usuario);
  if (so) { cond.push('staff_id = ?'); args.push(so); }
  if (data) { cond.push('data = ?'); args.push(data); }
  if (de) { cond.push('data >= ?'); args.push(de); }
  if (ate) { cond.push('data <= ?'); args.push(ate); }
  if (profissionalId) { cond.push('staff_id = ?'); args.push(profissionalId); }
  if (clienteId) { cond.push('client_id = ?'); args.push(clienteId); }
  // Aceita mais de um separado por vírgula: para quem opera, "agendado" e
  // "confirmado" são o mesmo estado — alguém tem hora marcada e ainda não foi
  // atendido. A distinção existe no banco porque o WhatsApp vai usá-la; na
  // tela, seriam duas abas dizendo a mesma coisa.
  //
  // Só os status que existem passam. Sem a conferência, `?status=x` devolveria
  // lista vazia como se fosse resposta legítima.
  const pedidos = String(req.query.status || '').split(',').filter(s => STATUS.includes(s));
  if (pedidos.length) {
    cond.push(`status IN (${pedidos.map(() => '?').join(',')})`);
    args.push(...pedidos);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const rows = await db.all(`SELECT * FROM appointments ${where} ORDER BY data, hora`, ...args);
  // Sem os extras, quem atende lê "Corte" e não sabe que a cliente também
  // comprou a sobrancelha — e a duração e o valor na tela não fecham com nada.
  res.json(await comAdicionais(rows.map(apptOut)));
}));

/**
 * Cria um agendamento.
 *
 * A conferência de conflito e a gravação acontecem na MESMA transação, e não no
 * front. Duas clientes podem clicar no mesmo horário no mesmo segundo — se a
 * conferência ficasse fora da transação, as duas leriam "livre" antes de
 * qualquer uma gravar, e as duas gravariam.
 */
export async function criarAgendamento(b, { origem = 'painel', forcar = false } = {}) {
  const svc = await db.get('SELECT * FROM services WHERE id=?', b.servicoId);
  if (!svc) return { erro: 'serviço não encontrado', codigo: 404 };
  // Marcado para vender só junto de outro. A recusa vive aqui, e não só na
  // tela: id de serviço circula, e esconder da lista nunca foi controle.
  if (svc.somente_adicional) {
    return { erro: `${svc.nome} só é vendido junto de outro serviço`, codigo: 409 };
  }
  const prof = await db.get('SELECT * FROM staff WHERE id=?', b.profissionalId);
  if (!prof) return { erro: 'profissional não encontrada', codigo: 404 };
  const cli = await db.get('SELECT * FROM clients WHERE id=?', b.clienteId);
  if (!cli) return { erro: 'cliente não encontrada', codigo: 404 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '') || !/^\d{2}:\d{2}$/.test(b.hora || '')) {
    return { erro: 'data (YYYY-MM-DD) e hora (HH:MM) inválidas', codigo: 400 };
  }

  // Extras conferidos contra a oferta real; preço e duração vêm do banco.
  const extras = await validarAdicionais(svc, b.adicionaisIds);
  if (extras.erro) return extras;

  // Formulários que este serviço pede. Conferidos ANTES da transação: recusar
  // por resposta faltando não pode deixar meio agendamento gravado.
  const forms = await formsDoServico(svc.id);
  const fichas = [];
  for (const form of forms) {
    const r = validarRespostas(form, (b.respostas || {})[form.id]);
    if (r.erro) return { erro: r.erro, codigo: 400 };
    if (r.itens.length) fichas.push({ formId: form.id, itens: r.itens });
  }

  // A duração precisa somar os extras, senão a cadeira é reservada por menos
  // tempo do que o atendimento leva e a agenda estoura em cima da próxima.
  const duracao = +b.duracao || svc.duracao + (svc.intervalo || 0) + extras.duracao;
  const valor = b.valor != null ? +b.valor : Number(svc.preco) + extras.preco;

  // Encaixe manual pode furar a jornada; agendamento pelo site, não.
  if (!forcar && !dentroDaJornada(staffOut(prof), b.data, b.hora, duracao)) {
    return { erro: `${prof.nome} não trabalha nesse horário`, codigo: 409 };
  }

  const id = uid();
  const resultado = await db.transacao(async tx => {
    if (await conflita({ staffId: b.profissionalId, data: b.data, hora: b.hora, duracao }, tx)) {
      return { erro: 'esse horário acabou de ser ocupado', codigo: 409 };
    }
    await tx.run(
      `INSERT INTO appointments (id,client_id,service_id,staff_id,unit_id,data,hora,duracao,valor,
                                 status,pag_status,pag_forma,origem,obs,criado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      // A unidade vem de quem atende: é ela que ocupa a cadeira num endereço.
      // Guardar aqui congela onde aconteceu, mesmo que a pessoa mude de loja.
      id, b.clienteId, b.servicoId, b.profissionalId, prof.unit_id, b.data, b.hora, duracao,
      valor,
      b.status || 'agendado',
      b.pagamento?.status || 'aberto', b.pagamento?.forma || 'local',
      origem, b.obs || '', `${hoje()} ${agora()}`
    );
    await gravarAdicionais(tx, id, extras.itens);
    for (const f of fichas) {
      await gravarRespostas(tx, { ...f, agendamentoId: id, clienteId: b.clienteId });
    }
    return { criado: await tx.get('SELECT * FROM appointments WHERE id=?', id) };
  });

  if (resultado.erro) return resultado;

  await enfileirarConfirmacao(resultado.criado);
  return { agendamento: { ...apptOut(resultado.criado), adicionais: extras.itens } };
}

/**
 * Vende um combo: um agendamento por serviço, todos ligados pelo mesmo grupo.
 *
 * Os horários saem em sequência a partir de `hora` — a cliente faz um serviço
 * depois do outro. O preço do pacote é rateado entre eles antes de gravar, de
 * modo que `SUM(valor)` por profissional continue sendo a produção dela sem que
 * o financeiro precise saber o que é combo. Ver `lib/combos.js`.
 *
 * Tudo numa transação só: meio combo gravado é pior do que nenhum, porque a
 * cliente pagou o pacote e recebeu metade dele.
 */
export async function criarCombo(b, { origem = 'painel' } = {}) {
  const combo = await comboCompleto(b.comboId);
  if (!combo) return { erro: 'combo não encontrado', codigo: 404 };
  if (!combo.ativo || combo.vencido) return { erro: 'esta promoção não está mais no ar', codigo: 409 };
  if (!combo.servicos.length) return { erro: 'combo sem serviços', codigo: 409 };

  const prof = await db.get('SELECT * FROM staff WHERE id=? AND ativo=1', b.profissionalId);
  if (!prof) return { erro: 'profissional não encontrada', codigo: 404 };
  const cli = await db.get('SELECT * FROM clients WHERE id=?', b.clienteId);
  if (!cli) return { erro: 'cliente não encontrada', codigo: 404 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '') || !/^\d{2}:\d{2}$/.test(b.hora || '')) {
    return { erro: 'data (YYYY-MM-DD) e hora (HH:MM) inválidas', codigo: 400 };
  }

  // Uma pessoa faz o combo inteiro; se ela não faz algum dos serviços, o
  // pacote não é dela. O motivo de ser assim está em `lib/combos.js`.
  const habilitadas = await profissionaisDoCombo(combo.id);
  if (!habilitadas.includes(prof.id)) {
    return { erro: `${prof.nome} não faz todos os serviços deste combo`, codigo: 409 };
  }

  // O rateio acontece agora, sobre o preço de tabela de hoje, e vira o `valor`
  // gravado. Refazer a conta na hora da comissão daria outra resposta assim que
  // a tabela mudasse — e comissão paga não se recalcula.
  const partes = ratearCombo(combo.servicos, combo.preco);

  let inicio = toMin(b.hora);
  const aGravar = partes.map(svc => {
    const dur = svc.duracao + (svc.intervalo || 0);
    const item = { svc, hora: toHora(inicio), duracao: dur, valor: svc.valor };
    inicio += dur;
    return item;
  });

  for (const item of aGravar) {
    if (!dentroDaJornada(staffOut(prof), b.data, item.hora, item.duracao)) {
      return { erro: `o combo não cabe na jornada de ${prof.nome} nesse horário`, codigo: 409 };
    }
  }

  const grupo = uid();
  const resultado = await db.transacao(async tx => {
    for (const item of aGravar) {
      if (await conflita({ staffId: prof.id, data: b.data, hora: item.hora, duracao: item.duracao }, tx)) {
        return { erro: 'esse horário acabou de ser ocupado', codigo: 409 };
      }
      await tx.run(
        `INSERT INTO appointments (id,client_id,service_id,staff_id,unit_id,data,hora,duracao,valor,
                                   status,pag_status,pag_forma,origem,obs,combo_id,combo_grupo,criado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        uid(), b.clienteId, item.svc.id, prof.id, prof.unit_id, b.data, item.hora, item.duracao, item.valor,
        'agendado', b.pagamento?.status || 'aberto', b.pagamento?.forma || 'local',
        origem, b.obs || '', combo.id, grupo, `${hoje()} ${agora()}`
      );
    }
    return { criados: await tx.all('SELECT * FROM appointments WHERE combo_grupo=? ORDER BY hora', grupo) };
  });

  if (resultado.erro) return resultado;

  for (const criado of resultado.criados) await enfileirarConfirmacao(criado);
  return {
    agendamentos: resultado.criados.map(apptOut),
    combo: { id: combo.id, nome: combo.nome, preco: combo.preco, economia: combo.economia },
  };
}

agendamentos.post('/combo', rota(async (req, res) => {
  if (!podeMexer(req.usuario, req.body?.profissionalId)) {
    return res.status(403).json({ erro: 'você só pode agendar na própria agenda' });
  }
  const r = await criarCombo(req.body || {}, { origem: 'painel' });
  if (r.erro) return res.status(r.codigo).json({ erro: r.erro });

  await req.registrar('agendamento.combo', {
    alvoId: r.agendamentos[0]?.id,
    resumo: `vendeu "${r.combo.nome}" para ${await nomeDaCliente(r.agendamentos[0]?.clienteId)}`,
    detalhe: { combo: r.combo.nome, preco: r.combo.preco, partes: r.agendamentos.length },
  });
  res.status(201).json(r);
}));

agendamentos.post('/', rota(async (req, res) => {
  if (!podeMexer(req.usuario, req.body?.profissionalId)) {
    return res.status(403).json({ erro: 'você só pode agendar na própria agenda' });
  }
  const r = await criarAgendamento(req.body || {}, { origem: 'painel', forcar: req.body?.forcar === true });
  if (r.erro) return res.status(r.codigo).json({ erro: r.erro });

  await req.registrar('agendamento.criado', {
    alvoId: r.agendamento.id,
    resumo: `encaixou ${await nomeDaCliente(r.agendamento.clienteId)} em ${r.agendamento.data} às ${r.agendamento.hora}`,
  });
  res.status(201).json(r.agendamento);
}));

agendamentos.put('/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM appointments WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'agendamento não encontrado' });
  const b = req.body || {};

  // Precisa poder no agendamento como ele está hoje e como vai ficar: sem a
  // segunda metade, dava para empurrar a própria cliente para a agenda alheia.
  if (!podeMexer(req.usuario, atual.staff_id)
      || !podeMexer(req.usuario, b.profissionalId || atual.staff_id)) {
    return res.status(403).json({ erro: 'você só pode alterar a própria agenda' });
  }

  if (b.status && !STATUS.includes(b.status)) return res.status(400).json({ erro: 'status inválido' });
  if (b.pagamento?.forma && !FORMAS.includes(b.pagamento.forma)) {
    return res.status(400).json({ erro: 'forma de pagamento inválida' });
  }

  const data = b.data || atual.data;
  const hora = b.hora || atual.hora;
  const staffId = b.profissionalId || atual.staff_id;
  const duracao = b.duracao != null ? +b.duracao : atual.duracao;
  const mudouHorario = data !== atual.data || hora !== atual.hora || staffId !== atual.staff_id;

  const resultado = await db.transacao(async tx => {
    if (mudouHorario && await conflita({ staffId, data, hora, duracao, ignorarId: atual.id }, tx)) {
      return { erro: 'conflito com outro agendamento' };
    }
    await tx.run(
      `UPDATE appointments SET client_id=?, service_id=?, staff_id=?, data=?, hora=?, duracao=?,
              valor=?, status=?, pag_status=?, pag_forma=?, pag_ref=?, obs=? WHERE id=?`,
      b.clienteId || atual.client_id,
      b.servicoId || atual.service_id,
      staffId, data, hora, duracao,
      b.valor != null ? +b.valor : atual.valor,
      b.status || atual.status,
      b.pagamento?.status || atual.pag_status,
      b.pagamento?.forma || atual.pag_forma,
      b.pagamento?.ref ?? atual.pag_ref,
      b.obs ?? atual.obs,
      req.params.id
    );

    // Remarcou? Os lembretes antigos não valem mais.
    if (mudouHorario) {
      await tx.run(`DELETE FROM messages WHERE appointment_id=? AND status='pendente'`, req.params.id);
    }

    // Cancelar metade de um combo deixaria a cliente pagando preço de pacote
    // por um serviço só. O pacote cai junto.
    if (b.status === 'cancelado' && atual.combo_grupo) {
      await tx.run(
        `UPDATE appointments SET status='cancelado' WHERE combo_grupo=? AND status <> 'cancelado'`,
        atual.combo_grupo
      );
      await tx.run(
        `DELETE FROM messages WHERE status='pendente' AND appointment_id IN
           (SELECT id FROM appointments WHERE combo_grupo=?)`,
        atual.combo_grupo
      );
    }
    return { atualizado: await tx.get('SELECT * FROM appointments WHERE id=?', req.params.id) };
  });

  if (resultado.erro) return res.status(409).json({ erro: resultado.erro });

  const depois = apptOut(resultado.atualizado);
  const quem = await nomeDaCliente(depois.clienteId);
  const mudou = mudancas(apptOut(atual), depois,
    ['data', 'hora', 'profissionalId', 'servicoId', 'status', 'valor']);

  // Três frases diferentes porque são três coisas diferentes de procurar: o
  // horário que mudou, o dinheiro que entrou, e a cliente que não vem mais.
  const acao = depois.status === 'cancelado' ? 'agendamento.cancelado'
    : mudouHorario ? 'agendamento.remarcado'
    : depois.pagamento.status === 'pago' && atual.pag_status !== 'pago' ? 'agendamento.pago'
    : 'agendamento.alterado';
  const resumo = {
    'agendamento.cancelado': `cancelou o horário de ${quem} · ${atual.data} ${atual.hora}`,
    'agendamento.remarcado': `remarcou ${quem} de ${atual.data} ${atual.hora} para ${depois.data} ${depois.hora}`,
    'agendamento.pago': `recebeu de ${quem} em ${depois.pagamento.forma}`,
    'agendamento.alterado': `alterou o horário de ${quem}`,
  }[acao];

  await req.registrar(acao, { alvoId: depois.id, resumo, detalhe: mudou });
  res.json((await comAdicionais([depois]))[0]);
}));

agendamentos.delete('/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM appointments WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'agendamento não encontrado' });
  if (!podeMexer(req.usuario, atual.staff_id)) {
    return res.status(403).json({ erro: 'você só pode apagar da própria agenda' });
  }
  // Mesmo motivo do cancelamento: o combo é uma venda só.
  const alvos = atual.combo_grupo
    ? (await db.all('SELECT id FROM appointments WHERE combo_grupo=?', atual.combo_grupo)).map(a => a.id)
    : [atual.id];

  const quem = await nomeDaCliente(atual.client_id);
  await db.transacao(async tx => {
    for (const id of alvos) {
      await tx.run(`DELETE FROM messages WHERE appointment_id=? AND status='pendente'`, id);
      await tx.run('DELETE FROM appointments WHERE id=?', id);
    }
  });

  // Apagar não deixa o que consultar depois: o registro é a única memória de
  // que aquele horário existiu.
  await req.registrar('agendamento.apagado', {
    alvoId: atual.id,
    resumo: `apagou o horário de ${quem} · ${atual.data} ${atual.hora}`,
    detalhe: { data: atual.data, hora: atual.hora, valor: atual.valor, removidos: alvos.length },
  });
  res.json({ ok: true, removidos: alvos.length });
}));
