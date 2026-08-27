import { Router } from 'express';
import { db, uid, listarServicos, staffOut, getConfig, listarUnidades } from '../db.js';
import { hoje, soDigitos } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { criarAgendamento } from './agendamentos.js';
import { horariosLivres, horariosPorServico } from '../lib/availability.js';

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
    servicos: servicos.map(s => ({
      ...s,
      preco: cfg.exibir?.preco && s.mostrarPreco ? s.preco : null,
    })),
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
  if (!servicoId) return res.status(400).json({ erro: 'informe servicoId' });

  const svc = await db.get('SELECT * FROM services WHERE id=? AND ativo=1', servicoId);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });
  const duracao = svc.duracao + (svc.intervalo || 0);

  if (profissionalId) {
    return res.json({ data, horarios: await horariosLivres({ staffId: profissionalId, data, duracao }) });
  }
  res.json({ data, porProfissional: await horariosPorServico({ servicoId, data }) });
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
    const id = uid();
    await db.run(
      `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,criado_em) VALUES (?,?,?,?,?,?,?,?)`,
      id, b.nome.trim(), fone, b.nascimento || null, b.endereco || '', '',
      b.aceitaMensagens === false ? 0 : 1, hoje()
    );
    cliente = await db.get('SELECT * FROM clients WHERE id=?', id);
  }

  const r = await criarAgendamento(
    { clienteId: cliente.id, servicoId: b.servicoId, profissionalId: b.profissionalId, data: b.data, hora: b.hora,
      pagamento: { status: 'aberto', forma: b.formaPagamento || 'local' } },
    { origem: 'site' }
  );
  if (r.erro) return res.status(r.codigo).json({ erro: r.erro });

  res.status(201).json({
    agendamento: r.agendamento,
    cliente: { id: cliente.id, primeiroNome: cliente.nome.split(' ')[0] },
    // O pagamento online entra aqui: gere a cobrança no gateway e devolva a URL.
    // Veja server/src/routes/pagamentos.js (ainda não implementado).
    pagamento: b.formaPagamento === 'local' ? null : { pendente: true, url: null },
  });
}));
