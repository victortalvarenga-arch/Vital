/**
 * Cliente da API.
 *
 * Uma coisa importante: o servidor fala em `categoria`, `profissionais`,
 * `clienteId`… e a tela usa nomes curtos (`cat`, `profs`, `cliente`).
 * Em vez de espalhar essa tradução pelos componentes, ela mora aqui,
 * nas funções `paraTela`. Se um dia os nomes ficarem iguais, apaga daqui e pronto.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

async function req(caminho, { method = 'GET', body } = {}) {
  const r = await fetch(BASE + caminho, {
    method,
    // A sessão viaja num cookie httpOnly — que o JavaScript não lê de
    // propósito, para um XSS não conseguir roubá-la. Por isso `credentials`:
    // sem ele o navegador não manda o cookie e tudo volta 401.
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(json?.erro || `Falha na requisição (${r.status})`);
  return json;
}

/* ── tradução servidor → tela ── */

const servicoParaTela = s => ({
  id: s.id, nome: s.nome, cat: s.categoria, desc: s.descricao,
  preco: s.preco, duracao: s.duracao, intervalo: s.intervalo,
  ativo: s.ativo, profs: s.profissionais,
  foto: s.foto || '', mostrarPreco: s.mostrarPreco !== false,
  somenteAdicional: !!s.somenteAdicional,
});

const servicoParaApi = s => ({
  nome: s.nome, categoria: s.cat, descricao: s.desc, preco: s.preco,
  duracao: s.duracao, intervalo: s.intervalo, ativo: s.ativo, profissionais: s.profs,
  foto: s.foto || '', mostrarPreco: s.mostrarPreco !== false,
  somenteAdicional: !!s.somenteAdicional,
});

const clienteParaTela = c => ({
  id: c.id, nome: c.nome, fone: c.fone, nasc: c.nascimento || '',
  end: c.endereco || '', obs: c.obs || '', optin: c.optin, criado: c.criadoEm,
});

const clienteParaApi = c => ({
  nome: c.nome, fone: c.fone, nascimento: c.nasc || null,
  endereco: c.end, obs: c.obs, optin: c.optin !== false,
});

const agParaTela = a => ({
  id: a.id, cliente: a.clienteId, servico: a.servicoId, prof: a.profissionalId,
  data: a.data, hora: a.hora, duracao: a.duracao, valor: a.valor,
  status: a.status, pagamento: a.pagamento, origem: a.origem,
  // Nome e preço vêm prontos do servidor: são o que foi vendido naquele dia,
  // não o que a tabela de preços diz hoje.
  adicionais: a.adicionais || [],
});

export const api = {
  /* Estado completo do painel numa chamada só. */
  async estado() {
    const d = await req('/estado');
    return {
      config: d.config,
      bloqueios: d.bloqueios || [],
      servicos: d.servicos.map(servicoParaTela),
      staff: d.profissionais,
      clientes: d.clientes.map(clienteParaTela),
      agendamentos: d.agendamentos.map(agParaTela),
      templates: d.templates,
      combos: d.combos || [],
      unidades: d.unidades || [],
    };
  },

  /* ── site público ── */
  vitrine: () => req('/publico/vitrine'),
  identificar: fone => req('/publico/identificar', { method: 'POST', body: { fone } }),
  agendarPublico: dados => req('/publico/agendar', { method: 'POST', body: dados }),

  /* ── disponibilidade ── */
  horarios: ({ servicoId, profissionalId, data }) => {
    const q = new URLSearchParams({ servicoId, data });
    if (profissionalId) q.set('profissionalId', profissionalId);
    return req(`/agendamentos/horarios?${q}`);
  },

  /* ── agendamentos ── */
  criarAgendamento: a => req('/agendamentos', {
    method: 'POST',
    body: {
      clienteId: a.cliente, servicoId: a.servico, profissionalId: a.prof,
      data: a.data, hora: a.hora, forcar: a.forcar,
      adicionaisIds: a.adicionaisIds || [],
    },
  }),
  atualizarAgendamento: (id, patch) => req(`/agendamentos/${id}`, { method: 'PUT', body: patch }),
  removerAgendamento: id => req(`/agendamentos/${id}`, { method: 'DELETE' }),

  /* ── unidades ── */
  salvarUnidade: u => u.id
    ? req(`/unidades/${u.id}`, { method: 'PUT', body: u })
    : req('/unidades', { method: 'POST', body: u }),
  removerUnidade: id => req(`/unidades/${id}`, { method: 'DELETE' }),

  /* ── combos e promoções ── */
  combos: () => req('/combos'),
  salvarCombo: c => c.id
    ? req(`/combos/${c.id}`, { method: 'PUT', body: c })
    : req('/combos', { method: 'POST', body: c }),
  removerCombo: id => req(`/combos/${id}`, { method: 'DELETE' }),
  agendarCombo: a => req('/agendamentos/combo', { method: 'POST', body: a }),

  /* ── clientes ── */
  salvarCliente: c => c.id
    ? req(`/clientes/${c.id}`, { method: 'PUT', body: clienteParaApi(c) })
    : req('/clientes', { method: 'POST', body: clienteParaApi(c) }),

  /* ── serviços ── */
  salvarServico: s => s.id
    ? req(`/servicos/${s.id}`, { method: 'PUT', body: servicoParaApi(s) })
    : req('/servicos', { method: 'POST', body: servicoParaApi(s) }),
  removerServico: id => req(`/servicos/${id}`, { method: 'DELETE' }),

  /* ── login ── */
  precisaConfigurar: () => req('/auth/precisa-configurar'),
  primeiroAcesso: dados => req('/auth/primeiro-acesso', { method: 'POST', body: dados }),
  login: (email, senha) => req('/auth/login', { method: 'POST', body: { email, senha } }),
  sair: () => req('/auth/sair', { method: 'POST' }),
  eu: () => req('/auth/eu'),
  usuarios: () => req('/auth/usuarios'),
  salvarUsuario: u => u.id
    ? req(`/auth/usuarios/${u.id}`, { method: 'PUT', body: u })
    : req('/auth/usuarios', { method: 'POST', body: u }),
  removerUsuario: id => req(`/auth/usuarios/${id}`, { method: 'DELETE' }),

  /* ── bloqueio de horário ── */
  bloqueios: (de, ate) => req(`/bloqueios?de=${de}&ate=${ate || de}`),
  criarBloqueio: b => req('/bloqueios', { method: 'POST', body: b }),
  removerBloqueio: id => req(`/bloqueios/${id}`, { method: 'DELETE' }),

  /* ── serviços adicionais ── */
  adicionais: () => req('/adicionais'),
  ofertaDeAdicionais: servicoId => req('/adicionais/oferta/' + servicoId),
  salvarAdicionaisDoServico: (servicoId, ids) =>
    req(`/adicionais/servico/${servicoId}`, { method: 'PUT', body: { adicionais: ids } }),
  salvarAdicionaisDaCategoria: (categoria, ids) =>
    req(`/adicionais/categoria/${encodeURIComponent(categoria)}`, { method: 'PUT', body: { adicionais: ids } }),
  /** Em quais categorias ESTE serviço é oferecido como extra. */
  salvarCategoriasDoAdicional: (servicoId, categorias) =>
    req(`/adicionais/addon/${servicoId}/categorias`, { method: 'PUT', body: { categorias } }),

  /* ── configuração do site ── */
  salvarConfig: patch => req('/config', { method: 'PUT', body: patch }),

  /** Sobe uma imagem já reduzida pelo navegador e devolve a URL pública. */
  enviarImagem: (dataUrl, uso) =>
    req('/uploads', { method: 'POST', body: { arquivo: dataUrl, uso } }),

  /* ── equipe ── */
  salvarProfissional: p => p.id
    ? req(`/profissionais/${p.id}`, { method: 'PUT', body: p })
    : req('/profissionais', { method: 'POST', body: p }),
  removerProfissional: id => req(`/profissionais/${id}`, { method: 'DELETE' }),

  /* ── mensagens ── */
  fila: () => req('/mensagens/fila'),
  gerarFila: () => req('/mensagens/fila/gerar', { method: 'POST' }),
  marcarEnviada: id => req(`/mensagens/fila/${id}/enviar`, { method: 'POST' }),
  pularMensagem: id => req(`/mensagens/fila/${id}/pular`, { method: 'POST' }),
  salvarTemplate: (id, patch) => req(`/mensagens/templates/${id}`, { method: 'PUT', body: patch }),
  dispararCampanha: (chave, clienteIds, variaveis) =>
    req(`/mensagens/campanhas/${chave}`, { method: 'POST', body: { clienteIds, variaveis } }),
  previaCampanha: (chave, clienteId) =>
    req(`/mensagens/campanhas/${chave}/previa`, { method: 'POST', body: { clienteId } }),

  /* ── relatórios ── */
  resumo: mes => req(`/relatorios/resumo${mes ? `?mes=${mes}` : ''}`),
};
