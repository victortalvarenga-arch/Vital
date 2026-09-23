/**
 * Limite de chamadas nas rotas abertas do site.
 *
 * Três rotas de `/api/publico` escrevem ou respondem sobre dado que existe, e
 * nenhuma delas pede login — é o site, tem de ser assim. O que cada uma
 * arrisca sem limite:
 *
 * - **`/evento`** enche a tabela do funil de uma empresa e suja o número que a
 *   gente usa para decidir o que consertar.
 * - **`/agendar`** ocupa a agenda de verdade. Horário reservado por robô é
 *   horário que uma cliente não consegue marcar.
 * - **`/identificar`** responde se um telefone tem cadastro. Sem limite, é uma
 *   porta para descobrir, número a número, quem é cliente de quem — e esse é o
 *   risco mais grave dos três, porque não custa nada ao atacante e não deixa
 *   rastro nenhum na empresa.
 *
 * **Contagem em memória do processo.** Com mais de uma instância, cada uma tem
 * o próprio balde e o limite real vira N vezes o configurado. É proteção
 * suficiente contra script solto e não é proteção contra ataque distribuído —
 * essa mora na borda (Cloudflare, WAF do provedor), e está anotada no
 * ROADMAP. O que existe aqui não depende de nada externo e funciona hoje.
 */

/**
 * Janela fixa, não deslizante.
 *
 * A janela fixa deixa passar até o dobro do limite na virada (o fim de uma
 * janela mais o começo da seguinte). Sabendo disso, o limite já é escolhido
 * com folga — e o preço é um Map por janela em vez de uma lista de horários
 * por chave, que numa rota pública é a diferença entre lembrar de quem chamou
 * e lembrar de cada chamada.
 *
 * Trocar o Map inteiro na virada também é o que impede o vazamento de memória:
 * IP que apareceu uma vez e sumiu vai embora junto com a janela, sem varredura.
 */
const baldes = new Map();

function balde(nome, janelaMs) {
  const agora = Date.now();
  const atual = baldes.get(nome);
  if (atual && agora < atual.expiraEm) return atual;

  const novo = { contagem: new Map(), expiraEm: agora + janelaMs };
  baldes.set(nome, novo);
  return novo;
}

/** Zera tudo. Existe para o teste não herdar a contagem do caso anterior. */
export function zerarLimites() {
  baldes.clear();
}

/**
 * Quem está chamando.
 *
 * `req.ip` respeita `trust proxy` — que só é ligado quando há proxy de
 * verdade na frente (ver `app.js`). Sem isso, qualquer um mandaria
 * `X-Forwarded-For` e teria um balde novo por requisição.
 *
 * A empresa entra na chave porque o mesmo IP atendendo duas empresas são dois
 * assuntos: quem abusa do site de uma não pode travar o agendamento da outra.
 */
const chaveDe = req => `${req.ip || 'sem-ip'}|${req.tenantId || '-'}`;

/**
 * @param {object} o
 * @param {string} o.nome        balde próprio por rota — um estouro não afeta a outra
 * @param {number} o.max         chamadas permitidas na janela
 * @param {number} o.janelaSeg   tamanho da janela
 */
export function limite({ nome, max, janelaSeg = 600 }) {
  const janelaMs = janelaSeg * 1000;

  return function limitar(req, res, next) {
    // Lido a cada requisição, e não na carga do módulo: é o que deixa a suíte
    // desligar o limite sem precisar de um app diferente.
    if (process.env.RATE_LIMIT === 'off') return next();

    const b = balde(nome, janelaMs);
    const chave = chaveDe(req);
    const n = (b.contagem.get(chave) || 0) + 1;
    b.contagem.set(chave, n);

    if (n > max) {
      const faltam = Math.max(1, Math.ceil((b.expiraEm - Date.now()) / 1000));
      res.set('Retry-After', String(faltam));
      // Mensagem sem número e sem balde: dizer o limite exato é ensinar a
      // ficar logo abaixo dele.
      return res.status(429).json({ erro: 'muitas tentativas seguidas. Tente de novo em instantes.' });
    }
    next();
  };
}
