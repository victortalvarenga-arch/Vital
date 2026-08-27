import { db, getConfig } from '../db.js';
import { fmtData, fmtDataBR, brl, diasEntre, hoje } from './dates.js';

/** Troca {cliente}, {hora} etc. pelo valor real. Placeholder sem valor fica em branco. */
export function render(texto, vars) {
  return String(texto).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export const VARIAVEIS = [
  'cliente', 'servico', 'profissional', 'data', 'hora', 'valor',
  'estudio', 'endereco', 'link', 'dias',
];

/**
 * Monta as variáveis a partir de um agendamento (ou só do cliente, em campanhas).
 * Use sempre esta função para não haver dois lugares gerando textos diferentes.
 */
export async function variaveis({ cliente, agendamento = null }) {
  const cfg = await getConfig();
  const svc = agendamento && await db.get('SELECT * FROM services WHERE id=?', agendamento.service_id);
  const prof = agendamento && await db.get('SELECT * FROM staff WHERE id=?', agendamento.staff_id);

  let dias = '';
  if (cliente) {
    const ult = await db.get(
      `SELECT data FROM appointments WHERE client_id=? AND status='concluido' ORDER BY data DESC LIMIT 1`,
      cliente.id
    );
    if (ult) dias = String(diasEntre(ult.data, hoje()));
  }

  return {
    cliente: (cliente?.nome || '').split(' ')[0],
    servico: svc?.nome || '',
    profissional: (prof?.nome || '').split(' ')[0],
    data: agendamento ? fmtData(agendamento.data) : fmtDataBR(cliente?.nascimento).slice(0, 5),
    hora: agendamento?.hora || '',
    valor: agendamento ? brl(agendamento.valor) : '',
    estudio: cfg.nome || '',
    endereco: cfg.endereco || '',
    link: cfg.linkAvaliacao || '',
    dias,
  };
}

export const TEMPLATES_PADRAO = [
  { chave: 'confirmacao', titulo: 'Agendamento confirmado', tipo: 'auto',
    quando: 'Assim que a cliente agenda',
    texto: 'Oi {cliente}! 💅 Seu horário no {estudio} está confirmado:\n\n📅 {data} às {hora}\n✨ {servico} com {profissional}\n💰 {valor}\n\n📍 {endereco}\n\nQualquer imprevisto, é só chamar por aqui. Até lá!' },

  { chave: 'lembrete_vespera', titulo: 'Lembrete da véspera', tipo: 'auto',
    quando: 'Todo dia às 18h, para os horários de amanhã',
    texto: 'Oi {cliente}, passando pra lembrar do seu horário amanhã 😊\n\n⏰ {data} às {hora}\n✨ {servico} com {profissional}\n\nConsegue vir? Responde com *SIM* pra confirmar ou *REMARCAR* que a gente ajeita.' },

  { chave: 'lembrete_dia', titulo: 'Aviso no dia', tipo: 'auto',
    quando: '3 horas antes do horário',
    texto: 'Oi {cliente}! Seu horário é hoje às {hora} ✨\nTe espero aqui: {endereco}\n\nSe precisar de algo antes, é só me chamar.' },

  { chave: 'pos_atendimento', titulo: 'Pós-atendimento', tipo: 'auto',
    quando: '1 dia depois do atendimento',
    texto: 'Oi {cliente}, tudo bem? Como ficou o resultado do seu {servico}? 💕\n\nSe curtiu, sua avaliação no Google ajuda demais a gente: {link}\n\nE se quiser já deixar o próximo horário reservado, é só responder aqui.' },

  { chave: 'aniversario', titulo: 'Semana do aniversário', tipo: 'auto',
    quando: '7 dias antes do aniversário',
    texto: 'Feliz mês de vida nova, {cliente}! 🎂✨\n\nPra comemorar, você tem *20% OFF* em qualquer serviço na semana do seu aniversário ({data}).\n\nMe chama aqui que eu já separo o melhor horário pra você.' },

  { chave: 'reativacao', titulo: 'Saudade (60 dias sem voltar)', tipo: 'auto',
    quando: '60 dias após o último atendimento',
    texto: 'Oi {cliente}, quanto tempo! 🥺 Faz {dias} dias desde seu último {servico} aqui no {estudio}.\n\nSeparei um *mimo de retorno*: 15% na sua próxima sessão. Vale pelos próximos 10 dias.\n\nQuer que eu veja um horário pra essa semana?' },

  { chave: 'dia_mulher', titulo: 'Dia da Mulher · 08/03', tipo: 'campanha',
    quando: 'Campanha sazonal',
    texto: 'Oi {cliente}! Semana do Dia da Mulher e aqui no {estudio} quem se cuida é você 💐\n\nDe 04 a 09/03: *combo mão + pé + design* por R$ 149 (de R$ 185).\n\nSão poucos horários. Quer que eu reserve o seu?' },

  { chave: 'natal', titulo: 'Natal e fim de ano', tipo: 'campanha',
    quando: 'Campanha sazonal',
    texto: 'Oi {cliente}, o ano tá acabando e você merece chegar linda nas festas 🎄✨\n\nAgenda de dezembro aberta — e vale-presente disponível pra dar de presente.\n\nQual semana fica melhor pra você?' },

  { chave: 'vaga', titulo: 'Vaga de última hora', tipo: 'campanha',
    quando: 'Disparo manual quando alguém cancela',
    texto: 'Oi {cliente}! Abriu uma vaga hoje às {hora} 🙌\n\nSe quiser aproveitar, me responde nos próximos minutos que eu seguro pra você.' },

  { chave: 'promocao', titulo: 'Promoção do mês', tipo: 'campanha',
    quando: 'Disparo manual',
    texto: 'Oi {cliente}! Promoção da semana no {estudio} ✨\n\n{servico} por {valor} — só até sexta.\n\nQuer garantir? Me responde que eu já reservo.' },
];
