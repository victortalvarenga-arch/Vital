import pg from 'pg';
import { migrar } from './lib/migrate.js';
import { contexto, conexaoAtual } from './lib/contexto.js';
import { TENANT_PADRAO, comPadroes } from './lib/tenant.js';

const { Pool, types } = pg;

/* ------------------------------------------------------------------ *
 * Tipos: o pg devolve alguns números como texto por padrão
 * ------------------------------------------------------------------ */
// NUMERIC vira string porque em JS nem todo decimal cabe num float sem perda.
// Aqui os valores são preço e comissão de um agendamento — nunca chegam perto
// do limite — e o resto do sistema já os trata como número.
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
// COUNT() devolve BIGINT, que também vira string. Mesma história.
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Postgres gerenciado (Neon, Supabase) exige TLS; o local não tem certificado.
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')
    ? false
    : { rejectUnauthorized: false },
});

pool.on('error', erro => {
  // Conexão ociosa que cai não deve derrubar o processo inteiro: o pool abre
  // outra na próxima consulta.
  console.error('[db] conexão ociosa caiu:', erro.message);
});

/* ------------------------------------------------------------------ *
 * Acesso
 * ------------------------------------------------------------------ */

/**
 * O SQLite usa `?` como marcador de parâmetro; o Postgres usa `$1`, `$2`.
 * Traduzir aqui deixou as consultas do projeto inteiro intactas na troca de
 * motor — e `?` continua sendo mais legível quando são seis parâmetros.
 *
 * Só troca os `?` fora de texto entre aspas, senão um valor literal contendo
 * interrogação viraria parâmetro.
 */
function traduzirMarcadores(sql) {
  let n = 0;
  let dentroDeTexto = false;
  let saida = '';

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") dentroDeTexto = !dentroDeTexto;
    saida += (c === '?' && !dentroDeTexto) ? `$${++n}` : c;
  }
  return saida;
}

/**
 * Onde a consulta vai sair: a conexão da requisição, se houver uma, senão o
 * pool. É isto que faz o RLS valer — a conexão da requisição é a única que tem
 * `app.tenant_id` definido.
 */
const executor = () => conexaoAtual() || pool;

export const db = {
  /** Uma linha só, ou undefined. */
  async get(sql, ...params) {
    const { rows } = await executor().query(traduzirMarcadores(sql), params);
    return rows[0];
  },

  /** Todas as linhas. */
  async all(sql, ...params) {
    const { rows } = await executor().query(traduzirMarcadores(sql), params);
    return rows;
  },

  /** Escrita. Devolve quantas linhas foram afetadas. */
  async run(sql, ...params) {
    const r = await executor().query(traduzirMarcadores(sql), params);
    return r.rowCount;
  },

  /**
   * Várias escritas que precisam valer como uma só. Recebe uma função que
   * ganha um cliente com a mesma interface — usar `db` lá dentro sairia da
   * transação e é justamente o que não pode acontecer.
   */
  async transacao(fn) {
    // Dentro de uma requisição, a transação PRECISA usar a conexão dela: uma
    // conexão nova do pool viria sem `app.tenant_id` e o RLS esconderia tudo.
    const daRequisicao = conexaoAtual();
    const cliente = daRequisicao || await pool.connect();
    try {
      await cliente.query('BEGIN');
      const tx = {
        get: async (sql, ...p) => (await cliente.query(traduzirMarcadores(sql), p)).rows[0],
        all: async (sql, ...p) => (await cliente.query(traduzirMarcadores(sql), p)).rows,
        run: async (sql, ...p) => (await cliente.query(traduzirMarcadores(sql), p)).rowCount,
      };
      const resultado = await fn(tx);
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw erro;
    } finally {
      if (!daRequisicao) cliente.release();
    }
  },

  /**
   * Roda `fn` com a conexão presa a uma empresa. Todas as consultas lá dentro
   * enxergam só o que é dela.
   *
   * Fora de uma requisição HTTP — nos jobs de cron, no seed — é a única forma
   * de escrever qualquer coisa: sem empresa definida, o default de `tenant_id`
   * vira NULL e o NOT NULL derruba a gravação.
   */
  async comEmpresa(tenantId, fn) {
    const cliente = await pool.connect();
    try {
      // set_config em vez de SET porque aceita parâmetro; concatenar o id na
      // string seria injeção de SQL esperando acontecer.
      await cliente.query('SELECT set_config($1, $2, false)', ['app.tenant_id', tenantId]);
      return await contexto.run({ cliente, tenantId }, fn);
    } finally {
      // Sem isto, a conexão volta ao pool marcada com esta empresa e a próxima
      // requisição herdaria o acesso.
      try { await cliente.query('RESET app.tenant_id'); } catch { /* conexão já morta */ }
      cliente.release();
    }
  },
};

/**
 * Roda as migrations pendentes. Chamado uma vez, no boot.
 *
 * Usa uma conexão à parte: a aplicação roda como `vital_app`, que de propósito
 * não pode criar tabela nem ignorar RLS. Migration precisa dos dois, então sai
 * por DATABASE_ADMIN_URL — em produção, credencial de deploy, não da aplicação.
 */
export async function iniciarBanco() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definida. Copie server/.env.example para server/.env.'
    );
  }

  const urlAdmin = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  const admin = new Pool({
    connectionString: urlAdmin,
    ssl: /localhost|127\.0\.0\.1/.test(urlAdmin) ? false : { rejectUnauthorized: false },
  });
  try {
    await migrar(admin);
  } finally {
    await admin.end();
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ------------------------------------------------------------------ *
 * Config da empresa
 * ------------------------------------------------------------------ */

/**
 * Config vive em tenants.config, uma por empresa. O que o banco guarda é só o
 * que foi alterado; o resto chega de configPadrao, então campo novo aparece
 * sem migration.
 */
export async function getConfig(tenantId = TENANT_PADRAO) {
  const r = await db.get('SELECT config FROM plataforma.tenants WHERE id = ?', tenantId);
  return comPadroes(r?.config || {});
}

export async function setConfig(patch, tenantId = TENANT_PADRAO) {
  const r = await db.get('SELECT config FROM plataforma.tenants WHERE id = ?', tenantId);
  const salvo = r?.config || {};

  // Mescla por seção: mudar uma cor não pode apagar o resto da marca.
  const novo = { ...salvo };
  for (const [chave, valor] of Object.entries(patch || {})) {
    novo[chave] = (valor && typeof valor === 'object' && !Array.isArray(valor))
      ? { ...(salvo[chave] || {}), ...valor }
      : valor;
  }

  await db.run('UPDATE plataforma.tenants SET config = ? WHERE id = ?', JSON.stringify(novo), tenantId);
  return getConfig(tenantId);
}

export async function getTenant(tenantId = TENANT_PADRAO) {
  const r = await db.get('SELECT id, slug, nome, dominio, plano, status, ativo FROM plataforma.tenants WHERE id = ?', tenantId);
  return r && { id: r.id, slug: r.slug, nome: r.nome, dominio: r.dominio,
    plano: r.plano, status: r.status, ativo: !!r.ativo };
}

/* ------------------------------------------------------------------ *
 * Conversores: o banco guarda 0/1; a API fala em booleano.
 * Campos JSONB já voltam do pg como objeto, não como texto.
 * ------------------------------------------------------------------ */
export const staffOut = r => r && ({
  id: r.id, nome: r.nome, funcao: r.funcao, fone: r.fone, cor: r.cor,
  comissao: r.comissao, jornada: r.jornada || {}, ativo: !!r.ativo,
  unidadeId: r.unit_id || null,
});

export const serviceOut = (r, profs = []) => r && ({
  id: r.id, nome: r.nome, categoria: r.categoria, descricao: r.descricao,
  preco: r.preco, duracao: r.duracao, intervalo: r.intervalo, ativo: !!r.ativo,
  ordem: r.ordem, profissionais: profs,
  foto: r.foto || '', mostrarPreco: r.mostrar_preco == null ? true : !!r.mostrar_preco,
});

export const clientOut = r => r && ({
  id: r.id, nome: r.nome, fone: r.fone, nascimento: r.nascimento,
  endereco: r.endereco, obs: r.obs, optin: !!r.optin, criadoEm: r.criado_em,
  email: r.email || '', temGoogle: !!r.google_sub,
});

export const apptOut = r => r && ({
  id: r.id, clienteId: r.client_id, servicoId: r.service_id, profissionalId: r.staff_id,
  data: r.data, hora: r.hora, duracao: r.duracao, valor: r.valor, status: r.status,
  pagamento: { status: r.pag_status, forma: r.pag_forma, ref: r.pag_ref },
  origem: r.origem, obs: r.obs, criadoEm: r.criado_em,
  unidadeId: r.unit_id || null,
});

export const templateOut = r => r && ({
  id: r.id, chave: r.chave, titulo: r.titulo, quando: r.quando,
  tipo: r.tipo, ativo: !!r.ativo, texto: r.texto, metaTemplateName: r.meta_template_name,
});

export const messageOut = r => r && ({
  id: r.id, clienteId: r.client_id, agendamentoId: r.appointment_id,
  templateChave: r.template_chave, fone: r.fone, texto: r.texto, status: r.status,
  agendadoPara: r.agendado_para, enviadoEm: r.enviado_em, erro: r.erro,
});

export const unitOut = r => r && ({
  id: r.id, nome: r.nome, endereco: r.endereco, fone: r.fone, mapa: r.mapa,
  jornada: r.jornada || {}, ordem: r.ordem, ativo: !!r.ativo,
});

export const blockOut = r => r && ({
  id: r.id, profissionalId: r.staff_id || null, unidadeId: r.unit_id || null,
  data: r.data, horaIni: r.hora_ini, horaFim: r.hora_fim, motivo: r.motivo,
});

/** Nunca devolve senha_hash: o hash não sai da camada de banco. */
export const userOut = r => r && ({
  id: r.id, nome: r.nome, email: r.email, papel: r.papel,
  profissionalId: r.staff_id || null, ativo: !!r.ativo, ultimoLogin: r.ultimo_login,
});

/* ------------------------------------------------------------------ *
 * Leituras compostas
 * ------------------------------------------------------------------ */

/** Lê serviços já com a lista de profissionais habilitados. */
export async function listarServicos({ somenteAtivos = false, tenantId = TENANT_PADRAO } = {}) {
  const rows = await db.all(
    `SELECT * FROM services WHERE tenant_id = ? ${somenteAtivos ? 'AND ativo = 1' : ''}
     ORDER BY ordem, nome`,
    tenantId
  );
  const vinculos = await db.all('SELECT * FROM service_staff');
  return rows.map(r => serviceOut(r, vinculos.filter(v => v.service_id === r.id).map(v => v.staff_id)));
}

export async function listarUnidades({ somenteAtivas = false, tenantId = TENANT_PADRAO } = {}) {
  const rows = await db.all(
    `SELECT * FROM units WHERE tenant_id = ? ${somenteAtivas ? 'AND ativo = 1' : ''}
     ORDER BY ordem, nome`,
    tenantId
  );
  return rows.map(unitOut);
}

/** Bloqueios de um intervalo de datas — o motor de horários consulta daqui. */
export async function listarBloqueios({ de, ate, tenantId = TENANT_PADRAO }) {
  const rows = await db.all(
    'SELECT * FROM blocks WHERE tenant_id = ? AND data >= ? AND data <= ? ORDER BY data, hora_ini',
    tenantId, de, ate
  );
  return rows.map(blockOut);
}

export async function salvarVinculos(serviceId, staffIds) {
  await db.run('DELETE FROM service_staff WHERE service_id = ?', serviceId);
  for (const s of staffIds || []) {
    await db.run(
      'INSERT INTO service_staff (service_id, staff_id) VALUES (?,?) ON CONFLICT DO NOTHING',
      serviceId, s
    );
  }
}
