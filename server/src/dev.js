/**
 * O mesmo servidor de `index.js`, mas marcado como desenvolvimento.
 *
 * Existe por um motivo só: em desenvolvimento quem serve as telas é o Vite, no
 * `:5173`, e o Express **não deve** servir `web/dist`. A pasta é apagada do
 * Git, mas fica na máquina de quem rodou `npm run build` uma vez — e a partir
 * daí o `:3333` entregava aquele build velho para sempre, com a aparência de
 * código que não atualiza e sem erro nenhum para denunciar. Foi o que
 * aconteceu em 2026-11-15.
 *
 * Marcar aqui, e não no `package.json`, é o que faz a marca valer no Windows
 * também: `NODE_ENV=x comando` é sintaxe de shell POSIX, e o PowerShell a
 * recusa. `??=` deixa quem definir a variável por fora no comando.
 *
 * `node --watch` acompanha todo arquivo que o processo carrega, não só a
 * entrada, então o reinício automático continua valendo para `src/` inteiro.
 */
process.env.NODE_ENV ??= 'development';

await import('./index.js');
