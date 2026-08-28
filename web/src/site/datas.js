/**
 * Datas como texto, nunca `Date` com fuso — mesma regra do servidor.
 *
 * O negócio opera num fuso só. Converter para `Date` e voltar é o caminho mais
 * curto para o agendamento aparecer um dia antes para quem está com o relógio
 * do celular em outro lugar.
 */

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const mesDe = iso => iso.slice(0, 7);

export const nomeDoMes = mes => {
  const [ano, m] = mes.split('-').map(Number);
  return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${ano}`;
};

export const porExtenso = iso => {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const semana = SEMANA[new Date(a, m - 1, d).getDay()];
  return `${semana}, ${d} de ${MESES_CURTOS[m - 1]}`;
};

export { brl } from '../shared/formato.js';

export const duracaoTexto = min =>
  min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min}min`;

export const soDigitos = t => (t || '').replace(/\D/g, '');

export const mascaraFone = t => {
  const d = soDigitos(t).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
