import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { R2_ATIVO, subirParaR2 } from './lib/r2.js';
import { PASTA } from './routes/uploads.js';

/**
 * Sobe tudo que já está em `server/uploads/` para o bucket R2, na mesma
 * chave `<empresa>/<arquivo>` que `uploads.js` grava dali em diante.
 *
 * Existe porque o adaptador (ver r2.js) só cobre o que sobe *depois* dele
 * estar configurado — as fotos da Laura Faust, geradas antes disso existir,
 * ficaram em disco. Roda uma vez por lote de arquivo novo em disco que
 * precise ir para o bucket; é idempotente (PutObject sobrescreve a mesma
 * chave), então rodar de novo por engano não duplica nada.
 */

const TIPOS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

if (!R2_ATIVO) {
  console.error(
    'R2 não configurado. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY ' +
    'e R2_BUCKET no .env antes de rodar `npm run uploads:subir`.'
  );
  process.exit(1);
}

async function* arquivos(dir) {
  let itens;
  try {
    itens = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return; // pasta não existe (máquina nova, sem nada em disco ainda) — nada para subir
  }
  for (const item of itens) {
    const completo = path.join(dir, item.name);
    if (item.isDirectory()) yield* arquivos(completo);
    else yield completo;
  }
}

let enviados = 0, ignorados = 0;
for await (const caminho of arquivos(PASTA)) {
  const chave = path.relative(PASTA, caminho).split(path.sep).join('/');
  const tipo = TIPOS[path.extname(caminho).toLowerCase()];
  if (!tipo) {
    console.log(`pulei (extensão não reconhecida): ${chave}`);
    ignorados++;
    continue;
  }
  const bytes = await fs.promises.readFile(caminho);
  await subirParaR2(chave, bytes, tipo);
  console.log(`subiu: ${chave}`);
  enviados++;
}

console.log(`\n${enviados} arquivo(s) enviados, ${ignorados} ignorado(s).`);
if (enviados > 0) {
  console.log(
    'As URLs em uploads/config apontando para /uploads/... continuam servindo do disco local. ' +
    'Rode `npm run reset` (ou ajuste a config pelo painel) para as referências passarem a usar UPLOADS_BASE_URL.'
  );
}
