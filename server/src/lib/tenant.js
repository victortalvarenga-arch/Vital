/**
 * Resolvedor de empresa: de quem é esta requisição.
 *
 * É o único lugar que decide isso. Toda consulta de dado de negócio recebe o id
 * daqui — nunca se escreve 'default' na mão.
 *
 * Três caminhos, nesta ordem:
 *   1. domínio próprio      agenda.estudiolume.com.br → a empresa dona dele
 *   2. subdomínio nosso     lume.vital.app            → a empresa de slug 'lume'
 *   3. nada disso           localhost, IP, apex       → TENANT_PADRAO
 *
 * **Host que nomeia empresa inexistente não cai no padrão.** Cair seria servir
 * o site de uma empresa no endereço de outra — pior do que dar erro. Quem
 * resolve devolve `null`, e o middleware responde 404.
 */
export const TENANT_PADRAO = process.env.TENANT_PADRAO || 'default';

/** Hosts que não nomeiam empresa nenhuma: é o ambiente local ou um IP. */
const SEM_EMPRESA = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/**
 * O rótulo à esquerda do host, quando ele é mesmo um subdomínio.
 *
 * `vital.app` não tem subdomínio; `lume.vital.app` tem. `lume.localhost` também
 * conta, para dar como testar mais de uma empresa na máquina sem DNS.
 */
export function subdominioDe(host) {
  const partes = host.split('.');
  const ehLocal = partes.at(-1) === 'localhost';
  const minimo = ehLocal ? 2 : 3;
  if (partes.length < minimo) return null;
  const sub = partes[0];
  return ['www', 'api', 'app'].includes(sub) ? null : sub;
}

/**
 * Cache de host → empresa.
 *
 * Sem ele, toda requisição — inclusive cada imagem do site — faria uma consulta
 * a `plataforma.tenants` só para descobrir de quem é. O prazo é curto de
 * propósito: suspender uma empresa precisa surtir efeito em pouco tempo, sem
 * reiniciar nada.
 */
const cache = new Map();
const VALIDADE_MS = 60_000;

/** Esquece o que estiver guardado. Chamado ao criar ou suspender empresa. */
export function esquecerCacheDeEmpresas() { cache.clear(); }

/**
 * @returns {Promise<{id:string, status:string, ativo:boolean}|null>}
 *          `null` quando o host nomeia uma empresa que não existe.
 */
export async function resolverTenant(req, db) {
  const host = String(req?.hostname || '').toLowerCase();

  const PADRAO = { id: TENANT_PADRAO, status: 'ativa', ativo: true };

  // localhost, IP ou host sem ponto: é o ambiente local, e não há o que buscar.
  if (SEM_EMPRESA.has(host) || !host.includes('.')) return PADRAO;
  const sub = subdominioDe(host);

  const guardado = cache.get(host);
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.empresa;

  // `plataforma.tenants` não tem RLS: é cadastro nosso, e a consulta acontece
  // antes de existir empresa definida na conexão — é ela que define.
  const linha = await db.get(
    `SELECT id, status, ativo FROM plataforma.tenants
      WHERE dominio = ? OR (slug = ? AND ? <> '')
      ORDER BY (dominio = ?) DESC LIMIT 1`,
    host, sub || '', sub || '', host
  );

  const empresa = linha
    ? { id: linha.id, status: linha.status, ativo: !!linha.ativo }
    // Domínio ou subdomínio que não é de ninguém. No apex sem subdomínio
    // (`vital.app`), a de sempre — é a nossa própria página.
    : (sub ? null : PADRAO);

  cache.set(host, { empresa, em: Date.now() });
  return empresa;
}

/**
 * Prende a requisição inteira a uma empresa: pega uma conexão, marca
 * `app.tenant_id` nela e roda o resto do pedido lá dentro.
 *
 * A partir daqui o RLS faz o trabalho — nenhuma consulta consegue enxergar
 * linha de outra empresa, mesmo que esqueça o filtro.
 */
export function comEmpresa(db) {
  return async (req, res, next) => {
    let empresa;
    try { empresa = await resolverTenant(req, db); }
    catch (erro) { return next(erro); }

    if (!empresa) {
      return res.status(404).json({ erro: 'não existe uma agenda neste endereço' });
    }
    // Empresa suspensa para de responder na porta, e não em cada rota: assim
    // não há rota nova nascendo sem a checagem.
    if (!empresa.ativo || empresa.status !== 'ativa') {
      return res.status(403).json({ erro: 'esta agenda está temporariamente indisponível' });
    }

    req.tenantId = empresa.id;
    db.comEmpresa(empresa.id, () => new Promise(resolve => {
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
  // O que o negócio é, em texto livre. Sai do assistente de primeira
  // configuração e serve para sugerir vocabulário e textos — nunca para
  // ligar ou desligar funcionalidade: ramo não é plano.
  ramo: '',
  // Falso até o assistente terminar. É o que decide se a primeira tela ensina
  // o caminho ou já mostra o painel.
  configurado: false,
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
    // Qual dos modelos visuais do site esta empresa usa. A cor continua sendo
    // escolha dela em qualquer modelo — o que muda é a forma, a tipografia, a
    // sombra e o fundo neutro em volta dessa cor. Era `fonte`, sem uso nenhum
    // no front; renomeado para o que o campo faz de verdade.
    template: 'bandeja', // 'bandeja' | 'quadro' | 'caderneta' | 'clinica'
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
