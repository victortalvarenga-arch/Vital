import 'dotenv/config';
import pg from 'pg';

/**
 * Banco de teste, separado do de desenvolvimento.
 *
 * Os testes apagam e recriam dados a cada arquivo. Apontar para o banco de
 * trabalho significaria perder o catálogo e a agenda toda vez que alguém
 * rodasse `npm test` — e alguém vai rodar sem pensar. O nome do banco leva
 * `_teste` no fim e o módulo recusa rodar se a URL não terminar assim.
 *
 * É banco de verdade, não simulação: o motor de horários concilia jornada,
 * agendamentos e bloqueios em SQL, e simular o banco testaria o simulador.
 */

const url = new URL(process.env.DATABASE_ADMIN_URL || '');
const NOME = (url.pathname.slice(1) || 'vital') + '_teste';

function comBanco(base, nome) {
  const u = new URL(base);
  u.pathname = '/' + nome;
  return u.toString();
}

/** Cria o banco de teste se não existir. Roda uma vez, antes de tudo. */
async function garantirBanco() {
  const manutencao = new pg.Pool({ connectionString: comBanco(url, 'postgres'), ssl: false });
  try {
    const { rows } = await manutencao.query('SELECT 1 FROM pg_database WHERE datname = $1', [NOME]);
    // CREATE DATABASE não aceita parâmetro; o nome vem do .env, não de fora.
    if (!rows.length) await manutencao.query(`CREATE DATABASE "${NOME}"`);
  } finally {
    await manutencao.end();
  }
}

/**
 * Prepara o ambiente e devolve os módulos já apontados para o banco de teste.
 *
 * As variáveis precisam ser trocadas ANTES de importar `db.js`, que lê a URL
 * na carga do módulo. Por isso o import é dinâmico.
 */
export async function prepararBanco() {
  await garantirBanco();

  const adminTeste = comBanco(process.env.DATABASE_ADMIN_URL, NOME);
  const appTeste = comBanco(process.env.DATABASE_URL, NOME);
  if (!adminTeste.endsWith('_teste')) {
    throw new Error('recusando rodar: a URL de teste não termina em _teste');
  }

  process.env.DATABASE_ADMIN_URL = adminTeste;
  process.env.DATABASE_URL = appTeste;

  const db = await import('../src/db.js');
  await db.iniciarBanco();
  return db;
}

/**
 * Zera as tabelas de negócio entre testes.
 *
 * DELETE, e não TRUNCATE: `vital_app` só recebeu SELECT, INSERT, UPDATE e
 * DELETE — de propósito. E TRUNCATE ignora RLS, então apagaria também o que é
 * de outra empresa. A ordem abaixo é a das chaves estrangeiras, de folha para
 * raiz; tabela nova entra no lugar certo.
 */
const TABELAS = [
  'appointment_addons', 'appointments', 'blocks', 'messages',
  'service_addons', 'category_addons', 'service_staff',
  'users', 'services', 'clients', 'staff', 'units', 'templates',
];

export async function limpar(db) {
  for (const t of TABELAS) await db.db.run(`DELETE FROM ${t}`);
}

/**
 * Cenário mínimo e previsível.
 *
 * Números redondos de propósito: jornada das 9 às 18, serviço de 60 min sem
 * intervalo, grade de 30 min. Assim a conta esperada de cada teste é óbvia à
 * leitura, e um resultado errado aponta o bug em vez de levantar dúvida sobre
 * a aritmética do próprio teste.
 */
export async function cenario(db, { jornada, duracao = 60, intervalo = 0, passo = 30 } = {}) {
  const dias = {};
  for (let d = 0; d <= 6; d++) dias[d] = jornada || ['09:00', '18:00'];

  await db.setConfig({ passoAgenda: passo, antecedenciaHoras: 0, janelaDias: 365 });

  await db.db.run(
    `INSERT INTO staff (id,nome,jornada,ativo,criado_em) VALUES (?,?,?,1,?)`,
    'p1', 'Ana', JSON.stringify(dias), '2026-01-01'
  );
  await db.db.run(
    `INSERT INTO staff (id,nome,jornada,ativo,criado_em) VALUES (?,?,?,1,?)`,
    'p2', 'Bia', JSON.stringify(dias), '2026-01-01'
  );
  await db.db.run(
    `INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem)
     VALUES (?,?,?,?,?,?,1,0)`,
    's1', 'Corte', 'Cabelo', 100, duracao, intervalo
  );
  await db.salvarVinculos('s1', ['p1', 'p2']);

  await db.db.run(
    `INSERT INTO clients (id,nome,fone,criado_em) VALUES (?,?,?,?)`,
    'c1', 'Cliente Um', '47900000001', '2026-01-01'
  );
}

/** Ocupa um horário, como um agendamento faria. */
export const agendar = (db, { prof = 'p1', data, hora, duracao = 60, status = 'agendado' }) =>
  db.db.run(
    `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    `a-${data}-${hora}-${prof}`, 'c1', 's1', prof, data, hora, duracao, 100, status, '2026-01-01'
  );

/** Fecha um intervalo. `prof` nulo fecha a empresa toda. */
export const bloquear = (db, { prof = null, data, ini, fim, motivo = 'teste' }) =>
  db.db.run(
    `INSERT INTO blocks (id,staff_id,data,hora_ini,hora_fim,motivo,criado_em)
     VALUES (?,?,?,?,?,?,?)`,
    `b-${data}-${ini}-${prof || 'todos'}`, prof, data, ini, fim, motivo, '2026-01-01'
  );
