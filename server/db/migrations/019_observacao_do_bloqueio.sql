-- 019 · Observação no bloqueio: o detalhe que não cabe no motivo.
--
-- `motivo` é o rótulo curto que a tela agrupa e filtra ("Almoço", "Férias") —
-- a lista de tipos do filtro sai dele. Misturar ali "volta dia 15, cobrir com
-- a Bia" faria cada bloqueio virar um tipo diferente, e o filtro deixaria de
-- servir. A observação é texto livre que só se lê, nunca se agrupa.
--
-- Default '' e não nulo, como `motivo`: quem lê não precisa tratar dois vazios.

ALTER TABLE blocks ADD COLUMN obs TEXT NOT NULL DEFAULT '';
