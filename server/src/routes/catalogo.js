import { Router } from 'express';
import { db, uid, staffOut, serviceOut, listarServicos, salvarVinculos, getConfig, setConfig } from '../db.js';
import { hoje, soDigitos } from '../lib/dates.js';

export const catalogo = Router();

/* ── Configuração do estúdio ── */
catalogo.get('/config', (req, res) => res.json(getConfig()));
catalogo.put('/config', (req, res) => res.json(setConfig(req.body || {})));

/* ── Serviços ── */
catalogo.get('/servicos', (req, res) =>
  res.json(listarServicos({ somenteAtivos: req.query.ativos === '1' })));

catalogo.post('/servicos', (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  const id = uid();
  db.prepare(
    `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, b.nome, b.categoria || 'Geral', b.descricao || '', +b.preco || 0,
        +b.duracao || 60, +b.intervalo || 0, b.ativo === false ? 0 : 1, +b.ordem || 0);
  salvarVinculos(id, b.profissionais);
  res.status(201).json(listarServicos().find(s => s.id === id));
});

catalogo.put('/servicos/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM services WHERE id=?').get(req.params.id);
  if (!atual) return res.status(404).json({ erro: 'serviço não encontrado' });
  const b = { ...serviceOut(atual), ...req.body };
  db.prepare(
    `UPDATE services SET nome=?, categoria=?, descricao=?, preco=?, duracao=?,
            intervalo=?, ativo=?, ordem=? WHERE id=?`
  ).run(b.nome, b.categoria, b.descricao, +b.preco, +b.duracao, +b.intervalo || 0,
        b.ativo ? 1 : 0, +b.ordem || 0, req.params.id);
  if (req.body.profissionais) salvarVinculos(req.params.id, req.body.profissionais);
  res.json(listarServicos().find(s => s.id === req.params.id));
});

catalogo.delete('/servicos/:id', (req, res) => {
  const usos = db.prepare('SELECT COUNT(*) n FROM appointments WHERE service_id=?').get(req.params.id).n;
  if (usos > 0) {
    // Não apaga histórico: só some do site. Relatório do mês passado precisa do nome.
    db.prepare('UPDATE services SET ativo=0 WHERE id=?').run(req.params.id);
    return res.json({ ok: true, arquivado: true, motivo: `${usos} agendamentos usam este serviço` });
  }
  db.prepare('DELETE FROM services WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ── Equipe ── */
catalogo.get('/profissionais', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM staff ${req.query.ativos === '1' ? 'WHERE ativo=1' : ''} ORDER BY nome`
  ).all();
  res.json(rows.map(staffOut));
});

catalogo.post('/profissionais', (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  const id = uid();
  db.prepare(
    `INSERT INTO staff (id,nome,funcao,fone,cor,comissao,jornada,ativo,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, b.nome, b.funcao || '', soDigitos(b.fone), b.cor || '#A32A4E',
        +b.comissao || 0, JSON.stringify(b.jornada || {}), b.ativo === false ? 0 : 1, hoje());
  res.status(201).json(staffOut(db.prepare('SELECT * FROM staff WHERE id=?').get(id)));
});

catalogo.put('/profissionais/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id);
  if (!atual) return res.status(404).json({ erro: 'profissional não encontrada' });
  const b = { ...staffOut(atual), ...req.body };
  db.prepare(
    `UPDATE staff SET nome=?, funcao=?, fone=?, cor=?, comissao=?, jornada=?, ativo=? WHERE id=?`
  ).run(b.nome, b.funcao, soDigitos(b.fone), b.cor, +b.comissao,
        JSON.stringify(b.jornada || {}), b.ativo ? 1 : 0, req.params.id);
  res.json(staffOut(db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id)));
});

catalogo.delete('/profissionais/:id', (req, res) => {
  const usos = db.prepare('SELECT COUNT(*) n FROM appointments WHERE staff_id=?').get(req.params.id).n;
  if (usos > 0) {
    db.prepare('UPDATE staff SET ativo=0 WHERE id=?').run(req.params.id);
    return res.json({ ok: true, arquivado: true, motivo: `${usos} agendamentos no histórico` });
  }
  db.prepare('DELETE FROM staff WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
