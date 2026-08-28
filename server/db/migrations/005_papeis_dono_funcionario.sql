-- 005 · Só dois papéis: dono e funcionário.
--
-- "gerente" saiu. Ele existia como um meio-termo — via financeiro e cadastros,
-- mas não configurava o site — e na prática um estúdio pequeno não tem essa
-- pessoa: ou é a dona, ou é quem atende. Menos papel é menos regra para manter
-- coerente entre tela e rota, e voltar a criar um é barato se aparecer o caso.
--
-- Quem era gerente vira DONO, não funcionário. O gerente já tinha financeiro,
-- cadastros e equipe: rebaixá-lo tirava acesso que a empresa tinha concedido de
-- propósito, e alguém ficaria trancado para fora do próprio trabalho sem
-- entender por quê. O que ele ganha é só a configuração do site.
--
-- Se um dia isto rodar sobre base com cliente real, vale conferir a lista antes:
--   SELECT id, nome, email FROM users WHERE papel = 'gerente';
UPDATE users SET papel = 'dono' WHERE papel = 'gerente';

-- Guarda o combinado no próprio banco. Papel inválido vindo de um bug de
-- código passaria despercebido até alguém reparar que a pessoa vê demais.
ALTER TABLE users ADD CONSTRAINT papel_valido
  CHECK (papel IN ('dono', 'funcionario'));

-- Funcionário enxerga o que é dele — a própria agenda, a própria produção — e
-- isso depende de saber QUEM ele é na equipe. Sem `staff_id`, "o meu" não tem
-- resposta e a tela fica vazia sem explicação. Não dá para exigir por CHECK
-- porque o dono normalmente não é um profissional da agenda; quem cobra é a
-- rota de criação.
COMMENT ON COLUMN users.staff_id IS
  'Quem esta pessoa é na agenda. Obrigatório para papel=funcionario.';
