import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrar } from './lib/migrate.js';
import { TENANT_PADRAO, comPadroes } from './lib/tenant.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = process.env.DB_FILE || path.join(raiz, 'db', 'estudio.db');

fs.mkdirSync(path.dirname(arquivo), { recursive: true });

export const db = new Database(arquivo);

// Os PRAGMA ficam aqui, e não numa migration: journal_mode não pode mudar de
// dentro de uma transação, e é assim que toda migration roda.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

migrar(db);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ------------------------------------------------------------------ *
 * Config da empresa
 * ------------------------------------------------------------------ */

/**
 * Config vive em tenants.config, uma por empresa. O que o banco guarda é só o
 * que foi alterado; o resto chega de configPadrao, então campo novo aparece
 * sem migration.
 */
export function getConfig(tenantId = TENANT_PADRAO) {
  const r = db.prepare('SELECT config FROM tenants WHERE id = ?').get(tenantId);
  let salvo = {};
  try { salvo = r ? JSON.parse(r.config) : {}; } catch { salvo = {}; }
  return comPadroes(salvo);
}

export function setConfig(patch, tenantId = TENANT_PADRAO) {
  const r = db.prepare('SELECT config FROM tenants WHERE id = ?').get(tenantId);
  let salvo = {};
  try { salvo = r ? JSON.parse(r.config) : {}; } catch { salvo = {}; }

  // Mescla por seção: mudar uma cor não pode apagar o resto da marca.
  const novo = { ...salvo };
  for (const [chave, valor] of Object.entries(patch || {})) {
    novo[chave] = (valor && typeof valor === 'object' && !Array.isArray(valor))
      ? { ...(salvo[chave] || {}), ...valor }
      : valor;
  }

  db.prepare('UPDATE tenants SET config = ? WHERE id = ?').run(JSON.stringify(novo), tenantId);
  return getConfig(tenantId);
}

export function getTenant(tenantId = TENANT_PADRAO) {
  const r = db.prepare('SELECT id, slug, nome, dominio, ativo FROM tenants WHERE id = ?').get(tenantId);
  return r && { id: r.id, slug: r.slug, nome: r.nome, dominio: r.dominio, ativo: !!r.ativo };
}

/* ------------------------------------------------------------------ *
 * Conversores: o banco guarda 0/1 e JSON em texto; a API fala em
 * booleano e objeto.
 * ------------------------------------------------------------------ */
export const staffOut = r => r && ({
  id: r.id, nome: r.nome, funcao: r.funcao, fone: r.fone, cor: r.cor,
  comissao: r.comissao, jornada: JSON.parse(r.jornada || '{}'), ativo: !!r.ativo,
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
  jornada: JSON.parse(r.jornada || '{}'), ordem: r.ordem, ativo: !!r.ativo,
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
export function listarServicos({ somenteAtivos = false, tenantId = TENANT_PADRAO } = {}) {
  const rows = db.prepare(
    `SELECT * FROM services WHERE tenant_id = ? ${somenteAtivos ? 'AND ativo = 1' : ''}
     ORDER BY ordem, nome`
  ).all(tenantId);
  const vinculos = db.prepare('SELECT * FROM service_staff').all();
  return rows.map(r => serviceOut(r, vinculos.filter(v => v.service_id === r.id).map(v => v.staff_id)));
}

export function listarUnidades({ somenteAtivas = false, tenantId = TENANT_PADRAO } = {}) {
  return db.prepare(
    `SELECT * FROM units WHERE tenant_id = ? ${somenteAtivas ? 'AND ativo = 1' : ''}
     ORDER BY ordem, nome`
  ).all(tenantId).map(unitOut);
}

/** Bloqueios de um intervalo de datas — o motor de horários consulta daqui. */
export function listarBloqueios({ de, ate, tenantId = TENANT_PADRAO }) {
  return db.prepare(
    'SELECT * FROM blocks WHERE tenant_id = ? AND data >= ? AND data <= ? ORDER BY data, hora_ini'
  ).all(tenantId, de, ate).map(blockOut);
}

export function salvarVinculos(serviceId, staffIds) {
  db.prepare('DELETE FROM service_staff WHERE service_id = ?').run(serviceId);
  const ins = db.prepare('INSERT OR IGNORE INTO service_staff (service_id, staff_id) VALUES (?,?)');
  for (const s of staffIds || []) ins.run(serviceId, s);
}
