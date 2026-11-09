/**
 * O tratador de erro da aplicação: o último middleware de `app.js`.
 *
 * **A mensagem de dentro não sai.** Erro de banco carrega nome de tabela,
 * coluna e restrição; devolvê-lo ao navegador é dar o mapa do esquema a quem
 * provoca erro de propósito numa rota pública. O detalhe vai para o log, onde
 * o suporte o encontra. A tela lê só `erro` (`painel-api.js`, `publico.js`).
 *
 * **Pedido errado não é falha do servidor.** JSON malformado ou corpo grande
 * demais chegam aqui com `status` 4xx do `express.json`, e viravam 500 com o
 * texto do interpretador de JSON — e uma linha de pilha no log a cada pedido,
 * que um robô mandando lixo transformava em log inútil. Agora são 400/413, sem
 * log, porque o defeito é de quem mandou.
 */
const MOTIVO_DO_CLIENTE = {
  400: 'pedido inválido',
  413: 'conteúdo grande demais',
};

// Os quatro argumentos são o que faz o Express tratar isto como handler de erro.
export function tratarErro(err, req, res, _next) {
  const status = Number(err?.status || err?.statusCode);
  if (status >= 400 && status < 500 && err.expose) {
    return res.status(status).json({ erro: MOTIVO_DO_CLIENTE[status] || 'pedido inválido' });
  }

  console.error(err);
  // A requisição é uma transação (`db.naRequisicao`): o que ela gravou antes
  // de quebrar é desfeito, em vez de ficar pela metade.
  res.locals.desfazer = true;
  res.status(500).json({ erro: 'erro interno' });
}
