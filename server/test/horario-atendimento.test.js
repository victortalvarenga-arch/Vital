import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi } from './ambiente.js';

/**
 * O horário de funcionamento que o site publica.
 *
 * **É derivado da jornada da equipe, não um campo da config.** O negócio está
 * aberto quando há alguém trabalhando — e um campo à parte nasceria
 * contradizendo a agenda no dia em que a empresa mudasse a jornada de alguém e
 * esquecesse de mexer no site. O que o teste protege é justamente isso: mexeu
 * na jornada, o site muda junto.
 */

let db, api, horariosDeAtendimento;

before(async () => {
  db = await prepararBanco();
  // Depois de prepararBanco: `horarios.js` não toca no banco, mas import no
  // topo deste arquivo puxaria a cadeia inteira e prenderia o pool no banco de
  // trabalho (ver o comentário em combos.test.js).
  ({ horariosDeAtendimento } = await import('../src/lib/horarios.js'));
  api = await subirApi();
});

after(async () => {
  await api?.fechar();
  await db?.pool.end();
});

describe('a faixa de cada dia', () => {
  test('vai da abertura mais cedo ao fechamento mais tarde da equipe', () => {
    const r = horariosDeAtendimento([
      { jornada: { 1: ['09:00', '18:00'] } },
      { jornada: { 1: ['08:00', '14:00'] } },
      { jornada: { 1: ['13:00', '20:00'] } },
    ]);
    assert.deepEqual(r, [{ dia: 1, abre: '08:00', fecha: '20:00' }]);
  });

  test('dia em que ninguém trabalha não aparece', () => {
    const r = horariosDeAtendimento([{ jornada: { 1: ['09:00', '18:00'], 6: ['09:00', '13:00'] } }]);
    assert.deepEqual(r.map(h => h.dia), [1, 6], 'domingo não entra como "fechado", some');
  });

  test('sai em ordem, de domingo a sábado', () => {
    const r = horariosDeAtendimento([{ jornada: { 6: ['09:00', '13:00'], 0: ['10:00', '12:00'], 3: ['09:00', '18:00'] } }]);
    assert.deepEqual(r.map(h => h.dia), [0, 3, 6]);
  });

  test('equipe sem jornada nenhuma não publica horário', () => {
    assert.deepEqual(horariosDeAtendimento([{ jornada: {} }, {}]), []);
  });

  test('linha torta no JSON não derruba a página', () => {
    // `jornada` é JSON gravado pelo painel: uma linha inválida não pode
    // quebrar o site inteiro do negócio.
    const r = horariosDeAtendimento([
      { jornada: { 1: ['09:00'], 2: 'aberto', 3: ['25:00', '09:00'], 4: ['18:00', '09:00'], 5: ['09:00', '18:00'] } },
    ]);
    assert.deepEqual(r, [{ dia: 5, abre: '09:00', fecha: '18:00' }],
      'só o dia bem formado sobrevive — inclusive o que fecha antes de abrir');
  });
});

describe('na vitrine', () => {
  test('o site recebe o horário junto do resto do negócio', async () => {
    await db.db.comEmpresa('default', async () => {
      await limpar(db);
      await cenario(db, { jornada: ['09:00', '18:00'] });
    });

    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.equal(corpo.negocio.horarios.length, 7, 'o cenário abre os sete dias');
    assert.deepEqual(corpo.negocio.horarios[0], { dia: 0, abre: '09:00', fecha: '18:00' });
  });

  test('mudar a jornada de alguém muda o horário publicado', async () => {
    await db.db.comEmpresa('default', () => db.db.run(
      `UPDATE staff SET jornada = '{"1":["07:00","22:00"]}' WHERE id = 'p1'`
    ));

    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    const segunda = corpo.negocio.horarios.find(h => h.dia === 1);
    assert.equal(segunda.abre, '07:00', 'sem passar por nenhuma tela de configuração');
    assert.equal(segunda.fecha, '22:00');
  });
});

describe('perguntas frequentes', () => {
  test('saem da config para a vitrine', async () => {
    await db.db.comEmpresa('default', () => db.setConfig({
      faq: [{ pergunta: 'Dói?', resposta: 'Não.' }],
    }));

    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.faq, [{ pergunta: 'Dói?', resposta: 'Não.' }]);
  });

  test('pergunta sem resposta não vai para o site', async () => {
    // Meia entrada na tela deixa quem lê mais inseguro do que antes de
    // perguntar — e é o estado natural de quem começou a escrever e salvou.
    await db.db.comEmpresa('default', () => db.setConfig({
      faq: [
        { pergunta: 'Dói?', resposta: '  ' },
        { pergunta: '', resposta: 'Resposta órfã' },
        { pergunta: 'Quanto dura?', resposta: 'Três semanas.' },
      ],
    }));

    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.faq, [{ pergunta: 'Quanto dura?', resposta: 'Três semanas.' }]);
  });

  test('empresa que não escreveu nenhuma não ganha seção', async () => {
    await db.db.comEmpresa('default', () => db.setConfig({ faq: [] }));
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.faq, []);
  });
});
