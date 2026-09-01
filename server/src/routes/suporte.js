import { Router } from 'express';
import { db, uid } from '../db.js';
import { rota } from '../lib/rota.js';
import { empresaAtual } from '../lib/contexto.js';

export const suporte = Router();

/**
 * Suporte visto do lado da empresa-cliente: abrir chamado e acompanhar.
 *
 * O chamado mora em `plataforma.tickets`, fora do Row-Level Security — porque
 * quem precisa ler é a nossa equipe, atravessando empresas, que é justamente o
 * que o RLS impede (o porquê inteiro está na migration 014).
 *
 * **Sem RLS, o filtro é responsabilidade daqui.** Toda consulta abaixo amarra
 * `tenant_id` a `empresaAtual()`, que vem da conexão da requisição — nunca do
 * corpo. Aceitar um `tenantId` mandado pelo cliente deixaria qualquer empresa
 * ler o chamado da outra digitando um id, e o banco não reclamaria.
 */

const STATUS = { aberto: 'aberto', respondido: 'respondido', fechado: 'fechado' };

const paraTela = t => ({
  id: t.id, assunto: t.assunto, mensagem: t.mensagem, status: t.status,
  resposta: t.resposta || '', autor: t.autor_nome,
  criadoEm: t.criado_em, respondidoEm: t.respondido_em,
});

suporte.get('/', rota(async (req, res) => {
  const linhas = await db.all(
    `SELECT * FROM plataforma.tickets WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT 100`,
    empresaAtual()
  );
  res.json(linhas.map(paraTela));
}));

suporte.post('/', rota(async (req, res) => {
  const assunto = String(req.body?.assunto || '').trim().slice(0, 120);
  const mensagem = String(req.body?.mensagem || '').trim().slice(0, 4000);
  if (!assunto) return res.status(400).json({ erro: 'escreva um assunto' });
  if (mensagem.length < 10) {
    return res.status(400).json({ erro: 'conte o que aconteceu, com pelo menos 10 letras' });
  }

  const id = uid();
  await db.run(
    `INSERT INTO plataforma.tickets (id, tenant_id, autor_nome, autor_email, assunto, mensagem)
     VALUES (?,?,?,?,?,?)`,
    // A empresa vem da conexão, e o autor da sessão. Nenhum dos dois do corpo.
    id, empresaAtual(), req.usuario?.nome || '', req.usuario?.email || '', assunto, mensagem
  );

  await req.registrar('suporte.aberto', {
    alvoId: id,
    resumo: `abriu um chamado de suporte: ${assunto}`,
  });

  const novo = await db.get(
    'SELECT * FROM plataforma.tickets WHERE id = ? AND tenant_id = ?', id, empresaAtual()
  );
  res.status(201).json(paraTela(novo));
}));

export { STATUS as STATUS_TICKET };
