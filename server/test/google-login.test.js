import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/**
 * A conferência do ID token do Google — a porta do login da cliente.
 *
 * O navegador manda um token; o servidor **não acredita em nada além dele**.
 * Nome, e-mail e id da conta saem de dentro do token depois de conferido, e
 * nunca de campos soltos no corpo da requisição: um `{"email":"ela@..."}`
 * escrito à mão é entrar como qualquer pessoa.
 *
 * Quatro conferências, e cada uma existe por um buraco conhecido:
 *
 *  - **assinatura**, com a chave pública do Google — sem ela, qualquer um
 *    forja um token com o conteúdo que quiser;
 *  - **`aud`**, que precisa ser o nosso cliente OAuth. Esta é a que mais passa
 *    batida: um token legítimo, emitido pelo Google para OUTRO aplicativo,
 *    tem assinatura boa e emissor bom. Sem conferir `aud`, qualquer app que a
 *    pessoa use consegue entrar na conta dela aqui;
 *  - **`iss`**, o emissor;
 *  - **prazo**, com folga pequena para relógio torto.
 *
 * E `email_verified`: o Google deixa criar conta com e-mail não confirmado, e
 * um e-mail não confirmado não prova nada sobre quem é dono dele.
 *
 * Nada de rede nestes testes: a chave é gerada aqui, e o `fetch` do certificado
 * é falso — é o mesmo caminho que `conexoes.test.js` usa.
 */

const CLIENTE = '123456789-vital.apps.googleusercontent.com';
const KID = 'chave-de-teste-1';
const CERTS = 'www.googleapis.com/oauth2/v3/certs';

const fetchDeVerdade = globalThis.fetch;
let par, jwk, google, buscas;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Monta um ID token assinado como o Google assina. */
function token({ chave = par.privateKey, kid = KID, alg = 'RS256', ...reivindicacoes } = {}) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = {
    iss: 'https://accounts.google.com',
    aud: CLIENTE,
    sub: '110000000000000000001',
    email: 'cliente@gmail.com',
    email_verified: true,
    name: 'Teresa Bianchi',
    iat: agora - 10,
    exp: agora + 3600,
    ...reivindicacoes,
  };
  const inicio = `${b64({ alg, kid, typ: 'JWT' })}.${b64(corpo)}`;
  if (alg === 'none') return `${inicio}.`;
  const assinatura = crypto.sign('RSA-SHA256', Buffer.from(inicio), chave).toString('base64url');
  return `${inicio}.${assinatura}`;
}

before(async () => {
  process.env.GOOGLE_LOGIN_CLIENT_ID = CLIENTE;
  par = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  jwk = { ...par.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
  google = await import('../src/lib/google-login.js');
});

after(() => {
  globalThis.fetch = fetchDeVerdade;
  delete process.env.GOOGLE_LOGIN_CLIENT_ID;
});

beforeEach(() => {
  buscas = 0;
  google.esquecerChaves();
  globalThis.fetch = async url => {
    const u = new URL(url);
    if (u.host + u.pathname !== CERTS) throw new Error(`fetch falso sem resposta para ${url}`);
    buscas++;
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
    });
  };
});

/** O que a rota vai fazer: ou devolve a pessoa, ou não entra ninguém. */
const conferir = t => google.conferirIdToken(t).then(
  d => ({ ok: true, d }),
  e => ({ ok: false, erro: e.message })
);

describe('o token bom passa, e só traz o que estava assinado', () => {
  test('devolve id, e-mail e nome de dentro do token', async () => {
    const r = await conferir(token());
    assert.ok(r.ok, r.erro);
    assert.deepEqual(r.d, {
      sub: '110000000000000000001',
      email: 'cliente@gmail.com',
      nome: 'Teresa Bianchi',
    });
  });

  test('o certificado é buscado uma vez e reaproveitado', async () => {
    // Uma ida ao Google por login seria uma dependência externa no caminho de
    // entrar — e eles limitam chamada.
    await conferir(token());
    await conferir(token());
    await conferir(token());
    assert.equal(buscas, 1);
  });
});

describe('o que não entra', () => {
  const recusa = async (nome, t, trecho) => {
    const r = await conferir(t);
    assert.equal(r.ok, false, `${nome}: o token passou`);
    if (trecho) assert.match(r.erro, trecho);
  };

  test('assinado por outra chave', async () => {
    const outro = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    await recusa('chave trocada', token({ chave: outro.privateKey }), /assinatura/i);
  });

  test('sem assinatura nenhuma (alg none)', async () => {
    await recusa('alg none', token({ alg: 'none' }), /assinatura|algoritmo/i);
  });

  test('algoritmo que não é o do Google, com assinatura preenchida', async () => {
    // `alg: none` sozinho não prova a regra: ele morre na assinatura vazia.
    // Este tem assinatura, e precisa morrer no ALGORITMO — a conferência é
    // feita com RS256 fixo, e o token não escolhe o cadeado que abre a porta.
    const inicio = `${b64({ alg: 'HS256', kid: KID, typ: 'JWT' })}.${b64({ aud: CLIENTE })}`;
    const hmac = crypto.createHmac('sha256', 'segredo-inventado').update(inicio).digest('base64url');
    await recusa('alg HS256', `${inicio}.${hmac}`, /algoritmo/i);
  });

  test('token de OUTRO aplicativo do Google', async () => {
    // Assinatura boa, emissor bom, pessoa de verdade — e mesmo assim não é
    // para nós. É o caso que mais passa batido.
    await recusa('aud alheio', token({ aud: 'outro-app.apps.googleusercontent.com' }), /aplicativo|aud/i);
  });

  test('emissor que não é o Google', async () => {
    await recusa('iss falso', token({ iss: 'https://accounts.google.com.invalido' }), /emissor|iss/i);
  });

  test('vencido', async () => {
    const agora = Math.floor(Date.now() / 1000);
    await recusa('exp no passado', token({ exp: agora - 600, iat: agora - 4000 }), /venceu|prazo/i);
  });

  test('mas um minuto de folga é de propósito, para relógio torto', async () => {
    // Servidor com o relógio alguns segundos adiantado recusaria token recém
    // emitido, e o login falharia sem explicação. A folga é pequena e está
    // aqui escrita para ninguém "consertar" achando que é bug.
    const agora = Math.floor(Date.now() / 1000);
    const r = await conferir(token({ exp: agora - 30, iat: agora - 3600 }));
    assert.ok(r.ok, `a folga de relógio sumiu: ${r.erro}`);
  });

  test('emitido no futuro', async () => {
    const agora = Math.floor(Date.now() / 1000);
    await recusa('iat no futuro', token({ iat: agora + 600, exp: agora + 4000 }), /futuro|prazo/i);
  });

  test('e-mail não confirmado no Google', async () => {
    await recusa('email_verified false', token({ email_verified: false }), /confirmad/i);
  });

  test('token mastigado, vazio ou com pedaço a mais', async () => {
    for (const ruim of ['', 'abc', 'a.b', 'a.b.c.d', null, undefined]) {
      await recusa(`token ${JSON.stringify(ruim)}`, ruim);
    }
  });

  test('chave que o Google não publica (kid desconhecido)', async () => {
    await recusa('kid de fora', token({ kid: 'chave-que-nao-existe' }), /chave/i);
  });

  test('e `kid` sorteado não vira uma ida à rede por pedido', async () => {
    // A requisição segura uma conexão do banco enquanto fala com o Google, e
    // o pool tem dez. Sem freio, tokens com `kid` aleatório — que ninguém
    // precisa assinar — forçam uma busca por pedido e derrubam todas as
    // empresas de fora, de graça. Achado do `revisor-isolamento`.
    for (let i = 0; i < 20; i++) {
      await conferir(token({ kid: `sorteado-${i}` }));
    }
    assert.equal(buscas, 1, `foram ${buscas} idas ao Google`);
  });

  test('sem GOOGLE_LOGIN_CLIENT_ID configurado, ninguém entra', async () => {
    // Sem o nosso id, não há como conferir `aud` — e aceitar seria aceitar
    // token de qualquer aplicativo do mundo.
    const guardado = process.env.GOOGLE_LOGIN_CLIENT_ID;
    process.env.GOOGLE_LOGIN_CLIENT_ID = '';
    try {
      await recusa('sem client id', token(), /configurad/i);
    } finally {
      process.env.GOOGLE_LOGIN_CLIENT_ID = guardado;
    }
  });
});

describe('quando o Google não responde', () => {
  test('falha fechada: sem certificado, ninguém entra', async () => {
    globalThis.fetch = async () => new Response('erro', { status: 500 });
    const r = await conferir(token());
    assert.equal(r.ok, false, 'entrou sem conseguir conferir a assinatura');
  });
});
