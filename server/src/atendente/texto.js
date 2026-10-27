/**
 * Utilidades de texto dos guardrails do atendente. Puro: sem banco, sem rede.
 *
 * Toda comparação de regra é feita sobre o texto normalizado — minúsculo, sem
 * acento, espaços colapsados. Escrever "não dói", "nao doi" e "NÃO DÓI" tem de
 * dar no mesmo, senão a regra vira loteria de digitação.
 */

export function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quebra em frases para a regra citar o trecho exato, e não a mensagem inteira. */
export function frases(texto) {
  return String(texto || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(f => f.trim())
    .filter(Boolean);
}

/** Valor em reais para número: "1.250,50" → 1250.5; "180" → 180. */
export function reaisParaNumero(bruto) {
  const s = String(bruto).replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "15h", "15:30", "9h30", "09:00" → "15:00", "15:30", "09:30", "09:00". */
export function horaNormal(h, m) {
  const hh = Number(h);
  const mm = m === undefined || m === '' ? 0 : Number(m);
  if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Tudo o que uma fonte permite dizer, em formas comparáveis: números, horas e
 * datas (dia/mês). Lido de texto livre e de JSON de ferramenta do mesmo jeito.
 */
export function fatosDe(texto) {
  const s = String(texto || '');
  const numeros = new Set();
  const horas = new Set();
  const datas = new Set();

  // Datas ISO das ferramentas viram dia/mês, que é como a resposta escreve.
  for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    datas.add(`${Number(m[3])}/${Number(m[2])}`);
    numeros.add(Number(m[3]));
    numeros.add(Number(m[1]));
  }
  for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    datas.add(`${Number(m[1])}/${Number(m[2])}`);
  }
  for (const m of s.matchAll(/\b(\d{1,2})(?::(\d{2})|h(\d{2})?)/g)) {
    const h = horaNormal(m[1], m[2] ?? m[3]);
    if (h) horas.add(h);
  }
  for (const m of s.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = reaisParaNumero(m[0]);
    if (n !== null) numeros.add(n);
    // "1250.5" no JSON e "1.250,50" na frase são o mesmo valor; e "180.00"
    // vira 180, como a frase escreveria.
    const cru = Number(m[0]);
    if (Number.isFinite(cru)) numeros.add(cru);
  }
  return { numeros, horas, datas };
}

/** Junta os fatos de várias fontes num só conjunto. */
export function juntarFatos(lista) {
  const total = { numeros: new Set(), horas: new Set(), datas: new Set() };
  for (const texto of lista) {
    const f = fatosDe(texto);
    for (const k of Object.keys(total)) for (const v of f[k]) total[k].add(v);
  }
  return total;
}
