import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEmpresa, comoAdmin,
} from './ambiente.js';

/**
 * O funil: em qual tela as pessoas somem.
 *
 * Três coisas precisam continuar valendo, e nenhuma delas é óbvia à leitura do
 * código:
 *
 * 1. **Uma visita conta uma vez por passo.** A deduplicação é da chave
 *    primária, não da aplicação — quem recarregar a página dez vezes não vira
 *    dez visitas.
 * 2. **A rota pública não é um depósito.** Etapa fora da lista, sessão com
 *    formato errado e `confirmou` vindo do navegador são ignorados em silêncio.
 * 3. **O back-office vê contagem, nunca linha.** A função da plataforma
 *    atravessa o RLS de propósito; o acordo de devolver só número é o que
 *    mantém o isolamento de pé por dentro da nossa própria tela.
 */

const DIA = '2027-05-10';
let db, api, anonimo, funil;

before(async () => {
  db = await prepararBanco();
  ({ comTaxas: funil } = await import('../src/lib/funil.js'));
  api = await subirApi();
  anonimo = api.anonimo();

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
  // `funil` só cresce: a migration revoga DELETE de `vital_app`, e por isso a
  // limpeza entre testes passa pela conexão de administrador. Se um dia este
  // `comoAdmin` deixar de ser necessário, é porque alguém devolveu o verbo à
  // aplicação — e aí o registro de visita virou coisa que se apaga de dentro.
  await comoAdmin('DELETE FROM funil');
});

/** Uma sessão com a forma que o servidor exige: 32 hexadecimais. */
const sessao = (n = 1) => String(n).padStart(32, '0');

const marcar = (s, etapa) => anonimo('POST', '/api/publico/evento', { sessao: s, etapa });

const contar = () => db.db.comEmpresa('default', () =>
  db.db.all(`SELECT etapa, count(*)::int n FROM funil GROUP BY etapa`));

/**
 * O funil desta empresa, pela função da plataforma.
 *
 * Sempre filtrando por empresa: a função devolve uma linha por tenant, e a
 * ordem é a que o Postgres escolher. Pegar a primeira já fez este arquivo
 * passar por sorte e falhar quando a consulta mudou de plano.
 */
const daPlataforma = async (dias = 30) => {
  const linhas = await db.db.all('SELECT * FROM plataforma.funil_por_empresa(?)', dias);
  return linhas.find(l => l.tenant_id === 'default');
};

describe('gravar um passo', () => {
  test('grava os três passos do navegador', async () => {
    for (const etapa of ['site', 'agendamento', 'horario']) {
      assert.equal((await marcar(sessao(1), etapa)).status, 204);
    }
    const linhas = await contar();
    assert.deepEqual(linhas.map(l => l.etapa).sort(), ['agendamento', 'horario', 'site']);
  });

  test('a mesma visita repetindo o passo continua valendo uma', async () => {
    // O F5 da cliente não pode virar cinco visitas no relatório do dono.
    for (let i = 0; i < 5; i++) await marcar(sessao(1), 'site');
    assert.deepEqual(await contar(), [{ etapa: 'site', n: 1 }]);
  });

  test('visitas diferentes contam separado', async () => {
    await marcar(sessao(1), 'site');
    await marcar(sessao(2), 'site');
    assert.deepEqual(await contar(), [{ etapa: 'site', n: 2 }]);
  });
});

describe('a rota pública não é um depósito', () => {
  test('etapa inventada é ignorada', async () => {
    const r = await marcar(sessao(1), 'comprou_um_carro');
    assert.equal(r.status, 204, 'responde igual, para não ensinar como a validação funciona');
    assert.deepEqual(await contar(), []);
  });

  test('o navegador não pode declarar que confirmou', async () => {
    // `confirmou` é o único passo com consequência — quem o grava é o servidor,
    // junto da criação do agendamento. Aceitar aqui deixaria qualquer um
    // inflar a conversão da empresa.
    await marcar(sessao(1), 'confirmou');
    assert.deepEqual(await contar(), []);
  });

  test('sessão fora do formato é ignorada', async () => {
    for (const s of ['', 'abc', 'x'.repeat(32), sessao(1) + '0', { a: 1 }]) {
      await anonimo('POST', '/api/publico/evento', { sessao: s, etapa: 'site' });
    }
    assert.deepEqual(await contar(), []);
  });

  test('corpo vazio não derruba a rota', async () => {
    assert.equal((await anonimo('POST', '/api/publico/evento', {})).status, 204);
  });
});

describe('confirmou vem do servidor', () => {
  test('agendar pelo site fecha o quarto passo e guarda o agendamento', async () => {
    const r = await anonimo('POST', '/api/publico/agendar', {
      fone: '47900000001', servicoId: 's1', profissionalId: 'p1',
      data: DIA, hora: '10:00', sessao: sessao(7),
    });
    assert.equal(r.status, 201);

    const linhas = await db.db.comEmpresa('default', () =>
      db.db.all(`SELECT etapa, appointment_id FROM funil WHERE sessao = ?`, sessao(7)));
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].etapa, 'confirmou');
    assert.equal(linhas[0].appointment_id, r.corpo.agendamento.id,
      'é o fio que liga a visita ao comparecimento');
  });

  test('agendar sem sessão não quebra nada', async () => {
    // Quem bloqueia `sessionStorage` continua conseguindo marcar horário.
    const r = await anonimo('POST', '/api/publico/agendar', {
      fone: '47900000001', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '11:00',
    });
    assert.equal(r.status, 201);
    assert.deepEqual(await contar(), []);
  });

  test('sessão inventada no corpo do agendamento não entra na tabela', async () => {
    // `/agendar` não passa pela validação de `/evento`: a sessão vem no meio do
    // corpo do agendamento. Quem barra é a conferência dentro de `marcar()`, e
    // sem ela dava para escrever qualquer texto na coluna — o agendamento
    // continuaria funcionando, e a tabela viraria depósito em silêncio.
    const r = await anonimo('POST', '/api/publico/agendar', {
      fone: '47900000001', servicoId: 's1', profissionalId: 'p1',
      data: DIA, hora: '12:00', sessao: 'nao-sou-uma-sessao',
    });
    assert.equal(r.status, 201, 'medição nunca derruba o agendamento');
    assert.deepEqual(await contar(), []);
  });
});

describe('o quinto passo é o comparecimento', () => {
  test('só conta quem confirmou E foi atendido', async () => {
    const marcados = [];
    for (const [i, hora] of ['13:00', '14:00', '15:00'].entries()) {
      const r = await anonimo('POST', '/api/publico/agendar', {
        fone: '47900000001', servicoId: 's1', profissionalId: 'p1',
        data: DIA, hora, sessao: sessao(20 + i),
      });
      marcados.push(r.corpo.agendamento.id);
    }
    // Uma concluída, uma faltou, uma segue agendada.
    await db.db.comEmpresa('default', async () => {
      await db.db.run(`UPDATE appointments SET status = 'concluido' WHERE id = ?`, marcados[0]);
      await db.db.run(`UPDATE appointments SET status = 'faltou' WHERE id = ?`, marcados[1]);
    });

    const linha = await daPlataforma(365);
    assert.equal(Number(linha.confirmou), 3);
    assert.equal(Number(linha.compareceu), 1,
      'faltou e agendado não compareceram — o funil precisa mostrar quem some DEPOIS de marcar');
  });
});

describe('as taxas', () => {
  test('cada passo diz quanto sobrou do topo e do anterior', () => {
    const r = funil({ site: 100, agendamento: 50, horario: 40, confirmou: 10, compareceu: 8 });
    assert.deepEqual(r.passos.map(p => p.doTopo), [100, 50, 40, 10, 8]);
    assert.deepEqual(r.passos.map(p => p.doAnterior), [null, 50, 80, 25, 80]);
  });

  test('aponta a maior perda em gente, não em porcentagem', () => {
    // Do agendamento para o horário perde 40 (80% sobrevivem); do horário para
    // confirmar perde 30 (25% sobrevivem). A porcentagem pior é a segunda, mas
    // é na primeira que há mais gente para recuperar.
    const r = funil({ site: 100, agendamento: 90, horario: 50, confirmou: 20, compareceu: 20 });
    assert.equal(r.maiorQueda.de, 'Abriu o agendamento');
    assert.equal(r.maiorQueda.para, 'Escolheu o horário');
    assert.equal(r.maiorQueda.perdidos, 40);
  });

  test('empresa sem visita nenhuma não divide por zero', () => {
    const r = funil({});
    assert.deepEqual(r.passos.map(p => p.doTopo), [null, null, null, null, null]);
    assert.equal(r.maiorQueda, null);
  });
});

describe('isolamento', () => {
  test('uma empresa não conta a visita da outra', async () => {
    await criarEmpresa(db, { id: 'outra-funil', slug: 'outrafunil', nome: 'Outra', dominio: 'outra-funil.teste' });
    try {
      await db.db.comEmpresa('default', () => marcarDireto(db, sessao(1), 'site'));
      await db.db.comEmpresa('outra-funil', () => marcarDireto(db, sessao(2), 'site'));

      const daOutra = await db.db.comEmpresa('outra-funil', () =>
        db.db.all('SELECT sessao FROM funil'));
      assert.deepEqual(daOutra.map(l => l.sessao), [sessao(2)],
        'quem filtra é o banco, não o código da rota');
    } finally {
      await comoAdmin(`DELETE FROM funil WHERE tenant_id = 'outra-funil'`);
      await comoAdmin(`DELETE FROM plataforma.tenants WHERE id = 'outra-funil'`);
    }
  });

  test('a função da plataforma devolve contagem, e só', async () => {
    await db.db.comEmpresa('default', () => marcarDireto(db, sessao(1), 'site'));
    const linha = await daPlataforma(30);
    assert.deepEqual(Object.keys(linha).sort(),
      ['agendamento', 'compareceu', 'confirmou', 'horario', 'site', 'tenant_id'],
      'coluna nova aqui é coluna que pode vazar dado de cliente — pense duas vezes');
  });

  test('o período recorta: visita velha não entra na conta de 7 dias', async () => {
    await db.db.comEmpresa('default', async () => {
      await db.db.run(
        `INSERT INTO funil (sessao, etapa, data) VALUES (?, 'site', '2020-01-01')`, sessao(9));
      await marcarDireto(db, sessao(1), 'site');
    });
    const linha = await daPlataforma(7);
    assert.equal(Number(linha.site), 1);
  });
});

/** Insere direto, sem passar pela rota — para testar o banco, não o HTTP. */
const marcarDireto = (db, s, etapa) => db.db.run(
  `INSERT INTO funil (sessao, etapa, data) VALUES (?,?, to_char(now(), 'YYYY-MM-DD'))`, s, etapa
);
