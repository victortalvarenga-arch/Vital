/** Utilidades de data. Tudo em texto ISO local, sem Date com fuso, de propósito. */

export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad = n => String(n).padStart(2, '0');

/** Data de hoje no fuso configurado (padrão America/Sao_Paulo), como 'YYYY-MM-DD'. */
export function hoje(tz = process.env.TZ_ESTUDIO || 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Hora atual no fuso do estúdio, como 'HH:MM'. */
export function agora(tz = process.env.TZ_ESTUDIO || 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).replace('.', ':');
}

export const addDias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const diaSemana = iso => new Date(iso + 'T12:00:00Z').getUTCDay();

export const diasEntre = (a, b) =>
  Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

export const toMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
export const toHora = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export const fmtData = iso => {
  const d = new Date(iso + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};
export const fmtDataBR = iso => iso ? iso.split('-').reverse().join('/') : '';
export const brl = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Só dígitos. Aceita '(47) 99999-9999' e devolve '47999999999'. */
export const soDigitos = s => String(s || '').replace(/\D/g, '');

/** Normaliza para o formato que a API do WhatsApp espera: 55 + DDD + número. */
export function foneE164(fone) {
  let d = soDigitos(fone);
  if (d.startsWith('55') && d.length >= 12) return d;
  return '55' + d;
}

export const waLink = (fone, texto) =>
  `https://wa.me/${foneE164(fone)}?text=${encodeURIComponent(texto)}`;
