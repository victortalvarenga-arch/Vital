import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, agendar, criarEmpresa, comoAdmin } from './ambiente.js';

/**
 * A fila de WhatsApp.
 *
 * É o único código do projeto que **roda sozinho e alcança gente de verdade**:
 * o cron chama, e a mensagem sai para o telefone da cliente de um cliente
 * nosso. Um defeito aqui não aparece em tela nenhuma — aparece no celular de
 * alguém, e o que se manda não volta.
 *
 * Três coisas que estes testes seguram, e que são as que doem:
 *
 *  - **Não mandar duas vezes.** `gerarFila` roda a cada dez minutos; sem a
 *    deduplicação, seriam seis lembretes por hora para a mesma pessoa.
 *  - **Não mandar para quem não quer.** Aniversário e reativação são marketing
 *    e dependem de `optin`; lembrete e confirmação são transacionais e não.
 *    Trocar isso é infração de LGPD, não bug de tela.
 *  - **Não mandar para quem não vem.** Cancelado não recebe lembrete.
 */

const EMPRESA_B = 'empresa-fila';

let db, fila, datas;

before(async () => {
  db = await prepararBanco();
  fila = await import('../src/jobs/mensagens.js');
  datas = await import('../src/lib/dates.js');
  const { prepararEmpresaPadrao } = await import('../src/lib/provisionar.js');

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  // Os textos: sem template ativo, a fila não enfileira nada e todo teste
  // passaria por vazio.
  await prepararEmpresaPadrao('default');
});

after(async () => {
  // A empresa criada aqui não pode sobrar: os testes da plataforma contam
  // empresas, e uma a mais quebraria a contagem deles por culpa deste arquivo.
  await comoAdmin(`DELETE FROM messages   WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM appointments WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM service_staff WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM services   WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM clients    WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM staff      WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM templates  WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM logs       WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM plataforma.auditoria WHERE tenant_id = $1`, EMPRESA_B);
  await comoAdmin(`DELETE FROM plataforma.tenants   WHERE id = $1`, EMPRESA_B);
  await db.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run(`UPDATE clients SET optin = 1, nascimento = NULL`);
  });
});

const na = fn => db.db.comEmpresa('default', fn);
const hoje = () => datas.hoje();
const dia = n => datas.addDias(hoje(), n);

/** As mensagens pendentes, por chave de template. */
const pendentes = () => db.db.all(
  `SELECT template_chave, fone, texto, agendado_para, status
     FROM messages ORDER BY template_chave`
);
const chaves = async () => (await pendentes()).map(m => m.template_chave);

describe('lembrete da véspera', () => {
  test('sai para quem tem horário amanhã', async () => {
    await na(async () => {
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      assert.deepEqual(await chaves(), ['lembrete_vespera']);
    });
  });

  test('não sai para horário de depois de amanhã', async () => {
    await na(async () => {
      await agendar(db, { data: dia(2), hora: '10:00' });
      await fila.gerarFila();
      assert.deepEqual(await chaves(), []);
    });
  });

  test('cancelado não recebe lembrete', async () => {
    // Mandar "te espero amanhã" para quem cancelou é o erro que a cliente
    // conta para as amigas.
    await na(async () => {
      await agendar(db, { data: dia(1), hora: '10:00', status: 'cancelado' });
      await fila.gerarFila();
      assert.deepEqual(await chaves(), []);
    });
  });

  test('sai no horário que a empresa configurou', async () => {
    await na(async () => {
      await db.setConfig({ horaLembreteVespera: '20:30' });
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      const [m] = await pendentes();
      assert.equal(m.agendado_para, `${hoje()} 20:30`);
      await db.setConfig({ horaLembreteVespera: '18:00' });
    });
  });
});

describe('aviso no dia', () => {
  test('sai as horas configuradas antes do horário', async () => {
    await na(async () => {
      await db.setConfig({ horasAvisoNoDia: 3 });
      await agendar(db, { data: hoje(), hora: '15:00' });
      await fila.gerarFila();
      const m = (await pendentes()).find(x => x.template_chave === 'lembrete_dia');
      assert.equal(m.agendado_para, `${hoje()} 12:00`);
    });
  });

  test('horário de madrugada não gera aviso em hora negativa', async () => {
    // 01:00 menos três horas cairia no dia anterior — a mensagem simplesmente
    // não é enfileirada, em vez de virar '−02:00' e ficar pendente para sempre.
    await na(async () => {
      await db.setConfig({ horasAvisoNoDia: 3 });
      await agendar(db, { data: hoje(), hora: '01:00' });
      await fila.gerarFila();
      assert.ok(!(await chaves()).includes('lembrete_dia'));
    });
  });
});

describe('pós-atendimento', () => {
  test('sai um dia depois, e só para quem foi atendido', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-1), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(-1), hora: '14:00', status: 'falta' });
      await fila.gerarFila();
      const pos = (await pendentes()).filter(m => m.template_chave === 'pos_atendimento');
      assert.equal(pos.length, 1, 'quem faltou não recebe "como foi?"');
    });
  });
});

describe('marketing depende de consentimento', () => {
  const fazerAniversariar = () => na(() => db.db.run(
    `UPDATE clients SET nascimento = ? WHERE id = 'c1'`,
    '1990-' + dia(7).slice(5)
  ));

  test('aniversário sai para quem aceitou receber', async () => {
    await fazerAniversariar();
    await na(async () => {
      await fila.gerarFila();
      assert.ok((await chaves()).includes('aniversario'));
    });
  });

  test('e NÃO sai para quem desligou o optin', async () => {
    // LGPD: marketing só com consentimento. Não é preferência de produto.
    await fazerAniversariar();
    await na(async () => {
      await db.db.run(`UPDATE clients SET optin = 0`);
      await fila.gerarFila();
      assert.ok(!(await chaves()).includes('aniversario'));
    });
  });

  test('mas o lembrete transacional continua saindo sem optin', async () => {
    // Confirmar um horário que a própria pessoa marcou não é marketing —
    // travar isso junto deixaria a cliente sem saber que tem hora marcada.
    await na(async () => {
      await db.db.run(`UPDATE clients SET optin = 0`);
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      assert.deepEqual(await chaves(), ['lembrete_vespera']);
    });
  });

  test('reativação respeita a janela, e o optin', async () => {
    await na(async () => {
      await db.setConfig({ diasReativacao: 60 });

      // Sumiu há 70 dias: dentro da janela de 60 a 120.
      await agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      assert.ok((await chaves()).includes('reativacao'));

      await limparAgenda(db);
      // Sumiu há 200 dias: fora da janela. Não se persegue quem foi embora.
      await agendar(db, { data: dia(-200), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      assert.ok(!(await chaves()).includes('reativacao'));
    });
  });
});

describe('não mandar duas vezes', () => {
  test('rodar a fila cem vezes gera uma mensagem só', async () => {
    // O cron chama a cada dez minutos. Sem a deduplicação seriam seis
    // lembretes por hora para a mesma pessoa.
    await na(async () => {
      await agendar(db, { data: dia(1), hora: '10:00' });
      for (let i = 0; i < 5; i++) await fila.gerarFila();
      assert.equal((await pendentes()).length, 1);
    });
  });

  test('a confirmação do agendamento também não repete', async () => {
    await na(async () => {
      await agendar(db, { data: dia(3), hora: '10:00' });
      const a = await db.db.get(`SELECT * FROM appointments LIMIT 1`);
      assert.equal(await fila.enfileirarConfirmacao(a), true);
      assert.equal(await fila.enfileirarConfirmacao(a), false, 'a segunda não entra');
      assert.equal((await pendentes()).length, 1);
    });
  });

  test('aniversário é uma vez por ano, não por dia', async () => {
    await na(async () => {
      await db.db.run(`UPDATE clients SET nascimento = ? WHERE id = 'c1'`, '1990-' + dia(7).slice(5));
      await fila.gerarFila();
      await fila.gerarFila();
      assert.equal((await pendentes()).filter(m => m.template_chave === 'aniversario').length, 1);
    });
  });
});

describe('a mensagem em si', () => {
  test('sai com o nome da cliente e da empresa no lugar das variáveis', async () => {
    await na(async () => {
      await db.setConfig({ nome: 'Estúdio Teste' });
      await db.db.run(`UPDATE clients SET nome = 'Marina Costa' WHERE id = 'c1'`);
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();

      const [m] = await pendentes();
      assert.match(m.texto, /Marina/);
      assert.ok(!m.texto.includes('{cliente}'), 'nenhuma variável sobrou no texto');
      assert.ok(!/\{\w+\}/.test(m.texto));
      assert.equal(m.fone, '47900000001');
    });
  });

  test('cliente sem telefone não entra na fila', async () => {
    await na(async () => {
      await db.db.run(`UPDATE clients SET fone = '' WHERE id = 'c1'`);
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      assert.deepEqual(await chaves(), []);
      await db.db.run(`UPDATE clients SET fone = '47900000001' WHERE id = 'c1'`);
    });
  });

  test('template desligado para de gerar mensagem', async () => {
    await na(async () => {
      await db.db.run(`UPDATE templates SET ativo = 0 WHERE chave = 'lembrete_vespera'`);
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      assert.deepEqual(await chaves(), []);
      await db.db.run(`UPDATE templates SET ativo = 1 WHERE chave = 'lembrete_vespera'`);
    });
  });
});

describe('despachar', () => {
  test('no modo manual não envia nada e a fila continua lá', async () => {
    // É o modo de hoje: a fila vira uma lista de links que o atendente clica.
    // Despachar não pode consumir a fila sem ter entregue nada.
    await na(async () => {
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();

      const r = await fila.despachar();
      assert.deepEqual(r, { enviadas: 0, modo: 'manual' });
      assert.equal((await pendentes())[0].status, 'pendente');
    });
  });
});

describe('uma empresa não recebe a fila da outra', () => {
  test('a mensagem gerada fica na empresa que a gerou', async () => {
    await criarEmpresa(db, { id: EMPRESA_B, slug: 'fila-b', nome: 'Outra' });
    await db.db.comEmpresa(EMPRESA_B, async () => {
      await limpar(db);
      // Prefixo próprio: a chave primária é global, e 'b-' já é de outro arquivo.
      await cenario(db, { prefixo: 'fb-' });
    });
    // Os textos vão DEPOIS de `limpar`, que apaga a tabela de templates junto
    // com o resto — instalar antes seria instalar e apagar.
    const { prepararEmpresaPadrao } = await import('../src/lib/provisionar.js');
    await prepararEmpresaPadrao(EMPRESA_B);

    await db.db.comEmpresa(EMPRESA_B, async () => {
      await agendar(db, { prof: 'fb-p1', data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      assert.equal((await pendentes()).length, 1);
    });

    await na(async () => {
      // A empresa padrão não tem agendamento amanhã neste teste.
      assert.deepEqual(await pendentes(), [],
        'o cron roda empresa por empresa, com a conexão presa a cada uma');
    });
  });
});
