// Casos do hook regras-vital.mjs: `node .claude/hooks/regras-vital.test.mjs`.
// Cada regra tem um caso que ela barra e um parecido que deixa passar.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('./regras-vital.mjs', import.meta.url));
const R = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/');

function rodar(modo, entrada) {
  const r = spawnSync(process.execPath, [HOOK, modo], { input: JSON.stringify(entrada), encoding: 'utf8' });
  return r.status;
}
const edit = (f, novo, velho = '') => ({ tool_name: 'Edit', tool_input: { file_path: R + f, old_string: velho, new_string: novo } });
const write = (f, c) => ({ tool_name: 'Write', tool_input: { file_path: R + f, content: c } });
const sh = c => ({ tool_name: 'PowerShell', tool_input: { command: c } });

const casos = [
  ['tenant_id em rota', 'pre-edit', edit('server/src/routes/clientes.js', "await db.all('SELECT * FROM clients WHERE tenant_id = ?', x)"), 2],
  ['tenant_id com marca', 'pre-edit', edit('server/src/routes/suporte.js', "x('WHERE tenant_id = ?') // regra-vital: ok (plataforma.tickets)"), 0],
  ['tenant_id em comentario', 'pre-edit', edit('server/src/db.js', '  // o RLS lê app.tenant_id'), 0],
  ['tenant_id ja existente (Write igual)', 'pre-edit', write('server/src/routes/suporte.js', readFileSync(R + 'server/src/routes/suporte.js', 'utf8')), 0],
  ['Promise.all', 'pre-edit', edit('server/src/routes/clientes.js', 'const [a,b] = await Promise.all([db.get(x), db.all(y)]);'), 2],
  ['Promise.all em comentario', 'pre-edit', edit('server/src/app.js', '  // em sequência, não em Promise.all('), 0],
  ['className ad-', 'pre-edit', edit('web/src/site/Clinica.jsx', '<div className="ad-slider">'), 2],
  ['className banner template', 'pre-edit', edit('web/src/site/Clinica.jsx', '<div className={`topo ${x} banner`}>'), 2],
  ['texto banner fora da classe', 'pre-edit', edit('web/src/site/Clinica.jsx', '<p className="nota">Troque o banner da capa</p>'), 0],
  ['classe load-x', 'pre-edit', edit('web/src/site/Clinica.jsx', '<div className="load-ad x-ad">'), 0],
  ['css .ad-', 'pre-edit', edit('web/src/site/styles.css', '.ad-slider { display: grid }'), 2],
  ['css .comparar', 'pre-edit', edit('web/src/site/styles.css', '.comparar { display: grid }'), 0],
  ['site importa painel-api', 'pre-edit', edit('web/src/site/App.jsx', "import { api } from '../shared/painel-api.js';"), 2],
  ['site importa publico', 'pre-edit', edit('web/src/site/App.jsx', "import { api } from '../shared/publico.js';"), 0],
  ['painel importa painel-api', 'pre-edit', edit('web/src/painel/App.jsx', "import { api } from '../shared/painel-api.js';"), 0],
  ['vital importa publico', 'pre-edit', edit('web/src/vital/App.jsx', "import { x } from '../shared/publico.js';"), 2],
  ['teste importa src no topo', 'pre-edit', edit('server/test/novo.test.js', "import { db } from '../src/db.js';"), 2],
  ['teste await import topo', 'pre-edit', edit('server/test/novo.test.js', "const m = await import('../src/db.js');"), 2],
  ['teste import dentro do before', 'pre-edit', edit('server/test/novo.test.js', "  const m = await import('../src/db.js');"), 0],
  ['migration aplicada', 'pre-edit', edit('server/db/migrations/036_fila_com_prazo.sql', 'x', 'y'), 2],
  ['migration nova', 'pre-edit', write('server/db/migrations/999_nova.sql', 'CREATE TABLE x();'), 0],
  ['.env descartavel', 'pre-edit', edit('server/.env', 'VITAL_BANCO_DESCARTAVEL=sim'), 2],
  ['shell iwr json', 'pre-shell', sh("Invoke-RestMethod -Method Post -Body ($o | ConvertTo-Json) http://x"), 2],
  ['shell iwr sem json', 'pre-shell', sh('Invoke-WebRequest http://localhost:3000/api/saude'), 0],
  ['shell env descartavel', 'pre-shell', sh("$env:VITAL_BANCO_DESCARTAVEL='sim'; npm run reset"), 2],
  ['shell npm test', 'pre-shell', sh('cd server; npm test'), 0],
];

let falhas = 0;
for (const [nome, modo, entrada, esperado] of casos) {
  const s = rodar(modo, entrada);
  const ok = s === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: saiu ${s}, esperado ${esperado}`);
}
console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
process.exit(falhas ? 1 : 0);
