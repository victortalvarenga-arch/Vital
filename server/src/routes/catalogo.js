import { Router } from 'express';
import { db, uid, staffOut, serviceOut, listarServicos, salvarVinculos, getConfig, setConfig } from '../db.js';
import { hoje, soDigitos } from '../lib/dates.js';
import { rota } from '../lib/rota.js';

export const catalogo = Router();

/* ── Configuração do negócio ── */
catalogo.get('/config', rota(async (req, res) => res.json(await getConfig())));
catalogo.put('/config', rota(async (req, res) => res.json(await setConfig(req.body || {}))));

/* ── Serviços ── */
catalogo.get('/servicos', rota(async (req, res) =>
  res.json(await listarServicos({ somenteAtivos: req.query.ativos === '1' }))));

catalogo.post('/servicos', rota(async (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  const id = uid();
  await db.run(
    `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, b.nome, b.categoria || 'Geral', b.descricao || '', +b.preco || 0,
    +b.duracao || 60, +b.intervalo || 0, b.ativo === false ? 0 : 1, +b.ordem || 0
  );
  await salvarVinculos(id, b.profissionais);
  const servicos = await listarServicos();
  res.status(201).json(servicos.find(s => s.id === id));
}));

catalogo.put('/servicos/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM services WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'serviço não encontrado' });
  const b = { ...serviceOut(atual), ...req.body };
  await db.run(
    `UPDATE services SET nome=?, categoria=?, descricao=?, preco=?, duracao=?,
            intervalo=?, ativo=?, ordem=? WHERE id=?`,
    b.nome, b.categoria, b.descricao, +b.preco, +b.duracao, +b.intervalo || 0,
    b.ativo ? 1 : 0, +b.ordem || 0, req.params.id
  );
  if (req.body.profissionais) await salvarVinculos(req.params.id, req.body.profissionais);
  const servicos = await listarServicos();
  res.json(servicos.find(s => s.id === req.params.id));
}));

catalogo.delete('/servicos/:id', rota(async (req, res) => {
  const { n: usos } = await db.get('SELECT COUNT(*) n FROM appointments WHERE service_id=?', req.params.id);
  if (usos > 0) {
    // Não apaga histórico: só some do site. Relatório do mês passado precisa do nome.
    await db.run('UPDATE services SET ativo=0 WHERE id=?', req.params.id);
    return res.json({ ok: true, arquivado: true, motivo: `${usos} agendamentos usam este serviço` });
  }
  await db.run('DELETE FROM services WHERE id=?', req.params.id);
  res.json({ ok: true });
}));

/* ── Equipe ── */
catalogo.get('/profissionais', rota(async (req, res) => {
  const rows = await db.all(
    `SELECT * FROM staff ${req.query.ativos === '1' ? 'WHERE ativo=1' : ''} ORDER BY nome`
  );
  res.json(rows.map(staffOut));
}));

catalogo.post('/profissionais', rota(async (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  const id = uid();
  await db.run(
    `INSERT INTO staff (id,nome,funcao,fone,cor,comissao,jornada,ativo,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, b.nome, b.funcao || '', soDigitos(b.fone), b.cor || '#A32A4E',
    +b.comissao || 0, JSON.stringify(b.jornada || {}), b.ativo === false ? 0 : 1, hoje()
  );
  res.status(201).json(staffOut(await db.get('SELECT * FROM staff WHERE id=?', id)));
}));

catalogo.put('/profissionais/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM staff WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'profissional não encontrada' });
  const b = { ...staffOut(atual), ...req.body };
  await db.run(
    `UPDATE staff SET nome=?, funcao=?, fone=?, cor=?, comissao=?, jornada=?, ativo=? WHERE id=?`,
    b.nome, b.funcao, soDigitos(b.fone), b.cor, +b.comissao,
    JSON.stringify(b.jornada || {}), b.ativo ? 1 : 0, req.params.id
  );
  res.json(staffOut(await db.get('SELECT * FROM staff WHERE id=?', req.params.id)));
}));

catalogo.delete('/profissionais/:id', rota(async (req, res) => {
  const { n: usos } = await db.get('SELECT COUNT(*) n FROM appointments WHERE staff_id=?', req.params.id);
  if (usos > 0) {
    await db.run('UPDATE staff SET ativo=0 WHERE id=?', req.params.id);
    return res.json({ ok: true, arquivado: true, motivo: `${usos} agendamentos no histórico` });
  }
  await db.run('DELETE FROM staff WHERE id=?', req.params.id);
  res.json({ ok: true });
}));
