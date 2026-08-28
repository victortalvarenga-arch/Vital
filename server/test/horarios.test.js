import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, agendar, bloquear } from './ambiente.js';

/**
 * Motor de horários.
 *
 * É a parte que quebra em silêncio: um erro aqui não derruba nada, só vende um
 * horário que não existe — e a conta chega no balcão, com a cliente na frente.
 * Por isso ele concilia três fontes (jornada, agendamentos, bloqueios) e cada
 * uma tem teste próprio, mais os cruzamentos.
 *
 * Uma sexta-feira distante serve de dia padrão, longe de "hoje": a regra de
 * antecedência mínima só vale para hoje, e usar hoje faria o resultado mudar
 * conforme a hora em que a suíte roda.
 */

const DIA = '2027-03-05';        // sexta-feira
const OUTRO = '2027-03-06';

let db, motor;

before(async () => {
  db = await prepararBanco();
  motor = await import('../src/lib/availability.js');
});
after(async () => { await db.pool.end(); });

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
});

/** Todo teste roda preso à empresa: fora disso o RLS não devolve nada. */
const naEmpresa = fn => db.db.comEmpresa('default', fn);

describe('jornada', () => {
  test('oferece a grade inteira quando o dia está vazio', async () => {
    await naEmpresa(async () => {
      const h = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 });
      // 09:00 às 18:00, serviço de 60 min, grade de 30: último cabível é 17:00.
      assert.equal(h[0], '09:00');
      assert.equal(h.at(-1), '17:00');
      assert.equal(h.length, 17);
    });
  });

  test('não oferece nada em dia sem jornada', async () => {
    await naEmpresa(async () => {
      await db.db.run(`UPDATE staff SET jornada = '{}' WHERE id = 'p1'`);
      const h = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 });
      assert.deepEqual(h, []);
    });
  });

  test('serviço que não cabe antes do fechamento não é oferecido', async () => {
    await naEmpresa(async () => {
      const h = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 540 });
      assert.deepEqual(h, ['09:00']);   // 9h de serviço só cabe começando às 9
    });
  });

  test('profissional inativo não tem horário', async () => {
    await naEmpresa(async () => {
      await db.db.run(`UPDATE staff SET ativo = 0 WHERE id = 'p1'`);
      assert.deepEqual(await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 }), []);
    });
  });
});

describe('agendamentos ocupam', () => {
  test('o horário vendido some da grade', async () => {
    await naEmpresa(async () => {
      await agendar(db, { data: DIA, hora: '10:00' });
      const h = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 });
      assert.ok(!h.includes('10:00'));
    });
  });

  test('some também o encaixe que cairia em cima', async () => {
    await naEmpresa(async () => {
      await agendar(db, { data: DIA, hora: '10:00', duracao: 60 });
      const h = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 });
      // 09:30 terminaria 10:30, invadindo. 11:00 encosta sem sobrepor e vale.
      assert.ok(!h.includes('09:30'), '09:30 invadiria o das 10:00');
      assert.ok(h.includes('11:00'), '11:00 começa quando o outro acaba');
    });
  });

  test('cancelado libera de volta', async () => {
    await naEmpresa(async () => {
      await agendar(db, { data: DIA, hora: '10:00', status: 'cancelado' });
      const h = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 });
      assert.ok(h.includes('10:00'));
    });
  });

  test('a agenda de uma não afeta a da outra', async () => {
    await naEmpresa(async () => {
      await agendar(db, { prof: 'p1', data: DIA, hora: '10:00' });
      const h = await motor.horariosLivres({ staffId: 'p2', data: DIA, duracao: 60 });
      assert.ok(h.includes('10:00'));
    });
  });
});

describe('bloqueios fecham', () => {
  test('o intervalo bloqueado some da grade', async () => {
    await naEmpresa(async () => {
      await bloquear(db, { prof: 'p1', data: DIA, ini: '12:00', fim: '13:00' });
      const h = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 });
      assert.ok(!h.includes('12:00'));
      assert.ok(!h.includes('11:30'), '11:30 terminaria dentro do bloqueio');
      assert.ok(h.includes('13:00'), '13:00 começa quando o bloqueio acaba');
    });
  });

  test('bloqueio sem dono fecha todo mundo', async () => {
    await naEmpresa(async () => {
      await bloquear(db, { prof: null, data: DIA, ini: '00:00', fim: '23:59', motivo: 'feriado' });
      for (const p of ['p1', 'p2']) {
        assert.deepEqual(await motor.horariosLivres({ staffId: p, data: DIA, duracao: 60 }), [],
          `${p} deveria estar fechado no feriado`);
      }
    });
  });

  test('bloqueio de uma não fecha a agenda da outra', async () => {
    await naEmpresa(async () => {
      await bloquear(db, { prof: 'p1', data: DIA, ini: '12:00', fim: '13:00' });
      const h = await motor.horariosLivres({ staffId: 'p2', data: DIA, duracao: 60 });
      assert.ok(h.includes('12:00'));
    });
  });

  test('bloqueio de um dia não vaza para o outro', async () => {
    await naEmpresa(async () => {
      await bloquear(db, { prof: 'p1', data: DIA, ini: '00:00', fim: '23:59' });
      const h = await motor.horariosLivres({ staffId: 'p1', data: OUTRO, duracao: 60 });
      assert.ok(h.length > 0);
    });
  });
});

describe('gravar respeita as mesmas regras', () => {
  test('conflita() acusa horário já vendido', async () => {
    await naEmpresa(async () => {
      await agendar(db, { data: DIA, hora: '10:00' });
      assert.equal(await motor.conflita({ staffId: 'p1', data: DIA, hora: '10:00', duracao: 60 }), true);
    });
  });

  test('conflita() acusa bloqueio — não só agendamento', async () => {
    await naEmpresa(async () => {
      await bloquear(db, { prof: 'p1', data: DIA, ini: '12:00', fim: '13:00' });
      // Sem isto, quem tivesse a página aberta desde antes do bloqueio
      // conseguiria marcar em cima do almoço.
      assert.equal(await motor.conflita({ staffId: 'p1', data: DIA, hora: '12:00', duracao: 60 }), true);
    });
  });

  test('conflita() ignora o próprio agendamento ao remarcar', async () => {
    await naEmpresa(async () => {
      await agendar(db, { data: DIA, hora: '10:00' });
      const id = `a-${DIA}-10:00-p1`;
      assert.equal(
        await motor.conflita({ staffId: 'p1', data: DIA, hora: '10:00', duracao: 60, ignorarId: id }),
        false, 'remarcar para o mesmo lugar não é conflito consigo mesmo'
      );
    });
  });

  test('o que a grade oferece, o gravar aceita', async () => {
    await naEmpresa(async () => {
      await agendar(db, { data: DIA, hora: '10:00' });
      await bloquear(db, { prof: 'p1', data: DIA, ini: '14:00', fim: '15:00' });
      const livres = await motor.horariosLivres({ staffId: 'p1', data: DIA, duracao: 60 });
      for (const hora of livres) {
        assert.equal(
          await motor.conflita({ staffId: 'p1', data: DIA, hora, duracao: 60 }), false,
          `${hora} apareceu como livre mas conflita ao gravar`
        );
      }
    });
  });
});

describe('calendário do mês', () => {
  test('só traz dias dentro do mês pedido', async () => {
    await naEmpresa(async () => {
      const dias = await motor.diasComVaga({ servicoId: 's1', mes: '2027-03' });
      assert.ok(dias.length > 0);
      assert.ok(dias.every(d => d.startsWith('2027-03')));
    });
  });

  test('dia lotado some do calendário', async () => {
    await naEmpresa(async () => {
      // Fecha os dois profissionais o dia inteiro.
      await bloquear(db, { prof: null, data: DIA, ini: '00:00', fim: '23:59' });
      const dias = await motor.diasComVaga({ servicoId: 's1', mes: '2027-03' });
      assert.ok(!dias.includes(DIA));
    });
  });

  test('calendário e grade não divergem', async () => {
    await naEmpresa(async () => {
      await bloquear(db, { prof: 'p1', data: DIA, ini: '00:00', fim: '23:59' });
      await bloquear(db, { prof: 'p2', data: DIA, ini: '00:00', fim: '23:59' });
      const dias = await motor.diasComVaga({ servicoId: 's1', mes: '2027-03' });
      // O que o calendário promete, a grade precisa entregar.
      for (const d of dias.slice(0, 5)) {
        const porProf = await motor.horariosPorServico({ servicoId: 's1', data: d });
        const total = porProf.reduce((n, p) => n + p.horarios.length, 0);
        assert.ok(total > 0, `${d} está no calendário mas não tem horário`);
      }
      assert.ok(!dias.includes(DIA), 'dia fechado para os dois não pode aparecer');
    });
  });

  test('respeita a janela de dias configurada', async () => {
    await naEmpresa(async () => {
      await db.setConfig({ janelaDias: 1 });
      const mes = (await import('../src/lib/dates.js')).hoje().slice(0, 7);
      const dias = await motor.diasComVaga({ servicoId: 's1', mes });
      assert.ok(dias.length <= 2, `janela de 1 dia devolveu ${dias.length} dias`);
    });
  });
});

describe('duração dos adicionais', () => {
  test('extra mais longo reduz os horários oferecidos', async () => {
    await naEmpresa(async () => {
      const sem = await motor.horariosPorServico({ servicoId: 's1', data: DIA });
      const com = await motor.horariosPorServico({ servicoId: 's1', data: DIA, duracaoExtra: 120 });
      const conta = r => r.reduce((n, p) => n + p.horarios.length, 0);
      assert.ok(conta(com) < conta(sem),
        'atendimento mais longo tem de caber em menos lugares');
    });
  });

  test('o intervalo de limpeza entra na conta da duração', async () => {
    await naEmpresa(async () => {
      await limpar(db);
      await cenario(db, { duracao: 60, intervalo: 30 });
      const [{ horarios }] = await motor.horariosPorServico({ servicoId: 's1', data: DIA });
      // 60 de serviço + 30 de limpeza = 90: o último que fecha antes das 18 é
      // 16:30, não 17:00. Se a limpeza sumir da conta, este número sobe.
      assert.equal(horarios.at(-1), '16:30');
    });
  });

  test('a limpeza do atendimento anterior também ocupa', async () => {
    await naEmpresa(async () => {
      await limpar(db);
      await cenario(db, { duracao: 60, intervalo: 30 });
      await agendar(db, { data: DIA, hora: '10:00', duracao: 90 });
      const [{ horarios }] = await motor.horariosPorServico({ servicoId: 's1', data: DIA });
      assert.ok(!horarios.includes('11:00'), '11:00 ainda está dentro da limpeza');
      assert.ok(horarios.includes('11:30'), '11:30 é quando a cadeira volta a valer');
    });
  });

  test('o calendário usa a mesma duração que a grade', async () => {
    await naEmpresa(async () => {
      await limpar(db);
      // Serviço que só cabe uma vez no dia com a limpeza junto, e não cabe
      // nenhuma se a jornada encolher — é onde os dois caminhos divergiriam.
      await cenario(db, { jornada: ['09:00', '10:40'], duracao: 60, intervalo: 30 });
      assert.ok((await motor.diasComVaga({ servicoId: 's1', mes: '2027-03' })).includes(DIA));

      await limpar(db);
      await cenario(db, { jornada: ['09:00', '10:20'], duracao: 60, intervalo: 30 });
      const dias = await motor.diasComVaga({ servicoId: 's1', mes: '2027-03' });
      assert.ok(!dias.includes(DIA), 'sem espaço para a limpeza, o dia não tem vaga');
    });
  });
});
