import { toMin } from '../shared/tempo.js';

/** Abaixo disto o aviso muda de cor: dá para agir, mas é agora. */
const MINUTOS_URGENTE = 180;

/**
 * Quanto falta para a mensagem deixar de valer, para quem olha a fila.
 *
 * Texto e minutos, sem `Date` com fuso, como o resto da agenda. `23:59` é o "fim
 * do dia" dos prazos do servidor: escrever a hora ali seria ruído.
 */
export function prazoDaMensagem(expiraEm, hoje, minutoAgora) {
  if (!expiraEm) return null;
  const data = expiraEm.slice(0, 10);
  const hora = expiraEm.slice(11);
  const dias = Math.round((Date.parse(data) - Date.parse(hoje)) / 864e5);
  const falta = dias * 1440 + toMin(hora) - minutoAgora;
  const aHora = hora === '23:59' ? '' : ` às ${hora}`;

  const urgente = falta <= MINUTOS_URGENTE;
  if (falta <= 0) return { texto: 'Expirando agora', urgente };
  if (falta < 60) return { texto: `Expira em ${falta} min`, urgente };
  if (urgente) return { texto: `Expira em ${Math.floor(falta / 60)}h`, urgente };
  if (dias === 0) return { texto: `Expira hoje${aHora}`, urgente };
  if (dias === 1) return { texto: `Expira amanhã${aHora}`, urgente };
  return { texto: `Expira em ${dias} dias`, urgente };
}
