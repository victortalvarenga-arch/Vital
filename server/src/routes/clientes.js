import { Router } from 'express';
import { db, uid, clientOut, apptOut } from '../db.js';
import { hoje, soDigitos, diasEntre } from '../lib/dates.js';
import { telefoneValido } from '../lib/fone.js';
import { rota } from '../lib/rota.js';
import { mudancas } from '../lib/registro.js';
import { escopoDe, exige } from '../lib/auth.js';
import { fichasDaCliente } from '../lib/formularios.js';

export const clientes = Router();

/** Acrescenta o que o painel sempre quer junto: visitas, gasto e há quanto tempo sumiu. */
async function comMetricas(c) {
  // Visita é atendimento concluído — a mesma conta da lista do painel. Contar
  // tudo o que não foi cancelado somava as faltas e os horários de amanhã, e a
  // "última visita" podia ser um dia em que ela não veio, o que adiava a
  // reativação de quem já sumiu.
  const m = await db.get(
    `SELECT SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) visitas,
            SUM(pag_recebido) gasto,
            MAX(CASE WHEN status='concluido' AND data <= ? THEN data END) ultima,
            SUM(CASE WHEN status='falta' THEN 1 ELSE 0 END) faltas
       FROM appointments WHERE client_id=? AND status <> 'cancelado'`,
    hoje(), c.id
  );
  return {
    ...c,
    visitas: m.visitas || 0,
    gasto: m.gasto || 0,
    faltas: m.faltas || 0,
    ultimaVisita: m.ultima || null,
    diasSemVir: m.ultima ? diasEntre(m.ultima, hoje()) : null,
  };
}

clientes.get('/', rota(async (req, res) => {
  const q = (req.query.q || '').trim();
  // ILIKE, não LIKE: no Postgres LIKE diferencia maiúscula de minúscula, e
  // buscar "amanda" deixaria de encontrar "Amanda".
  const rows = q
    ? await db.all(
        `SELECT * FROM clients WHERE nome ILIKE ? OR fone LIKE ? ORDER BY nome`,
        `%${q}%`, `%${soDigitos(q)}%`
      )
    : await db.all('SELECT * FROM clients ORDER BY nome');
  // Em sequência: a requisição roda numa conexão só, que atende uma consulta
  // por vez — o Promise.all não ganhava paralelismo, só enfileirava.
  const lista = [];
  for (const r of rows) lista.push(await comMetricas(clientOut(r)));
  res.json(lista);
}));

clientes.get('/:id', rota(async (req, res) => {
  const r = await db.get('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!r) return res.status(404).json({ erro: 'cliente não encontrada' });
  const linhas = await db.all(
    'SELECT * FROM appointments WHERE client_id=? ORDER BY data DESC, hora DESC',
    req.params.id
  );
  res.json({ ...(await comMetricas(clientOut(r))), historico: linhas.map(apptOut) });
}));

/**
 * As anamneses que esta cliente já respondeu.
 *
 * Rota própria, e não um campo de `GET /clientes/:id`, por três motivos que
 * são todos o mesmo motivo: **dado de saúde não anda junto do resto.**
 *
 * - Sai só quando alguém pede para ver — abrir a ficha da cliente para
 *   conferir o telefone não baixa o histórico clínico dela.
 * - Nunca entra na listagem de clientes, que carregaria a anamnese de todo
 *   mundo no navegador de quem só queria procurar um nome.
 * - **Deixa rastro.** Abrir a ficha de saúde de alguém é acesso deliberado, e
 *   a LGPD pede que se saiba quem leu o quê. Outras leituras do painel não são
 *   registradas de propósito (o ruído afogaria a lista útil); esta é.
 *
 * O recorte por papel é o mesmo da ficha do atendimento: funcionário vê as
 * dos atendimentos que ele atendeu. Quem filtra é a consulta, não a tela.
 */
clientes.get('/:id/fichas', exige('fichas'), rota(async (req, res) => {
  const c = await db.get('SELECT id, nome FROM clients WHERE id=?', req.params.id);
  if (!c) return res.status(404).json({ erro: 'cliente não encontrada' });

  const fichas = await fichasDaCliente(c.id, { soDoProfissional: escopoDe(req.usuario) });

  // Registra o acesso, não o conteúdo: o histórico diz que Fulana abriu a
  // ficha de saúde da Beltrana às 14h — copiar a resposta para cá seria
  // espalhar o dado sensível numa segunda tabela para "proteger" a primeira.
  await req.registrar('ficha.consultar', {
    alvoTipo: 'cliente', alvoId: c.id,
    resumo: `abriu a ficha de saúde de ${c.nome}`,
    detalhe: { fichas: fichas.length },
  });

  res.json(fichas);
}));

clientes.post('/', rota(async (req, res) => {
  const b = req.body || {};
  const fone = soDigitos(b.fone);
  if (!b.nome) return res.status(400).json({ erro: 'o nome da cliente é obrigatório' });
  // A regra do painel aceita fixo; a do site, não. O porquê está em
  // `lib/fone.js`.
  const erroDoFone = telefoneValido(fone);
  if (erroDoFone) return res.status(400).json({ erro: erroDoFone });
  const existe = await db.get('SELECT * FROM clients WHERE fone=?', fone);
  if (existe) return res.status(409).json({ erro: 'já existe cliente com esse WhatsApp', cliente: clientOut(existe) });

  const id = uid();
  await db.run(
    `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,optin_em,optin_origem,criado_em)
     VALUES (?,?,?,?,?,?,?,?,'painel',?)`,
    id, b.nome.trim(), fone, b.nascimento || null, b.endereco || '', b.obs || '',
    b.optin === false ? 0 : 1, hoje(), hoje()
  );
  await req.registrar('cliente.criado', { alvoId: id, resumo: `cadastrou ${b.nome.trim()}` });
  res.status(201).json(await comMetricas(clientOut(await db.get('SELECT * FROM clients WHERE id=?', id))));
}));

clientes.put('/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'cliente não encontrada' });
  const b = { ...clientOut(atual), ...req.body };

  // Editar confere o telefone como criar. Sem isto, a ficha boa virava lixo
  // com um salvar — e trocar para um número que já existe estourava o índice
  // único, envenenava a transação e a tela via um 500 sem explicação.
  const fone = soDigitos(b.fone);
  const erroDoFone = telefoneValido(fone);
  if (erroDoFone) return res.status(400).json({ erro: erroDoFone });
  const jaTem = await db.get('SELECT id FROM clients WHERE fone=? AND id<>?', fone, req.params.id);
  if (jaTem) return res.status(409).json({ erro: 'já existe cliente com esse WhatsApp' });

  await db.run(
    `UPDATE clients SET nome=?, fone=?, nascimento=?, endereco=?, obs=?, optin=? WHERE id=?`,
    b.nome, fone, b.nascimento || null, b.endereco || '', b.obs || '',
    b.optin ? 1 : 0, req.params.id
  );
  // Ligar ou desligar o consentimento é fato novo, com data e origem novas;
  // editar o resto da ficha não reescreve a prova do aceite.
  if ((b.optin ? 1 : 0) !== (atual.optin ? 1 : 0)) {
    await db.run(`UPDATE clients SET optin_em=?, optin_origem='painel' WHERE id=?`, hoje(), req.params.id);
  }
  const depois = clientOut(await db.get('SELECT * FROM clients WHERE id=?', req.params.id));
  // `optin` no meio: é consentimento de marketing, e quem o desligou ou ligou é
  // exatamente o que a LGPD pede para saber.
  const mudou = mudancas(clientOut(atual), depois, ['nome', 'fone', 'nascimento', 'endereco', 'obs', 'optin']);
  if (Object.keys(mudou).length) {
    await req.registrar('cliente.alterado', {
      alvoId: depois.id,
      resumo: `editou ${depois.nome} (${Object.keys(mudou).join(', ')})`,
      detalhe: mudou,
    });
  }
  res.json(await comMetricas(depois));
}));

/**
 * Confirmar ou recusar o vínculo com uma conta Google (migration 041).
 *
 * **Quem efetiva é gente.** A rota pública só registra o pedido: quem entra
 * com o Google e digita um telefone que já tem ficha pode ser a dona dela ou
 * alguém que errou um dígito, e confirmar entrega a ficha inteira — histórico,
 * endereço, observações, e dali em diante o agendamento sem telefone nenhum.
 *
 * `exige('clientes')`: dono e recepção, que é quem cuida de ficha. Funcionário
 * atende a própria agenda e não decide isto.
 */
clientes.post('/:id/vinculo', exige('clientes'), rota(async (req, res) => {
  const c = await db.get('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!c) return res.status(404).json({ erro: 'cliente não encontrada' });
  if (!c.google_sub_pendente) return res.status(404).json({ erro: 'não há pedido de vínculo nesta ficha' });

  const confirmar = req.body?.confirmar === true;
  const limpar = `google_sub_pendente = NULL, email_pendente = '', vinculo_pedido_em = NULL`;

  if (!confirmar) {
    await db.run(`UPDATE clients SET ${limpar} WHERE id = ?`, c.id);
    await req.registrar('vinculo.recusado', {
      alvoTipo: 'cliente', alvoId: c.id, resumo: `recusou ligar uma conta do Google a ${c.nome}`,
    });
    return res.json(clientOut(await db.get('SELECT * FROM clients WHERE id=?', c.id)));
  }

  // O índice único é por empresa: sem esta conferência o UPDATE estoura,
  // envenena a transação e a tela recebe 500 em vez de "já está ligada a
  // outra cliente" — foi o que aconteceu com o PUT desta mesma rota.
  const jaTem = await db.get('SELECT id FROM clients WHERE google_sub = ? AND id <> ?',
    c.google_sub_pendente, c.id);
  if (jaTem) return res.status(409).json({ erro: 'essa conta do Google já está ligada a outra cliente' });

  // O e-mail da conta só entra se a ficha não tiver um: o que a profissional
  // cadastrou vale mais que o que veio do Google.
  await db.run(
    `UPDATE clients SET google_sub = google_sub_pendente,
            email = CASE WHEN email = '' THEN email_pendente ELSE email END, ${limpar}
      WHERE id = ?`, c.id
  );
  await req.registrar('vinculo.confirmado', {
    alvoTipo: 'cliente', alvoId: c.id, resumo: `ligou uma conta do Google a ${c.nome}`,
  });
  res.json(clientOut(await db.get('SELECT * FROM clients WHERE id=?', c.id)));
}));

clientes.delete('/:id', rota(async (req, res) => {
  const { n: usos } = await db.get('SELECT COUNT(*) n FROM appointments WHERE client_id=?', req.params.id);
  if (usos > 0) return res.status(409).json({ erro: `cliente tem ${usos} agendamentos; remova o histórico primeiro` });
  const alvo = await db.get('SELECT nome, fone FROM clients WHERE id=?', req.params.id);

  // Apagar a ficha é o pedido de exclusão da LGPD, então o rastro vai junto:
  // as mensagens dela (carregam nome e telefone no texto — e a FK delas era o
  // que derrubava este DELETE em 500), as conversas do WhatsApp pelo número,
  // e o fio que ligava os atendimentos dela no histórico (a função é a única
  // porta que atravessa o REVOKE da 031 — ver migration 040).
  await db.run('DELETE FROM messages WHERE client_id=?', req.params.id);
  if (alvo?.fone) await db.run('DELETE FROM conversas WHERE fone=?', alvo.fone);
  await db.get('SELECT plataforma.apagar_rastro_da_cliente(?)', req.params.id);
  await db.run('DELETE FROM clients WHERE id=?', req.params.id);
  // Só o primeiro nome, e sem o telefone: o registro não se apaga e dura dois
  // anos (027), e copiar o contato de quem pediu para sair para lá seria
  // guardar o dado justamente de quem a empresa acabou de apagar.
  await req.registrar('cliente.apagado', {
    alvoId: req.params.id,
    resumo: `apagou a ficha de ${alvo?.nome.split(' ')[0] || 'alguém'}`,
  });
  res.json({ ok: true });
}));
