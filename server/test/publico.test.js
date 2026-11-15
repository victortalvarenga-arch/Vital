import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi } from './ambiente.js';

/**
 * A identificação da cliente no agendamento público.
 *
 * O site pergunta o WhatsApp e, a partir dele, decide se a pessoa já tem ficha.
 * Tudo o que a Vital promete depois disso — confirmação, lembrete de véspera,
 * aviso no dia, aniversário — sai por esse número. Número que não recebe
 * WhatsApp não é um campo mal preenchido: é um agendamento que a empresa acha
 * que confirmou e a cliente nunca soube que existia.
 *
 * Por isso a conferência vive no servidor e nas DUAS rotas. Validar só o
 * `/identificar` deixaria a escrita aberta a quem chamasse `/agendar` direto —
 * a mesma regra do `CLAUDE.md` que manda `escopoDe` na escrita, e não só na
 * leitura.
 */

let db, api, dates, fone;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  dates = await import('../src/lib/dates.js');
  fone = await import('../src/lib/fone.js');

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
});

after(async () => {
  await api?.fechar();
  await db?.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', () => limparAgenda(db));
});

/** Dois dias à frente: a jornada do cenário cobre os sete dias da semana. */
const DIA = () => dates.addDias(dates.hoje(), 2);

const identificar = numero => api.anonimo()('POST', '/api/publico/identificar', { fone: numero });

const agendar = (numero, extra = {}) => api.anonimo()('POST', '/api/publico/agendar', {
  fone: numero, nome: 'Cliente Nova', nascimento: '1990-05-10',
  servicoId: 's1', profissionalId: 'p1', data: DIA(), hora: '10:00',
  ...extra,
});

/** O mesmo agendamento, mas mandando só o que a tela manda de verdade. */
const agendarCru = corpo => api.anonimo()('POST', '/api/publico/agendar', {
  servicoId: 's1', profissionalId: 'p1', data: DIA(), hora: '10:00', ...corpo,
});

const fichaDe = numero => db.db.comEmpresa('default', () =>
  db.db.get('SELECT id, nome, nascimento FROM clients WHERE fone=?', numero));

/**
 * Cada caso traz o motivo pelo qual o número é impossível, e um pedaço da
 * mensagem que a cliente precisa ler. Mensagem genérica não ajuda ninguém a
 * consertar o próprio número: "inválido" não diz se o erro foi o DDD ou o 9.
 */
const IMPOSSIVEIS = [
  ['1133334444', 'fixo não recebe WhatsApp', /celular/i],
  ['0088887777', 'DDD que não existe, e curto demais', /celular|DDD/i],
  ['00988887777', 'DDD que não existe', /DDD/i],
  ['11999999999', 'nove dígitos repetidos', /não parece/i],
  ['119988887777', 'um dígito a mais', /celular/i],
  ['11388887777', 'celular sem o 9 na frente', /\b9\b/],
];

describe('número que não recebe WhatsApp é recusado', () => {
  for (const [numero, motivo, mensagem] of IMPOSSIVEIS) {
    test(`/identificar recusa ${numero} (${motivo})`, async () => {
      const r = await identificar(numero);
      assert.equal(r.status, 400, `devolveu ${r.status}: ${JSON.stringify(r.corpo)}`);
      assert.match(r.corpo.erro, mensagem);
    });

    test(`/agendar recusa ${numero} (${motivo})`, async () => {
      const r = await agendar(numero);
      assert.equal(r.status, 400, `devolveu ${r.status}: ${JSON.stringify(r.corpo)}`);
      // A recusa tem de ser POR CAUSA do telefone. Sem conferir a mensagem, um
      // 400 vindo de outro campo faria o teste passar com a validação ausente.
      assert.match(r.corpo.erro, mensagem);
    });

    test(`${numero} não vira ficha nem agendamento`, async () => {
      await agendar(numero);
      await db.db.comEmpresa('default', async () => {
        const c = await db.db.get('SELECT 1 FROM clients WHERE fone = ?', numero);
        assert.equal(c, undefined, 'criou cadastro com número impossível');
        const a = await db.db.get('SELECT 1 FROM appointments WHERE data = ?', DIA());
        assert.equal(a, undefined, 'ocupou horário com número impossível');
      });
    });
  }
});

describe('celular de verdade continua passando', () => {
  test('/identificar aceita e diz que não há cadastro', async () => {
    const r = await identificar('11988887777');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.existe, false);
  });

  test('/agendar marca o horário', async () => {
    const r = await agendar('11988887777');
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
  });

  test('a cliente do cenário é reconhecida', async () => {
    // `47900000001` é a cliente que `cenario()` cria. Um número de teste que a
    // regra nova recusasse quebraria meia suíte — este caso é o aviso.
    const r = await identificar('47900000001');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.existe, true);
  });
});

/**
 * O que o site pergunta, e quando.
 *
 * Quem já tem ficha não digita nada além do WhatsApp — o nome já está no
 * banco, e o que ela escrevesse num campo não sobrescreve a ficha que a
 * profissional vê e usa. Quem é nova digita o nome, uma vez só. O aniversário
 * saiu daqui em 2026-11-13: três campos no meio do agendamento custam
 * agendamento, e a data só serve para uma mensagem por ano — ela é perguntada
 * depois, com a cliente já atendida (ROADMAP, Bloco 4c, etapa 5).
 */
describe('o agendamento pergunta o mínimo', () => {
  const CONHECIDA = '47900000001'; // a cliente que `cenario()` cria, "Cliente Um"

  test('quem já tem ficha agenda sem mandar nome nenhum', async () => {
    const r = await agendarCru({ fone: CONHECIDA });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
  });

  test('e a confirmação NÃO diz o nome de quem só digitou um telefone', async () => {
    // Decisão do dono, 2026-11-14: a saudação com nome é para quem provou ser
    // a dona da ficha — ela nasceu agora, ou entrou com o Google. Devolver o
    // nome aqui é a mesma varredura que a etapa 2 fechou no `/identificar`,
    // só que ao preço de ocupar um horário de verdade.
    const r = await agendarCru({ fone: CONHECIDA, hora: '16:00' });
    assert.equal(r.corpo.cliente.primeiroNome, '');
  });

  test('mas quem acabou de ganhar ficha é saudada pelo nome', async () => {
    const r = await agendarCru({ fone: '47988887711', nome: 'Nasceu Agora', hora: '17:00' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.cliente.primeiroNome, 'Nasceu');
  });

  test('e um nome mandado por fora NÃO reescreve a ficha', async () => {
    // A ficha é da empresa: nome, histórico e observações são da profissional.
    // Quem digita o número de outra pessoa não pode renomear a cliente dela.
    await agendarCru({ fone: CONHECIDA, nome: 'Invasora Silva', hora: '14:00' });
    assert.equal((await fichaDe(CONHECIDA)).nome, 'Cliente Um');
  });

  test('primeira vez ainda precisa do nome', async () => {
    const r = await agendarCru({ fone: '47988887788' });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.erro, /nome/i);
    assert.equal(await fichaDe('47988887788'), undefined);
  });

  test('primeira vez NÃO precisa do nascimento', async () => {
    const r = await agendarCru({ fone: '47988887799', nome: 'Primeira Vez' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    const ficha = await fichaDe('47988887799');
    assert.equal(ficha.nome, 'Primeira Vez');
    assert.equal(ficha.nascimento, null, 'nasceu com data inventada');
  });

  test('mas quem mandar a data continua tendo ela gravada', async () => {
    // A etapa 5 grava a data por outra rota, e o painel também grava. O
    // caminho antigo não pode quebrar calado no meio do caminho.
    const r = await agendarCru({
      fone: '47988887744', nome: 'Com Data', nascimento: '1990-05-10', hora: '15:00',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal((await fichaDe('47988887744')).nascimento, '1990-05-10');
  });

  test('data impossível continua recusada quando vem', async () => {
    const amanha = dates.addDias(dates.hoje(), 1);
    const r = await agendarCru({ fone: '47988887755', nome: 'Do Futuro', nascimento: amanha });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(await fichaDe('47988887755'), undefined);
  });
});

/**
 * Qualquer pessoa na internet digita um número aqui e recebe uma resposta sobre
 * ele. Então a resposta é "sim" ou "não", e mais nada.
 *
 * O primeiro nome saía daqui até 2026-11-13: digitando números a esmo dava para
 * montar uma lista de quem é cliente de quem, com nome, sem login, sem rastro
 * na empresa e de graça. O preço de tirar é que a cliente não vê mais "é você,
 * Maria?" para conferir o próprio número — essa conferência volta pelo código
 * por WhatsApp (Bloco 4b), que prova o número em vez de mostrar o nome a quem
 * o digitou.
 */
describe('identificar responde sim ou não, e nada mais', () => {
  // `deepEqual` no corpo inteiro, de propósito: campo novo nesta resposta é
  // vazamento novo, e um `assert.equal(corpo.existe, true)` deixaria passar
  // qualquer coisa acrescentada ao lado.
  test('número com cadastro: só o "sim"', async () => {
    const r = await identificar('47900000001');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { existe: true });
  });

  test('número sem cadastro: só o "não"', async () => {
    const r = await identificar('47999990000');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { existe: false });
  });

  test('a resposta do agendamento não leva o id interno da ficha', async () => {
    // O id da cliente circulava na resposta de sucesso sem ninguém usar. Id
    // vaza em link, em URL e no histórico do navegador — e o que não sai não
    // vaza. O primeiro nome fica: é a saudação da tela de confirmação.
    const r = await agendar('11988887777', { hora: '11:00' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual(Object.keys(r.corpo.cliente), ['primeiroNome']);
  });

  test('o nome da ficha não sai nem de passagem', async () => {
    await db.db.comEmpresa('default', () => db.db.run(
      `INSERT INTO clients (id,nome,fone,criado_em) VALUES (?,?,?,?)`,
      'c-vaza', 'Marieta Fontoura Albuquerque', '47955558888', '2026-01-01'
    ));
    const r = await identificar('47955558888');
    // No texto cru, não só no objeto: um dia alguém devolve a ficha inteira
    // dentro de um campo aninhado, e `deepEqual` em outro teste não pegaria.
    const texto = JSON.stringify(r.corpo);
    for (const pedaço of ['Marieta', 'Fontoura', 'Albuquerque', 'c-vaza']) {
      assert.ok(!texto.includes(pedaço), `vazou "${pedaço}" em ${texto}`);
    }
  });
});

describe('foneValido, caso a caso', () => {
  test('devolve null quando o número serve', () => {
    for (const bom of ['11988887777', '47900000001', '47966600900', '21987654321']) {
      assert.equal(fone.foneValido(bom), null, `recusou ${bom}`);
    }
  });

  test('devolve a mensagem quando não serve', () => {
    for (const [ruim] of IMPOSSIVEIS) {
      assert.equal(typeof fone.foneValido(ruim), 'string', `aceitou ${ruim}`);
    }
  });

  test('campo vazio e lixo não explodem', () => {
    for (const nada of ['', null, undefined, 'abc']) {
      assert.equal(typeof fone.foneValido(nada), 'string', `aceitou ${JSON.stringify(nada)}`);
    }
  });
});
