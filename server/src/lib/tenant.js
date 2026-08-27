/**
 * Resolvedor de empresa.
 *
 * Hoje é um deploy por cliente e este módulo devolve sempre a mesma empresa.
 * Ele existe assim mesmo porque é o único lugar que decide de quem é o dado —
 * quando o Bloco 7 chegar, passa a olhar o subdomínio e nada mais muda.
 *
 * Toda consulta que lê dado de negócio deve receber o id daqui, nunca escrever
 * 'default' na mão.
 */
export const TENANT_PADRAO = process.env.TENANT_PADRAO || 'default';

/**
 * Descobre de qual empresa é a requisição.
 *
 * Hoje devolve sempre a mesma, porque é um domínio só. A ordem de resolução já
 * está montada para o dia do subdomínio (Bloco 9) — quando chegar lá, só a
 * consulta ao banco entra no lugar do fallback.
 */
export function resolverTenant(req) {
  // Bloco 9: buscar em plataforma.tenants por slug (subdomínio) ou dominio.
  const host = (req?.hostname || '').toLowerCase();
  const sub = host.split('.')[0];
  if (sub && !['localhost', 'www', '127'].includes(sub) && host.split('.').length > 2) {
    return sub;
  }
  return TENANT_PADRAO;
}

/**
 * Prende a requisição inteira a uma empresa: pega uma conexão, marca
 * `app.tenant_id` nela e roda o resto do pedido lá dentro.
 *
 * A partir daqui o RLS faz o trabalho — nenhuma consulta consegue enxergar
 * linha de outra empresa, mesmo que esqueça o filtro.
 */
export function comEmpresa(db) {
  return (req, res, next) => {
    req.tenantId = resolverTenant(req);
    db.comEmpresa(req.tenantId, () => new Promise(resolve => {
      // A conexão só volta ao pool quando a resposta termina; até lá, toda
      // consulta da requisição sai dela. Vale para os dois desfechos: erro
      // tratado também gera resposta, e 'close' cobre cliente que desistiu.
      res.on('finish', resolve);
      res.on('close', resolve);
      next();
    })).catch(next);
  };
}

/**
 * Config padrão de uma empresa.
 *
 * É o contrato entre o painel e o site: tudo que a empresa pode mudar sem
 * programador está aqui. Um campo novo entra com valor padrão e as empresas
 * existentes passam a enxergá-lo na hora, porque getConfig() mescla por cima
 * disto — não há migration para config.
 */
export const configPadrao = {
  /* --- identidade e contato (chaves planas: já são lidas assim em
     routes/publico.js e lib/templates.js) --- */
  nome: 'Meu negócio',
  slogan: '',
  sobre: '',
  fone: '',
  whatsapp: '',
  email: '',
  endereco: '',
  mapa: '',
  instagram: '',
  linkAvaliacao: '',

  /* --- agenda e mensagens: lidas por lib/availability.js e jobs/mensagens.js --- */
  janelaDias: 30,
  antecedenciaHoras: 2,
  passoAgenda: 30,
  horaLembreteVespera: '18:00',
  horasAvisoNoDia: 3,
  horaPosAtendimento: '11:00',
  horaCampanha: '10:00',
  diasAntesAniversario: 7,
  diasReativacao: 60,

  /* --- pagamento --- */
  pixChave: '',
  formasPagamento: ['pix', 'cartao', 'dinheiro'],
  exigirSinal: false,

  /* --- o que a empresa personaliza sozinha (Bloco 4) --- */
  marca: {
    corPrimaria: '#A32A4E',
    corFundo: '#FFFFFF',
    corTexto: '#1A1A1A',
    fonte: 'padrao',
    logo: '',
    capa: '',
    favicon: '',
  },

  textos: {
    chamada: 'Agende seu horário',
    botaoAgendar: 'Agendar',
    confirmacao: 'Pronto! Seu horário está reservado.',
    rodape: '',
  },

  // O que o negócio chama cada coisa. Sem isto, white-label para na cor e não
  // chega na linguagem: quem tem barbearia não fala "profissional".
  vocabulario: {
    profissional: 'profissional',
    profissionais: 'profissionais',
    servico: 'serviço',
    servicos: 'serviços',
    cliente: 'cliente',
    clientes: 'clientes',
    unidade: 'unidade',
    unidades: 'unidades',
  },

  exibir: {
    preco: true,
    duracao: true,
    escolherProfissional: true,
    fotos: true,
    categorias: true,
  },
};

/** Mescla rasa por seção — o que o banco tem vence, o resto vem do padrão. */
export function comPadroes(config = {}) {
  const saida = { ...configPadrao, ...config };
  for (const [chave, valor] of Object.entries(configPadrao)) {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      saida[chave] = { ...valor, ...(config[chave] || {}) };
    }
  }
  return saida;
}
