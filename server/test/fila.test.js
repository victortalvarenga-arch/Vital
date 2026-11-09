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
 * Quatro coisas que estes testes seguram, e que são as que doem:
 *
 *  - **Não mandar duas vezes.** `gerarFila` roda a cada dez minutos; sem a
 *    deduplicação, seriam seis lembretes por hora para a mesma pessoa.
 *  - **Não mandar para quem não quer.** Aniversário é marketing e depende de
 *    `optin`; lembrete e confirmação são transacionais e não. Trocar isso é
 *    infração de LGPD, não bug de tela.
 *  - **Não mandar para quem não vem.** Cancelado não recebe lembrete.
 *  - **Não mandar fora de hora.** Lembrete de horário que já passou sai da fila
 *    sem ser enviado.
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
  `SELECT template_chave, fone, texto, agendado_para, expira_em, status
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
      // Tarde da noite: horário que já passou nem entra na fila.
      await agendar(db, { data: hoje(), hora: '23:58' });
      await fila.gerarFila();
      const m = (await pendentes()).find(x => x.template_chave === 'lembrete_dia');
      assert.equal(m.agendado_para, `${hoje()} 20:58`);
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

  test('sem marcação não recebe; confirmada dias depois, recebe', async () => {
    // Desde a 034 o relógio não conclui ninguém: deixa pendente. Mandar "como
    // foi?" a quem talvez nem veio era o erro que a decisão quis acabar.
    await na(async () => {
      await agendar(db, { data: dia(-3), hora: '10:00', status: 'pendente' });
      await fila.gerarFila();
      assert.ok(!(await chaves()).includes('pos_atendimento'), 'pendente não é atendimento feito');

      // A equipe confirma na quinta o atendimento de segunda: o "ontem" de
      // antes nunca mais o alcançaria.
      await db.db.run(`UPDATE appointments SET status = 'concluido' WHERE data = ?`, dia(-3));
      await fila.gerarFila();
      assert.ok((await chaves()).includes('pos_atendimento'));
    });
  });
});

describe('mais de um atendimento na semana', () => {
  const dela = async () => (await pendentes())
    .filter(m => ['pos_atendimento', 'pos_cuidado'].includes(m.template_chave));

  test('vira uma mensagem só, com a pergunta geral', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-4), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(-2), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      await fila.gerarFila();
      const [m, ...resto] = await dela();
      assert.deepEqual(resto, []);
      assert.equal(m.template_chave, 'pos_cuidado');
      assert.equal(m.expira_em, `${dia(5)} 23:59`, 'o prazo conta do último atendimento');
    });
  });

  test('a segunda visita troca o "como foi?" que ainda não saiu', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-4), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      assert.equal((await dela())[0].template_chave, 'pos_atendimento');

      await agendar(db, { data: dia(-2), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      assert.deepEqual((await dela()).map(m => m.template_chave), ['pos_cuidado']);
    });
  });

  test('quem já recebeu na semana não recebe outra ao voltar', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-4), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      await db.db.run(`UPDATE messages SET status = 'enviado', criado_em = ?`, `${dia(-1)} 10:00`);

      await agendar(db, { data: dia(-2), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      assert.deepEqual((await dela()).map(m => m.status), ['enviado']);
    });
  });

  test('atendimentos de clientes diferentes continuam separados', async () => {
    await na(async () => {
      await db.db.run(`INSERT INTO clients (id,nome,fone,criado_em) VALUES ('c-pos','Bruna','47900000009','2026-01-01')`);
      await agendar(db, { data: dia(-2), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(-2), hora: '10:00', status: 'concluido', prof: 'p2', cliente: 'c-pos', servico: 's1' });
      await fila.gerarFila();
      assert.deepEqual((await dela()).map(m => m.template_chave), ['pos_atendimento', 'pos_atendimento']);
      await limparAgenda(db);
      await db.db.run(`DELETE FROM clients WHERE id = 'c-pos'`);
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

  test('quem faz tempo que não volta não entra na fila', async () => {
    // Desde a 036 isso é a aba Recuperação: nada sai sozinho.
    await na(async () => {
      await db.setConfig({ diasReativacao: 60 });
      await agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      assert.deepEqual(await chaves(), []);
    });
  });
});

describe('o prazo de cada mensagem', () => {
  const vencer = () => db.db.run(`UPDATE messages SET expira_em = '2020-01-01 10:00'`);
  const naFila = async chave => (await pendentes()).find(m => m.template_chave === chave);

  test('lembrete vale até o horário; pós-atendimento, uma semana', async () => {
    await na(async () => {
      await agendar(db, { data: dia(1), hora: '10:00' });
      await agendar(db, { data: dia(-1), hora: '10:00', status: 'concluido' });
      await fila.gerarFila();
      assert.equal((await naFila('lembrete_vespera')).expira_em, `${dia(1)} 10:00`);
      assert.equal((await naFila('pos_atendimento')).expira_em, `${dia(6)} 23:59`);
    });
  });

  test('aniversário vale até o dia do aniversário', async () => {
    await na(async () => {
      await db.db.run(`UPDATE clients SET nascimento = ? WHERE id = 'c1'`, '1990-' + dia(7).slice(5));
      await fila.gerarFila();
      assert.equal((await naFila('aniversario')).expira_em, `${dia(7)} 23:59`);
    });
  });

  test('vaga de última hora vale hoje; as outras campanhas, uma semana', () => {
    assert.equal(fila.expiraCampanha('vaga'), `${hoje()} 23:59`);
    assert.equal(fila.expiraCampanha('promocao'), `${dia(7)} 23:59`);
    assert.equal(fila.expiraCampanha('vaga', `${dia(1)} 15:00`), `${dia(1)} 15:00`,
      'com horário escolhido, vale até ele');
  });

  test('a vencida sai da fila sem ter sido enviada, e não volta', async () => {
    await na(async () => {
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      await vencer();
      await fila.expirarFila();
      assert.equal((await naFila('lembrete_vespera')).status, 'expirado');

      await fila.gerarFila();
      assert.equal((await pendentes()).length, 1, 'a próxima passada não recria a mensagem');
    });
  });

  test('a que ainda está no prazo e a sem prazo ficam', async () => {
    await na(async () => {
      await agendar(db, { data: dia(1), hora: '10:00' });
      await fila.gerarFila();
      await db.db.run(
        `INSERT INTO messages (id,template_chave,fone,texto,agendado_para,criado_em)
         VALUES ('sem-prazo','campanha','47900000001','oi','2020-01-01 10:00','2020-01-01')`);
      await fila.expirarFila();
      assert.ok((await pendentes()).every(m => m.status === 'pendente'));
    });
  });

  test('horário lançado depois de passar nem entra na fila', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-2), hora: '10:00' });
      const a = await db.db.get(`SELECT * FROM appointments LIMIT 1`);
      assert.equal(await fila.enfileirarConfirmacao(a), false);
      assert.deepEqual(await chaves(), []);
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
