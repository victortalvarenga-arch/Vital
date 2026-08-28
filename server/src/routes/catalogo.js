import { Router } from 'express';
import { db, uid, staffOut, serviceOut, listarServicos, salvarVinculos, getConfig, setConfig } from '../db.js';
import { hoje, soDigitos } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { adicionaisDe } from '../lib/adicionais.js';

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
    `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem,foto,mostrar_preco)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, b.nome, b.categoria || 'Geral', b.descricao || '', +b.preco || 0,
    +b.duracao || 60, +b.intervalo || 0, b.ativo === false ? 0 : 1, +b.ordem || 0,
    b.foto || '', b.mostrarPreco === false ? 0 : 1
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
            intervalo=?, ativo=?, ordem=?, foto=?, mostrar_preco=? WHERE id=?`,
    b.nome, b.categoria, b.descricao, +b.preco, +b.duracao, +b.intervalo || 0,
    b.ativo ? 1 : 0, +b.ordem || 0, b.foto || '', b.mostrarPreco === false ? 0 : 1,
    req.params.id
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

/* ── Serviços adicionais ── */

/**
 * O que a empresa cadastrou de extras.
 *
 * Duas listas separadas, e não a união: aqui a empresa está EDITANDO as regras,
 * e precisa ver de onde cada oferta vem para saber onde mexer. A união só
 * interessa ao site, na hora de oferecer.
 */
catalogo.get('/adicionais', rota(async (req, res) => {
  const porServico = await db.all('SELECT service_id, addon_id FROM service_addons');
  const porCategoria = await db.all('SELECT categoria, addon_id FROM category_addons');
  res.json({
    porServico: agrupar(porServico, 'service_id', 'addon_id'),
    porCategoria: agrupar(porCategoria, 'categoria', 'addon_id'),
  });
}));

/** Substitui os extras de um serviço pela lista enviada. */
catalogo.put('/adicionais/servico/:id', rota(async (req, res) => {
  const svc = await db.get('SELECT id FROM services WHERE id=?', req.params.id);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });

  const ids = [...new Set(req.body?.adicionais || [])].filter(i => i && i !== req.params.id);
  await db.transacao(async tx => {
    await tx.run('DELETE FROM service_addons WHERE service_id=?', req.params.id);
    for (const addon of ids) {
      await tx.run(
        'INSERT INTO service_addons (service_id, addon_id) VALUES (?,?) ON CONFLICT DO NOTHING',
        req.params.id, addon
      );
    }
  });
  res.json({ servicoId: req.params.id, adicionais: ids });
}));

/** Substitui os extras de uma categoria inteira. */
catalogo.put('/adicionais/categoria/:nome', rota(async (req, res) => {
  const categoria = req.params.nome;
  const ids = [...new Set(req.body?.adicionais || [])].filter(Boolean);
  await db.transacao(async tx => {
    await tx.run('DELETE FROM category_addons WHERE categoria=?', categoria);
    for (const addon of ids) {
      await tx.run(
        'INSERT INTO category_addons (categoria, addon_id) VALUES (?,?) ON CONFLICT DO NOTHING',
        categoria, addon
      );
    }
  });
  res.json({ categoria, adicionais: ids });
}));

/** O que o site vai oferecer para um serviço: a união das duas regras. */
catalogo.get('/adicionais/oferta/:id', rota(async (req, res) => {
  const svc = await db.get('SELECT id, categoria FROM services WHERE id=?', req.params.id);
  if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });
  res.json({ adicionais: await adicionaisDe(svc.id, svc.categoria) });
}));

function agrupar(linhas, chave, valor) {
  const mapa = {};
  for (const l of linhas) (mapa[l[chave]] ||= []).push(l[valor]);
  return mapa;
}

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
