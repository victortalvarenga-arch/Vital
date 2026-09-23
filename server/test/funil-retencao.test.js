import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, comoAdmin } from './ambiente.js';

/**
 * A compactação do funil: o dia vira uma linha de contagens e o cru sai.
 *
 * O que este arquivo protege, e nenhuma das três coisas é óbvia à leitura:
 *
 * 1. **A conta não muda.** Compactar é uma troca de armazenamento, não de
 *    número: a tela tem de mostrar exatamente o mesmo antes e depois.
 * 2. **Dia com agendamento no futuro NÃO fecha.** `compareceu` vem do status
 *    do agendamento, e status muda depois — fechar cedo congelaria para sempre
 *    um comparecimento que ainda ia acontecer.
 * 3. **Nada é apagado sem ter sido somado.** O DELETE só alcança o par
 *    (empresa, dia) que já está no resumo.
 */

const HOJE = () => new Date().toISOString().slice(0, 10);
const diasAtras = n => {
  const d = new Date(`${HOJE()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const daquiA = n => diasAtras(-n);

let db, api, compactar, funilDaEmpresa;

before(async () => {
  db = await prepararBanco();
  ({ compactarFunil: compactar } = await import('../src/jobs/funil.js'));
  ({ funilDaEmpresa } = await import('../src/lib/funil.js'));
  api = await subirApi();

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
  await comoAdmin('DELETE FROM funil');
  await comoAdmin('DELETE FROM funil_diario');
});

const sessao = n => String(n).padStart(32, '0');

/** Grava um passo direto, com a data que o teste quiser. */
const visita = (s, etapa, data, appointmentId = null) => db.db.run(
  `INSERT INTO funil (sessao, etapa, data, appointment_id) VALUES (?,?,?,?)`,
  s, etapa, data, appointmentId
);

const cru = () => db.db.comEmpresa('default', () =>
  db.db.get('SELECT count(*)::int n FROM funil'));
const resumo = () => db.db.comEmpresa('default', () =>
  db.db.all('SELECT * FROM funil_diario ORDER BY data'));
const daPlataforma = async () => {
  const linhas = await db.db.all('SELECT * FROM plataforma.funil_por_empresa(365)');
  return linhas.find(l => l.tenant_id === 'default');
};

describe('o dia antigo vira uma linha', () => {
  test('soma as contagens e apaga o cru', async () => {
    const velho = diasAtras(120);
    await db.db.comEmpresa('default', async () => {
      await visita(sessao(1), 'site', velho);
      await visita(sessao(2), 'site', velho);
      await visita(sessao(1), 'agendamento', velho);
    });

    const r = await compactar();
    assert.equal(r.dias, 1);
    assert.equal(r.linhas, 3);

    assert.equal((await cru()).n, 0, 'o cru do dia fechado sai');
    const [linha] = await resumo();
    assert.equal(linha.data, velho);
    assert.equal(Number(linha.site), 2);
    assert.equal(Number(linha.agendamento), 1);
  });

  test('a conta da tela não muda ao compactar', async () => {
    // O ponto inteiro: compactar é troca de armazenamento, não de número.
    const velho = diasAtras(100);
    await db.db.comEmpresa('default', async () => {
      for (let i = 1; i <= 9; i++) await visita(sessao(i), 'site', velho);
      for (let i = 1; i <= 4; i++) await visita(sessao(i), 'agendamento', velho);
      for (let i = 1; i <= 2; i++) await visita(sessao(i), 'horario', velho);
    });

    const antes = await daPlataforma();
    const antesDaEmpresa = await db.db.comEmpresa('default', () => funilDaEmpresa({ dias: 365 }));
    await compactar();
    const depois = await daPlataforma();
    const depoisDaEmpresa = await db.db.comEmpresa('default', () => funilDaEmpresa({ dias: 365 }));

    assert.deepEqual(depois, antes, 'a função da plataforma soma cru e resumo');
    assert.deepEqual(
      depoisDaEmpresa.passos.map(p => p.total),
      antesDaEmpresa.passos.map(p => p.total),
      'a leitura da empresa também — as duas precisam ler os dois lugares'
    );
  });

  test('dia recente não é tocado', async () => {
    await db.db.comEmpresa('default', () => visita(sessao(1), 'site', diasAtras(3)));
    const r = await compactar();
    assert.equal(r.dias, 0);
    assert.equal((await cru()).n, 1, 'a tela oferece até 90 dias: o recente fica inteiro');
    assert.deepEqual(await resumo(), []);
  });
});

describe('o dia só fecha quando o comparecimento parou de mudar', () => {
  /** Uma visita antiga que confirmou um agendamento em `dataDoAtendimento`. */
  async function visitaComAgendamento(dataDoAtendimento, status = 'agendado') {
    const velho = diasAtras(120);
    await db.db.comEmpresa('default', async () => {
      await db.db.run(
        `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,criado_em)
         VALUES ('ap-ret','c1','s1','p1',?, '10:00', 60, 100, ?, '2026-01-01')`,
        dataDoAtendimento, status
      );
      await visita(sessao(1), 'site', velho);
      await visita(sessao(1), 'confirmou', velho, 'ap-ret');
    });
    return velho;
  }

  test('agendamento no futuro segura o dia inteiro no cru', async () => {
    // Este é o erro que a regra evita: fechar agora gravaria "compareceu: 0"
    // para sempre, e o atendimento ainda vai acontecer.
    await visitaComAgendamento(daquiA(20));

    const r = await compactar();
    assert.equal(r.dias, 0, 'o dia espera, mesmo sendo mais velho que a retenção');
    assert.equal((await cru()).n, 2, 'nem a linha de "site" sai — o dia é fechado inteiro ou nada');
  });

  test('passado o atendimento, o dia fecha com o número certo', async () => {
    await visitaComAgendamento(diasAtras(5), 'concluido');

    await compactar();
    const [linha] = await resumo();
    assert.equal(Number(linha.confirmou), 1);
    assert.equal(Number(linha.compareceu), 1, 'o status já é final, e foi congelado certo');
  });

  test('quem faltou fecha com compareceu zero', async () => {
    await visitaComAgendamento(diasAtras(5), 'faltou');
    await compactar();
    const [linha] = await resumo();
    assert.equal(Number(linha.confirmou), 1);
    assert.equal(Number(linha.compareceu), 0);
  });
});

describe('nada é apagado sem ter sido somado', () => {
  test('rodar duas vezes não duplica nem perde', async () => {
    const velho = diasAtras(120);
    await db.db.comEmpresa('default', async () => {
      await visita(sessao(1), 'site', velho);
      await visita(sessao(2), 'site', velho);
    });

    await compactar();
    const primeiro = await daPlataforma();
    const segunda = await compactar();

    assert.equal(segunda.dias, 0, 'não há mais o que fechar');
    assert.deepEqual(await daPlataforma(), primeiro, 'e a conta continua a mesma');
    assert.equal((await resumo()).length, 1, 'uma linha por dia, não duas');
  });

  test('a aplicação não consegue apagar o cru por fora', async () => {
    // A única porta que apaga visita é a função de compactação, que só apaga o
    // que já somou. Se este teste passar a falhar, alguém devolveu DELETE à
    // aplicação e o registro de visita virou coisa que se apaga de dentro.
    await db.db.comEmpresa('default', () => visita(sessao(1), 'site', diasAtras(120)));
    await assert.rejects(
      () => db.db.comEmpresa('default', () => db.db.run('DELETE FROM funil')),
      /permiss/i
    );
    await assert.rejects(
      () => db.db.comEmpresa('default', () => db.db.run(`UPDATE funil SET etapa = 'site'`)),
      /permiss/i
    );
  });
});

describe('isolamento', () => {
  test('compactar a plataforma inteira não mistura empresa', async () => {
    const velho = diasAtras(120);
    await db.db.comEmpresa('default', () => visita(sessao(1), 'site', velho));
    await comoAdmin(
      `INSERT INTO funil (tenant_id, sessao, etapa, data) VALUES ('default', $1, 'site', $2)`,
      sessao(2), velho
    );

    await compactar();
    const linhas = await resumo();
    assert.equal(linhas.length, 1);
    assert.equal(Number(linhas[0].site), 2, 'as duas visitas da MESMA empresa somaram');
  });
});
