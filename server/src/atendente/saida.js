import { frases, horaNormal, normalizar, reaisParaNumero } from './texto.js';

/**
 * Revisão de toda resposta da IA antes de ela sair. Puro: sem banco, sem rede.
 *
 * Desenho trazido do linter do projeto `genera_genui` do dono (ver ROADMAP,
 * Bloco 12), reescrito para conversa de agendamento:
 *
 *  - **família A, palavras e construções** (camada 0, de graça): diagnóstico,
 *    indicação de procedimento, remédio e dose, promessa de resultado, fingir
 *    ser gente, vazar o que é interno;
 *  - **família B, fundamentação** (camada 1): todo valor, horário, data e
 *    número da resposta tem de existir numa fonte desta conversa — o que as
 *    ferramentas devolveram, o catálogo, a configuração da clínica, ou o que a
 *    própria cliente escreveu. A IA não "lembra" preço: ou veio do sistema, ou
 *    não sai. Mesmo vale para link, procedimento citado e para dizer "agendei".
 *
 * Limite honesto (o mesmo de lá): é pertinência, não entendimento. Confere que
 * o 180 da resposta existe na fonte, não que é o preço do serviço certo. O juiz
 * (camada 2, `juiz.js`) cobre parte disso; o resto é o modo sombra no começo.
 *
 * A gravidade decide a ação, nunca a regra: `critico` bloqueia na hora,
 * `erro` pede uma nova tentativa, `aviso` passa e fica anotado.
 */

export const ROTULOS = {
  A01: 'Atribuiu uma condição de saúde à cliente',
  A02: 'Indicou procedimento para o caso da cliente',
  A03: 'Falou de remédio ou dose',
  A04: 'Prometeu resultado ou disse que não tem risco ou dor',
  A05: 'Disse que é uma pessoa',
  A06: 'Mostrou algo interno do sistema',
  B01: 'Valor que não veio do sistema',
  B02: 'Horário que não veio do sistema',
  B03: 'Data que não veio do sistema',
  B04: 'Número que não veio do sistema',
  B05: 'Procedimento que a clínica não oferece',
  B06: 'Link ou perfil que não é da clínica',
  B07: 'Disse que agendou ou cancelou sem ter feito',
  J01: 'O revisor apontou um problema',
  E01: 'Mensagem de saúde ou reação — passou para a equipe',
  E02: 'Pediu para falar com uma pessoa',
  E03: 'Reclamação — passou para a equipe',
  E04: 'A assistente pediu ajuda da equipe',
  E05: 'A resposta não passou na revisão — passou para a equipe',
};

const ORDEM = ['aviso', 'erro', 'critico'];
const maior = (a, b) => (ORDEM.indexOf(a) >= ORDEM.indexOf(b) ? a : b);

export function acaoPara(gravidade) {
  if (gravidade === 'critico') return 'bloquear';
  if (gravidade === 'erro') return 'refazer';
  return 'passa';
}

/* ── família A ── */

const CONDICOES =
  '(melasma|acne|rosacea|dermatite|psoriase|foliculite|celulite|flacidez|estrias?|alopecia|calvicie|queda de cabelo|manchas?|cicatriz(?:es)?|queloide|lesao|lesoes|hiperpigmentacao|envelhecimento precoce|olheiras?|papada|gordura localizada|varizes|vasinhos|infeccao|alergia|pele (?:oleosa|seca|sensivel|desidratada|acneica|madura))';

const DIAGNOSTICO = [
  new RegExp(`\\b(voce|sua pele|seu rosto|seu cabelo|seu couro cabeludo|seu corpo|sua barriga) (tem|esta com|apresenta|possui|sofre de|parece ter|deve ter|provavelmente tem) (um |uma |o |a |os |as )?${CONDICOES}`),
  new RegExp(`\\b(isso|essa mancha|isso ai|pelo que voce (descreveu|contou|falou)|pela foto|pelo que vi)\\b.{0,30}\\b(e|parece|deve ser|provavelmente e|indica) (um |uma |o |a )?${CONDICOES}`),
];

const INDICACAO = [
  /\bno seu caso\b/,
  /\bo (ideal|melhor|mais indicado|recomendado|certo) (pra|para) (voce|sua pele|seu caso|o seu caso|seu rosto|o seu rosto)\b/,
  /\b(eu )?(recomendo|indico|aconselho|sugiro) (que voce )?(faca|fazer|o procedimento|o tratamento|o protocolo|a aplicacao)\b/,
  /\bvoce (precisa|deveria|deve) (fazer|de um|de uma|realizar)\b/,
  /\b(precisa|vai precisar) de (\d+|duas|tres|quatro|cinco|seis|varias) sessoes\b/,
];
// Recomendar avaliação é exatamente o que queremos que a IA faça.
const PEDE_AVALIACAO = /\b(avaliacao|avaliar|consulta|a profissional (vai )?(ver|olhar|avaliar))\b/;

const DOSE = [
  /\b\d+([.,]\d+)?\s?(mg|mcg|ml|ui)\b/,
  /\b\d+\s?(gotas|comprimidos?|capsulas?|ampolas?)\b/,
  /\b\d+\s?unidades de (toxina|botox)\b/,
];
const REMEDIO =
  /\b(tome|tomar|tomando|use|usar|aplique|passe|suspenda|interrompa|pare de (tomar|usar)|comece a (tomar|usar))\b.{0,50}\b(remedio|medicamento|antibiotico|anti-?inflamatorio|corticoide|anticoagulante|analgesico|antialergico|aspirina|ibuprofeno|dipirona|paracetamol|isotretinoina|roacutan)\b/;
const PRODUTO =
  /\b(use|usar|aplique|passe|passar)\b.{0,40}\b(creme|pomada|acido|vitamina|oleo|serum)\b/;

const PROMESSA = [
  /\b(resultados?) (garantid\w*|certo|definitivo|permanente)\b/,
  /\bgarant(o|imos|ido|ida|idos|idas)\b/,
  /\b100 ?%/,
  /\b(elimina|eliminar|acaba com|acabar com|some com|remove|tira)\b.{0,30}\b(de vez|definitivamente|para sempre|pra sempre|totalmente|completamente)\b/,
  /\b(totalmente|completamente) (segur[oa]|indolor|natural)\b/,
  /\brejuvenesce \d+ anos\b/,
];
// Promessa negada não é promessa: "não dá para garantir resultado".
const NEGADO = /\b(nao|nem|nenhum\w*|impossivel|sem como)\b[^.!?]{0,30}$/;
const SEM_RISCO = [
  /\b(nao|nunca) (doi|machuca|tem dor|tem risco|tem efeito colateral|da reacao|deixa marca)\b/,
  /\bsem (nenhuma |nenhum |qualquer )?(dor|risco|efeito colateral|contraindicac\w*|reacao)\b/,
  /\b(zero|nenhum) risco\b/,
  /\b(nao|nunca) (vai )?(doer|incomodar)\b/,
];

const HUMANO = [
  /\bsou (uma |um )?(pessoa|humana|humano|atendente humana|gente de verdade)\b/,
  /\b(nao sou|nao e) (um |uma )?(robo|bot|ia|inteligencia artificial|assistente virtual|maquina)\b/,
];

const INTERNO = [
  /\b[a-z]+_[a-z_]+\b/,               // nome de ferramenta: ver_horarios, passar_para_equipe
  /\{\{|\}\}|<<<|\btenant\b|\bsystem prompt\b|\bminhas instrucoes\b/,
  /\b(id|servico_id|profissional_id)\s?[:=]/,
];

/* ── família B ── */

const SUBSTANCIAS = [
  'toxina botulinica', 'botox', 'acido hialuronico', 'preenchimento', 'bioestimulador',
  'sculptra', 'radiesse', 'fios de pdo', 'fio de pdo', 'peeling', 'laser', 'luz pulsada',
  'isotretinoina', 'roacutan', 'minoxidil', 'finasterida', 'tretinoina', 'hidroquinona',
  'enzima', 'intradermoterapia', 'mesoterapia', 'microagulhamento', 'ultraformer',
  'criolipolise', 'lipo de papada', 'harmonizacao', 'skinbooster', 'pdrn', 'exossomo',
];

const AGENDOU =
  /\b(agendei|marquei|reservei|(esta|ficou|foi) (agendad[oa]|marcad[oa]|reservad[oa]|confirmad[oa])|agendamento (feito|confirmado|realizado)|pronto,? (agendad[oa]|marcad[oa]))\b/;
const CANCELOU = /\b(cancelei|(esta|foi|ficou) cancelad[oa]|cancelamento (feito|confirmado|realizado))\b/;

/**
 * @param {string} texto  a resposta da IA
 * @param {object} ctx
 * @param {{numeros:Set<number>,horas:Set<string>,datas:Set<string>}} ctx.fatos
 *        o que as fontes desta conversa permitem dizer (`juntarFatos`)
 * @param {string} ctx.textoDaClinica  catálogo + informações da clínica, normalizado
 * @param {string} ctx.textoDaCliente  o que a cliente escreveu, normalizado
 * @param {string[]} ctx.links          endereços que podem sair (Instagram, mapa…)
 * @param {string[]} ctx.fones          telefones que podem sair, só dígitos
 * @param {{agendou?:boolean,cancelou?:boolean,consultou?:boolean}} ctx.acoes
 */
export function revisarResposta(texto, ctx) {
  const achados = [];
  const achar = (regra, gravidade, trecho) => achados.push({ regra, gravidade, trecho: String(trecho).slice(0, 160) });
  const permitido = ctx.textoDaClinica || '';
  const daCliente = ctx.textoDaCliente || '';

  for (const frase of frases(texto)) {
    const f = normalizar(frase);

    for (const re of DIAGNOSTICO) {
      const m = re.exec(f);
      // A cliente disse "meu melasma": repetir a palavra dela não é diagnóstico.
      if (m && !daCliente.includes(m[m.length - 1])) { achar('A01', 'erro', frase); break; }
    }
    if (!PEDE_AVALIACAO.test(f) && INDICACAO.some(re => re.test(f))) achar('A02', 'erro', frase);

    if (DOSE.some(re => re.test(f)) || REMEDIO.test(f)) achar('A03', 'critico', frase);
    else {
      const p = PRODUTO.exec(f);
      // Cuidado pós-procedimento que a própria clínica escreveu pode sair.
      if (p && !permitido.includes(p[p.length - 1])) achar('A03', 'erro', frase);
    }

    let prometeu = false;
    for (const re of PROMESSA) {
      const m = re.exec(f);
      if (m && !NEGADO.test(f.slice(0, m.index))) { prometeu = true; break; }
    }
    if (prometeu || SEM_RISCO.some(re => re.test(f))) achar('A04', 'erro', frase);

    if (HUMANO.some(re => re.test(f))) achar('A05', 'erro', frase);
    // Perfil e link têm sublinhado ("@estetica_maria") e não são nome interno:
    // saem antes da conferência. Se são da clínica, quem confere é a B06.
    const semLinks = f.replace(/@[a-z0-9_.]+|\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9_-]+\.(?:com\.br|com|app|net|org)\S*/g, ' ');
    if (INTERNO.some(re => re.test(semLinks))) achar('A06', 'erro', frase);
  }

  revisarFatos(texto, ctx, achar);

  const t = normalizar(texto);
  for (const s of SUBSTANCIAS) {
    if (new RegExp(`\\b${s}\\b`).test(t) && !permitido.includes(s) && !daCliente.includes(s)) {
      achar('B05', 'erro', s);
    }
  }

  for (const m of t.matchAll(/\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+|\b[a-z0-9-]+\.(?:com\.br|com|app|net|org)\b[^\s)]*/g)) {
    const link = m[0].replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[.,;]$/, '');
    if (!(ctx.links || []).some(l => l && (link.startsWith(l) || l.startsWith(link)))) achar('B06', 'erro', m[0]);
  }
  for (const m of t.matchAll(/(^|\s)@([a-z0-9_.]{3,})/g)) {
    const perfil = m[2].replace(/\.$/, '');
    if (!(ctx.links || []).some(l => l === perfil || l.endsWith('/' + perfil))) achar('B06', 'erro', '@' + perfil);
  }

  const a = ctx.acoes || {};
  if (AGENDOU.test(t) && !a.agendou && !a.consultou) achar('B07', 'erro', 'confirmou um agendamento');
  if (CANCELOU.test(t) && !a.cancelou && !a.consultou) achar('B07', 'erro', 'confirmou um cancelamento');

  const gravidade = achados.reduce((g, x) => maior(g, x.gravidade), 'aviso');
  return { achados, gravidade: achados.length ? gravidade : null, acao: achados.length ? acaoPara(gravidade) : 'passa' };
}

/**
 * Família B: cada valor, horário, data e número precisa existir numa fonte.
 *
 * Em ordem — telefone, dinheiro, data, horário, duração, o resto —, e o que
 * uma etapa reconhece some do texto para a seguinte. Sem isso "R$ 180" seria
 * conferido também como o número solto 180, e "15:30" como 15 e 30.
 */
function revisarFatos(texto, ctx, achar) {
  const { numeros, horas, datas } = ctx.fatos;
  let t = normalizar(texto);
  const apagar = m => { t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length); };
  const temNumero = n => [...numeros].some(x => Math.abs(x - n) < 0.005);

  // Telefone: só os da clínica e o da própria cliente.
  for (const m of [...t.matchAll(/\(?\b\d{2}\)?\s?\d{4,5}-?\d{4}\b/g)]) {
    const digitos = m[0].replace(/\D/g, '');
    if (!(ctx.fones || []).some(f => f && (f.endsWith(digitos) || digitos.endsWith(f)))) achar('B04', 'erro', m[0]);
    apagar(m);
  }

  for (const re of [/r\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, /\b(\d+)(?:,(\d{2}))? reais\b/g]) {
    for (const m of [...t.matchAll(re)]) {
      const valor = reaisParaNumero(m[1] + (m[2] ? ',' + m[2] : ''));
      if (valor !== null && !temNumero(valor)) achar('B01', 'erro', m[0]);
      apagar(m);
    }
  }

  for (const m of [...t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)]) {
    if (!datas.has(`${Number(m[1])}/${Number(m[2])}`)) achar('B03', 'erro', m[0]);
    apagar(m);
  }

  // Horário é "às 15h", "das 9h", "15:30". "1h30 de duração" não é horário.
  for (const re of [
    /\b(\d{1,2}):(\d{2})\b/g,
    /\b(?:as|das|ate as|pelas|para as|pra as|a partir das|horario das|horario de)\s(\d{1,2})(?:h(\d{2})?|\s?horas)\b/g,
  ]) {
    for (const m of [...t.matchAll(re)]) {
      const h = horaNormal(m[1], m[2]);
      if (h && !horas.has(h)) achar('B02', 'erro', m[0]);
      apagar(m);
    }
  }

  // Duração escrita em horas: 1h30 é 90 minutos, e é o 90 que está na fonte.
  for (const m of [...t.matchAll(/\b(\d{1,2})h(\d{2})?\b/g)]) {
    const minutos = Number(m[1]) * 60 + Number(m[2] || 0);
    if (!temNumero(minutos) && !temNumero(Number(m[1]))) achar('B04', 'erro', m[0]);
    apagar(m);
  }

  for (const m of [...t.matchAll(/\b\d+(?:[.,]\d+)?\b/g)]) {
    const n = reaisParaNumero(m[0]);
    // Até 10 é contagem de conversa ("2 opções", "3 dias") — não vale a regra.
    if (n === null || n <= 10) continue;
    if (!temNumero(n)) achar('B04', 'erro', m[0]);
  }
}
