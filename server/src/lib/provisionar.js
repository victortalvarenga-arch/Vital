import { db, uid } from '../db.js';
import { hoje } from './dates.js';
import { TEMPLATES_PADRAO } from './templates.js';
import { esquecerCacheDeEmpresas } from './tenant.js';

/**
 * Fazer nascer uma empresa.
 *
 * Existia só dentro do `seed.js`, misturado com os dados do estúdio de exemplo
 * — o que quer dizer que empresa nova nascia com serviço de manicure ou não
 * nascia. Aqui está o mínimo, e nada do mínimo é de ramo nenhum: a linha em
 * `plataforma.tenants`, a config com o nome, os textos de WhatsApp e o dono.
 *
 * Catálogo, equipe e clientes ficam de fora de propósito. Serviço inventado por
 * nós é serviço que a empresa vai ter de apagar antes de cadastrar o dela — e
 * enquanto não apagar, está no ar, no site, para quem quiser agendar.
 */

/** Vira `lume` em `lume.vital.app`. */
export function slugDe(nome) {
  const base = String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  // O CHECK da tabela exige ao menos 3 caracteres e começar/terminar em
  // alfanumérico. Nome curto demais ou só com símbolo cai no genérico.
  return base.length >= 3 ? base : 'empresa';
}

/** Um slug livre: acrescenta sufixo enquanto o nome estiver tomado. */
async function slugLivre(desejado) {
  for (let n = 0; n < 50; n++) {
    const tentativa = n === 0 ? desejado : `${desejado}-${n + 1}`.slice(0, 40);
    const existe = await db.get('SELECT 1 FROM plataforma.tenants WHERE slug = ?', tentativa);
    if (!existe) return tentativa;
  }
  return `${desejado}-${uid()}`.slice(0, 40);
}

/**
 * Cria a empresa e devolve `{ id, slug }`.
 *
 * Roda fora de qualquer contexto de empresa — é ela que está sendo criada —,
 * então a linha em `plataforma.tenants` entra pelo pool. O resto (templates)
 * precisa da conexão já marcada, e por isso vai dentro de `db.comEmpresa`.
 *
 * @param {object} o
 * @param {string} o.nome    como o negócio se chama
 * @param {string} [o.ramo]  texto livre; guardado na config para o assistente
 * @param {string} [o.slug]  endereço desejado; sai do nome quando não vem
 */
export async function provisionarEmpresa({ nome, ramo = '', slug, plano = 'gratuito' }) {
  const limpo = String(nome || '').trim();
  if (limpo.length < 2) return { erro: 'informe o nome do negócio' };

  const desejado = slug ? slugDe(slug) : slugDe(limpo);
  const enderecoLivre = await slugLivre(desejado);

  const id = uid();
  await db.run(
    `INSERT INTO plataforma.tenants (id, slug, nome, dominio, config, plano, status, ativo, criado_em)
     VALUES (?,?,?,'',?,?,'ativa',1,?)`,
    id, enderecoLivre, limpo, JSON.stringify({ nome: limpo, ramo }), plano, hoje()
  );

  await db.comEmpresa(id, async () => {
    // Os textos prontos são neutros de gênero e de ramo — ver `templates.js`.
    for (const t of TEMPLATES_PADRAO) {
      await db.run(
        `INSERT INTO templates (id,chave,titulo,quando,tipo,ativo,texto) VALUES (?,?,?,?,?,1,?)`,
        uid(), t.chave, t.titulo, t.quando, t.tipo, t.texto
      );
    }
  });

  // A resolução por endereço guarda host → empresa por um minuto; sem isto, o
  // endereço recém-criado responderia 404 até o cache vencer.
  esquecerCacheDeEmpresas();

  return { id, slug: enderecoLivre, nome: limpo };
}

/**
 * Garante que a empresa padrão exista e tenha os textos.
 *
 * É o caminho do desenvolvimento local e de quem roda um deploy por cliente: a
 * empresa `default` já vem da migration 001, e aqui só falta o que o
 * provisionamento normal instalaria.
 */
export async function prepararEmpresaPadrao(tenantId) {
  await db.comEmpresa(tenantId, async () => {
    const { n } = await db.get('SELECT COUNT(*) n FROM templates');
    if (n > 0) return;
    for (const t of TEMPLATES_PADRAO) {
      await db.run(
        `INSERT INTO templates (id,chave,titulo,quando,tipo,ativo,texto) VALUES (?,?,?,?,?,1,?)`,
        uid(), t.chave, t.titulo, t.quando, t.tipo, t.texto
      );
    }
  });
}
