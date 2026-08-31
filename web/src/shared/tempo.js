/**
 * Contas de hora e data, compartilhadas entre as telas do painel.
 *
 * Vive em `shared/` pelo mesmo motivo de `formato.js`: mais de uma tela
 * precisa da mesma conta, e duplicá-la é a próxima divergência de fuso ou
 * arredondamento esperando acontecer — a Agenda e o Resumo desenham a
 * própria grade de horário em cima destas mesmas funções.
 *
 * Este módulo não fala com a API.
 */

/** 'HH:MM' → minutos desde a meia-noite. */
export const toMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

/** Minutos desde a meia-noite → 'HH:MM'. */
export const toHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Data de hoje, 'YYYY-MM-DD', no fuso do navegador de quem está com o painel aberto. */
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Iniciais de um nome, até duas letras — para o avatar redondo. */
export const iniciais = n => n.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
