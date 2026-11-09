// Hooks do Claude Code deste repositório (ligados em .claude/settings.json).
//
// Cada regra aqui é uma frase do CLAUDE.md que já falhou uma vez sem erro no
// console: a tela quebrou, o banco foi apagado, o acento virou lixo. Lembrar
// não bastou, então a ferramenta recusa a escrita e diz por quê.
//
// Só olha as linhas que a edição acrescenta: o código que já existe (como
// `tenant_id` em `plataforma.*`, que não tem RLS) não dispara nada. Uso
// legítimo novo leva `regra-vital: ok` na mesma linha, com o motivo — fica à
// vista na revisão, que é o ponto.
//
// Modos: pre-edit (PreToolUse em Edit/Write), pre-shell (PreToolUse em
// PowerShell/Bash), lint (PostToolUse em Edit/Write).

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const EXCECAO = /regra-vital:\s*ok/;
const COMENTARIO = /^\s*(\/\/|\*|\/\*)/;

function lerEntrada() {
  // O PowerShell 5.1 põe BOM no que manda pelo pipe, e o JSON.parse recusa.
  const BOM = String.fromCharCode(0xfeff);
  try { return JSON.parse(readFileSync(0, 'utf8').replace(BOM, '') || '{}'); } catch { return {}; }
}

function recusar(motivos) {
  process.stderr.write(
    'Recusado pelas regras do CLAUDE.md (.claude/hooks/regras-vital.mjs):\n\n' +
    motivos.map(m => '- ' + m).join('\n') + '\n'
  );
  process.exit(2);
}

function relativo(arquivo) {
  if (!arquivo) return '';
  return path.relative(RAIZ, path.resolve(RAIZ, arquivo)).replace(/\\/g, '/');
}

/** Linhas de `depois` que não estavam em `antes`, contando repetição. */
function linhasNovas(antes, depois) {
  const sobra = new Map();
  for (const l of antes.split(/\r?\n/)) sobra.set(l, (sobra.get(l) || 0) + 1);
  const novas = [];
  for (const l of depois.split(/\r?\n/)) {
    const n = sobra.get(l) || 0;
    if (n > 0) sobra.set(l, n - 1); else novas.push(l);
  }
  return novas;
}

function trocas(ferramenta, entrada, absoluto) {
  if (ferramenta === 'Write') {
    const antes = existsSync(absoluto) ? readFileSync(absoluto, 'utf8') : '';
    return [{ antes, depois: entrada.content || '' }];
  }
  if (ferramenta === 'MultiEdit') {
    return (entrada.edits || []).map(e => ({ antes: e.old_string || '', depois: e.new_string || '' }));
  }
  return [{ antes: entrada.old_string || '', depois: entrada.new_string || '' }];
}

function migrationVersionada(rel) {
  const r = spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: RAIZ, stdio: 'ignore' });
  return r.status === 0;
}

const IMPORTA = /^\s*import\b|\bfrom\s+['"]|\bimport\s*\(/;

/** [aplica-se ao arquivo?, linha quebra a regra?, explicação] */
const REGRAS = [
  {
    arquivo: rel => /^server\/src\/.+\.m?js$/.test(rel),
    linha: l => !COMENTARIO.test(l) && /\btenant_id\b/.test(l),
    motivo: '`tenant_id` em consulta. O banco filtra e preenche sozinho (RLS); ver ARQUITETURA.md. ' +
      'Se é `plataforma.*` ou outra tabela sem RLS, marque a linha com `// regra-vital: ok (plataforma.X não tem RLS)`.',
  },
  {
    arquivo: rel => /^server\/src\/.+\.m?js$/.test(rel),
    linha: l => !COMENTARIO.test(l) && /Promise\.all(Settled)?\s*\(/.test(l),
    motivo: '`Promise.all` no servidor. A requisição roda numa conexão só, que atende uma consulta por vez: ' +
      'faça em sequência. Se não há banco envolvido, marque com `// regra-vital: ok (sem banco)`.',
  },
  {
    arquivo: rel => /^web\/src\/.+\.(jsx?|mjs)$/.test(rel),
    linha: l => [...l.matchAll(/className\s*=\s*(\{`[^`]*`\}|"[^"]*"|'[^']*'|\{[^}]*\})/g)]
      .some(m => /(^|[\s"'`{(+])(ad-[\w-]*|banner|anuncio|patrocinado|sponsor)\b/.test(m[1])),
    motivo: '`className` com `ad-`, `banner`, `anuncio`, `patrocinado` ou `sponsor`. Bloqueador de anúncio ' +
      'esconde por nome de classe, sem erro no console (foi o que sumiu com o antes/depois da Clínica).',
  },
  {
    arquivo: rel => /^web\/src\/.+\.css$/.test(rel),
    linha: l => /\.(ad-[\w-]*|banner|anuncio|patrocinado|sponsor)\b/.test(l),
    motivo: 'Seletor `.ad-*`, `.banner`, `.anuncio`, `.patrocinado` ou `.sponsor`. Bloqueador de anúncio esconde ' +
      'por nome de classe — escolha outro nome.',
  },
  {
    arquivo: rel => /^web\/src\/site\//.test(rel),
    linha: l => IMPORTA.test(l) && /painel-api|\/vital\//.test(l),
    motivo: 'O site importa só `shared/publico.js`, nunca `painel-api.js` nem o cliente da Vital: ' +
      'é o que mantém a credencial do painel fora do bundle público.',
  },
  {
    arquivo: rel => /^web\/src\/vital\//.test(rel),
    linha: l => IMPORTA.test(l) && /painel-api|shared\/publico/.test(l),
    motivo: '`web/src/vital/` tem cliente de API próprio e não importa `painel-api.js` nem `publico.js`: ' +
      'são três identidades, e misturá-las num arquivo é o começo de misturá-las numa sessão.',
  },
  {
    arquivo: rel => /^server\/test\/.+\.m?js$/.test(rel),
    linha: l => /^import\b[^;]*['"]\.\.\/src\//.test(l) || /^(const|let|var|await)\b.*import\(\s*['"]\.\.\/src\//.test(l),
    motivo: 'Teste importando `src/` no topo. `db.js` monta o pool na carga do módulo e prende no banco de ' +
      'trabalho — já apagou o banco de desenvolvimento. Importe dentro do `before()`, depois de `prepararBanco()`.',
  },
  {
    arquivo: rel => /(^|\/)\.env[^/]*$/.test(rel),
    linha: l => /VITAL_BANCO_DESCARTAVEL/.test(l),
    motivo: '`VITAL_BANCO_DESCARTAVEL` não se acrescenta por conta própria para "fazer o comando rodar". ' +
      'Quem decide que um banco é descartável é a pessoa, à mão.',
  },
];

function preEdit(entrada) {
  const ferramenta = entrada.tool_name;
  const dados = entrada.tool_input || {};
  const absoluto = path.resolve(RAIZ, dados.file_path || '');
  const rel = relativo(dados.file_path);
  if (!rel || rel.startsWith('..')) return;

  if (/^server\/db\/migrations\/.+\.sql$/.test(rel) && existsSync(absoluto) && migrationVersionada(rel)) {
    recusar([`\`${rel}\` já está no Git, então já foi aplicada em algum banco. Nunca edite migration aplicada: crie a próxima.`]);
  }

  const motivos = new Set();
  for (const { antes, depois } of trocas(ferramenta, dados, absoluto)) {
    for (const l of linhasNovas(antes, depois)) {
      if (EXCECAO.test(l)) continue;
      for (const r of REGRAS) {
        if (r.arquivo(rel) && r.linha(l)) motivos.add(`${r.motivo}\n  Linha: ${l.trim().slice(0, 160)}`);
      }
    }
  }
  if (motivos.size) recusar([...motivos]);
}

function preShell(entrada) {
  const cmd = String(entrada.tool_input?.command || '');
  const motivos = [];
  if (/\b(Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i.test(cmd) && /ConvertTo-Json/i.test(cmd)) {
    motivos.push('PowerShell com `ConvertTo-Json` corrompe UTF-8 no corpo da requisição ("Depilação" virou ' +
      '"Depila��o" no banco). Para gravar dado de teste, escreva um script Node no scratchpad e rode com `node`.');
  }
  if (/VITAL_BANCO_DESCARTAVEL/.test(cmd) && /(=|Set-Item|Add-Content|Set-Content|Out-File|>)/i.test(cmd)) {
    motivos.push('`VITAL_BANCO_DESCARTAVEL` não se define por conta própria para "fazer o comando rodar". ' +
      'Se o comando recusou o banco, pare e pergunte.');
  }
  if (motivos.length) recusar(motivos);
}

function lint(entrada) {
  const arquivo = entrada.tool_input?.file_path;
  const rel = relativo(arquivo);
  if (!rel || rel.startsWith('..') || !/\.(m?js|jsx)$/.test(rel)) return;
  const eslint = path.join(RAIZ, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (!existsSync(eslint)) return;
  const r = spawnSync(process.execPath, [eslint, '--no-warn-ignored', rel], { cwd: RAIZ, encoding: 'utf8' });
  if (r.status === 1) {
    process.stderr.write(`ESLint acusou em ${rel} (o lint precisa passar antes do commit):\n${r.stdout}`);
    process.exit(2);
  }
}

// Sem Git Bash no Windows, saída diferente de 0 e 2 é tratada como recusa:
// um defeito aqui travaria toda edição e todo comando da sessão. Defeito do
// guarda libera e avisa; quem recusa é só `recusar()`, com exit 2.
try {
  const modo = process.argv[2];
  const entrada = lerEntrada();
  if (modo === 'pre-edit') preEdit(entrada);
  else if (modo === 'pre-shell') preShell(entrada);
  else if (modo === 'lint') lint(entrada);
} catch (e) {
  process.stderr.write(`regras-vital.mjs falhou e deixou passar: ${e.message}\n`);
  process.exit(0);
}
