import { db } from '../db.js';

/**
 * O registro do painel: quem fez o quê, dentro da empresa.
 *
 * A rota chama `req.registrar(...)` no ponto em que já sabe o que mudou — e é
 * por isso que não é middleware. Middleware gravaria toda escrita, o que soa
 * mais seguro e dá um registro pior: o painel chama `gerar-fila` a cada
 * carregamento, e a lista útil afogaria em ruído. Pior, o middleware só sabe
 * "PUT /api/agendamentos/abc123" — nunca "cancelou o horário da Maria".
 *
 * **Grava antes da resposta sair, na mesma conexão da requisição.** Depois seria
 * fora do `comEmpresa`, sem empresa definida, e o RLS recusaria — além de
 * registrar coisa que talvez não tenha acontecido.
 *
 * O registro nunca derruba a operação. Falhar ao gravar o histórico é ruim;
 * fazer o cancelamento falhar porque o histórico falhou é pior.
 */

/** Instala `req.registrar` em toda requisição do painel. */
export function comRegistro(req, res, next) {
  req.registrar = async (acao, dados = {}) => {
    // Sem usuário não há o que registrar: rota pública não tem autor, e a
    // cliente que agenda pelo site não é "quem fez algo no painel".
    if (!req.usuario) return;
    try {
      await db.run(
        `INSERT INTO logs (user_id, usuario_nome, acao, alvo_tipo, alvo_id, resumo, detalhe)
         VALUES (?,?,?,?,?,?,?)`,
        req.usuario.id, req.usuario.nome || '', acao,
        dados.alvoTipo || acao.split('.')[0], String(dados.alvoId || ''),
        String(dados.resumo || '').slice(0, 300),
        JSON.stringify(dados.detalhe || {})
      );
    } catch (erro) {
      console.error('[registro] não consegui gravar:', erro.message);
    }
  };
  next();
}

/**
 * Registra algo que o sistema fez sozinho, sem ninguém ter clicado.
 *
 * `user_id` fica nulo e o nome vira "sistema": o dono precisa conseguir
 * separar, na mesma lista, o que uma pessoa decidiu do que o relógio fez —
 * senão o fechamento automático apareceria como se alguém tivesse marcado
 * atendimento por atendimento.
 *
 * Precisa rodar dentro de `db.comEmpresa`, como todo código de cron.
 */
export async function registrarDoSistema(acao, dados = {}) {
  try {
    await db.run(
      `INSERT INTO logs (user_id, usuario_nome, acao, alvo_tipo, alvo_id, resumo, detalhe)
       VALUES (NULL,?,?,?,?,?,?)`,
      'sistema', acao,
      dados.alvoTipo || acao.split('.')[0], String(dados.alvoId || ''),
      String(dados.resumo || '').slice(0, 300),
      JSON.stringify(dados.detalhe || {})
    );
  } catch (erro) {
    console.error('[registro] não consegui gravar:', erro.message);
  }
}

/**
 * O que mudou entre dois estados, só nos campos que interessam.
 *
 * Guardar o objeto inteiro antes e depois encheria o registro de campo que não
 * mudou, e a pessoa que abre a tela para entender uma alteração teria de
 * procurar. Aqui sai `{ campo: [antes, depois] }` e nada mais.
 */
export function mudancas(antes, depois, campos) {
  const saida = {};
  for (const c of campos) {
    const a = antes?.[c] ?? null;
    const d = depois?.[c] ?? null;
    if (String(a) !== String(d)) saida[c] = [a, d];
  }
  return saida;
}
