import { Router } from 'express';
import { db, getTenant } from '../db.js';
import { hoje } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { escopoDe } from '../lib/auth.js';
import { comAdicionais } from '../lib/adicionais.js';
import { paraCsv, reais, fone } from '../lib/csv.js';

export const exportar = Router();

/**
 * Os dados da empresa em planilha, para ela levar para onde quiser.
 *
 * É o direito de portabilidade da LGPD do lado de quem contrata: a empresa é a
 * controladora dos dados das clientes dela, e a Vital não pode ser o lugar de
 * onde eles não saem. Também é o backup que a dona consegue fazer sozinha.
 *
 * Só o dono, pela guarda `exige('exportar')` em `app.js`. Ver a agenda do dia é
 * uma coisa; levar a base inteira de clientes num arquivo é outra — é
 * exatamente o que alguém que sai da empresa levaria.
 *
 * **A ficha de saúde não sai.** Anamnese é dado sensível, lido um por vez e com
 * rastro (`GET /clientes/:id/fichas`). Uma planilha com a de todo mundo seria a
 * cópia que ninguém controla mais.
 *
 * Cada exportação fica no registro do painel: quem baixou, o quê e quantas
 * linhas. Não o conteúdo — esse está no arquivo, que é o ponto.
 */

const STATUS = {
  agendado: 'Agendado', confirmado: 'Confirmado', em_atendimento: 'Em atendimento',
  concluido: 'Concluído', falta: 'Faltou', cancelado: 'Cancelado',
};
const PAGAMENTO = { aberto: 'Em aberto', parcial: 'Parcial', pago: 'Pago', estornado: 'Estornado' };
const FORMA = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', local: 'No local' };
const ORIGEM = { site: 'Site', painel: 'Painel' };

/** Nome de arquivo que diz de quem e de quando, sem nada que quebre o cabeçalho. */
async function nomeDoArquivo(oQue) {
  const t = await getTenant();
  const slug = String(t?.slug || 'empresa').replace(/[^a-z0-9-]/gi, '');
  return `${oQue}-${slug}-${hoje()}.csv`;
}

async function enviar(res, oQue, csv) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${await nomeDoArquivo(oQue)}"`,
    // Dado pessoal: nem o navegador nem proxy no meio guardam cópia.
    'Cache-Control': 'no-store',
  });
  res.send(csv);
}

exportar.get('/clientes.csv', rota(async (req, res) => {
  // Uma consulta com GROUP BY, e não as métricas cliente por cliente como faz
  // `GET /clientes`: aqui são todas de uma vez, e uma base de duas mil
  // clientes seriam duas mil consultas na mesma conexão.
  const linhas = await db.all(
    `SELECT c.*,
            COUNT(a.id) visitas,
            SUM(CASE WHEN a.status = 'falta' THEN 1 ELSE 0 END) faltas,
            MAX(CASE WHEN a.data <= ? THEN a.data END) ultima,
            SUM(a.pag_recebido) gasto
       FROM clients c
       LEFT JOIN appointments a ON a.client_id = c.id AND a.status <> 'cancelado'
      GROUP BY c.id
      ORDER BY c.nome`,
    hoje()
  );

  const csv = paraCsv([
    ['Nome', c => c.nome],
    ['WhatsApp', c => fone(c.fone)],
    ['E-mail', c => c.email],
    ['Nascimento', c => c.nascimento],
    ['Endereço', c => c.endereco],
    ['Observações', c => c.obs],
    // É o consentimento de marketing: quem for levar a lista para outra
    // ferramenta precisa saber quem disse não.
    ['Aceita mensagens de marketing', c => (c.optin ? 'Sim' : 'Não')],
    ['Cliente desde', c => c.criado_em],
    ['Visitas', c => c.visitas || 0],
    ['Faltas', c => c.faltas || 0],
    ['Última visita', c => c.ultima],
    ['Total pago (R$)', c => reais(c.gasto || 0)],
  ], linhas);

  await req.registrar('exportacao.clientes', {
    alvoTipo: 'exportacao',
    resumo: `exportou a lista de clientes (${linhas.length})`,
  });
  await enviar(res, 'clientes', csv);
}));

exportar.get('/agendamentos.csv', rota(async (req, res) => {
  // Hoje só o dono chega aqui, e o escopo dele é "todos". O recorte fica mesmo
  // assim: no dia em que outro papel ganhar `exportar`, a rota não pode ser a
  // porta dos fundos que entrega a agenda que `/agendamentos` esconde.
  const so = escopoDe(req.usuario);
  const linhas = await db.all(
    `SELECT a.*,
            c.nome cliente_nome, c.fone cliente_fone,
            s.nome servico_nome, st.nome profissional_nome,
            u.nome unidade_nome, cb.nome combo_nome
       FROM appointments a
       LEFT JOIN clients  c  ON c.id  = a.client_id
       LEFT JOIN services s  ON s.id  = a.service_id
       LEFT JOIN staff    st ON st.id = a.staff_id
       LEFT JOIN units    u  ON u.id  = a.unit_id
       LEFT JOIN combos   cb ON cb.id = a.combo_id
      ${so ? 'WHERE a.staff_id = ?' : ''}
      ORDER BY a.data DESC, a.hora DESC`,
    ...(so ? [so] : [])
  );
  // Os extras saem com o nome gravado no dia da venda, não com o de hoje.
  const comExtras = await comAdicionais(linhas);

  const csv = paraCsv([
    ['Data', a => a.data],
    ['Hora', a => a.hora],
    ['Duração (min)', a => a.duracao],
    ['Cliente', a => a.cliente_nome],
    ['WhatsApp', a => fone(a.cliente_fone)],
    ['Serviço', a => a.servico_nome],
    ['Adicionais', a => a.adicionais.map(x => x.nome).join(', ')],
    ['Promoção', a => a.combo_nome],
    ['Profissional', a => a.profissional_nome],
    ['Unidade', a => a.unidade_nome],
    ['Situação', a => STATUS[a.status] || a.status],
    ['Valor (R$)', a => reais(a.valor)],
    ['Desconto (R$)', a => reais(a.desconto || 0)],
    ['Recebido (R$)', a => reais(a.pag_recebido || 0)],
    ['Pagamento', a => PAGAMENTO[a.pag_status] || a.pag_status],
    ['Forma de pagamento', a => FORMA[a.pag_forma] || a.pag_forma],
    ['Origem', a => ORIGEM[a.origem] || a.origem],
    ['Observações', a => a.obs],
    ['Criado em', a => a.criado_em],
    // O id fica no fim: não diz nada a quem lê, mas é o que permite cruzar
    // duas exportações ou trazer a planilha de volta um dia.
    ['Código', a => a.id],
  ], comExtras);

  await req.registrar('exportacao.agendamentos', {
    alvoTipo: 'exportacao',
    resumo: `exportou os agendamentos (${linhas.length})`,
  });
  await enviar(res, 'agendamentos', csv);
}));
