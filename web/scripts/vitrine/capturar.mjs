/**
 * Fotografa as telas do Studio Aurora para a página de venda da Vital.
 *
 * Abre o Chrome sem janela, fala com ele pelo protocolo de depuração (o mesmo
 * que o DevTools usa — sem instalar Puppeteer) e grava cada tela em
 * `web/src/vital/telas/`, em WebP. Precisa do `npm run dev` de pé e do cenário
 * montado por `montar-cenario.mjs`.
 *
 *   node web/scripts/vitrine/capturar.mjs            # todas as telas
 *   node web/scripts/vitrine/capturar.mjs pagina     # só confere a página da Vital (não grava em telas/)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.resolve(AQUI, '../../src/vital/telas');
const CONFERIR = path.join(os.tmpdir(), 'vital-conferir');
const HOST = 'studio-aurora.localhost:5173';
const BASE = `http://${HOST}`;
const PORTA = 9333;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const CHROME = CHROMES.find(c => fs.existsSync(c));
if (!CHROME) throw new Error('não achei o Chrome');

const esperar = ms => new Promise(ok => setTimeout(ok, ms));

/** Uma chamada à API, no endereço do Studio Aurora. */
function pedir(metodo, caminho, corpo, cookie) {
  return new Promise((ok, falha) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const r = http.request({
      host: '127.0.0.1', port: 3333, method: metodo, path: caminho,
      headers: {
        host: HOST, 'content-type': 'application/json', ...(cookie ? { cookie } : {}),
        ...(dados ? { 'content-length': Buffer.byteLength(dados) } : {}),
      },
    }, res => {
      let s = '';
      res.on('data', c => { s += c; });
      res.on('end', () => {
        if (res.statusCode >= 300) return falha(new Error(`${metodo} ${caminho}: ${res.statusCode} ${s}`));
        ok({ headers: res.headers, corpo: s ? JSON.parse(s) : null });
      });
    });
    r.on('error', falha);
    if (dados) r.write(dados);
    r.end();
  });
}

/** Login pela API, para o Chrome entrar no painel já com a sessão. */
async function sessao() {
  const r = await pedir('POST', '/api/auth/login', { email: 'vitrine@vital.com', senha: 'vital1234' });
  return r.headers['set-cookie'][0].split(';')[0];
}

/**
 * Cada modelo de site é fotografado com uma cor e uma foto próprias, para a
 * troca de modelo parecer troca de verdade. As cores são tons do painel (a
 * página de venda veste a mesma paleta); as fotos são as de exemplo dos
 * modelos, que valem como foto de clima. A Galeria ganha capa enviada: a dela
 * de fábrica tem fundo branco e o topo escurecido do modelo ficava parecendo
 * defeito sobre ele.
 */
const FOTOS = path.resolve(AQUI, '../../src/site/modelos/fotos');
const MODELOS_DO_SITE = [
  { nome: 'essencial', template: 'bandeja', cor: '#A32A4E' },
  { nome: 'galeria', template: 'quadro', cor: '#241A28', capa: 'galeria-apoio.jpg' },
  { nome: 'serena', template: 'caderneta', cor: '#C2476C' },
];

async function abrirChrome() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'vital-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--lang=pt-BR',
    '--force-color-profile=srgb', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      const alvos = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
      const pagina = alvos.find(a => a.type === 'page');
      if (pagina) return { proc, ws: pagina.webSocketDebuggerUrl };
    } catch { /* ainda subindo */ }
    await esperar(200);
  }
  throw new Error('o Chrome não respondeu');
}

function conectar(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pendentes = new Map();
  const ouvintes = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) {
      const { ok, falha } = pendentes.get(m.id);
      pendentes.delete(m.id);
      if (m.error) falha(new Error(m.error.message)); else ok(m.result);
    } else if (m.method) ouvintes.forEach(f => f(m));
  };
  const enviar = (method, params = {}) => new Promise((ok, falha) => {
    pendentes.set(++id, { ok, falha });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const aberto = new Promise(ok => { ws.onopen = ok; });
  return { aberto, enviar, ouvintes, fechar: () => ws.close() };
}

async function main() {
  const soPagina = process.argv[2] === 'pagina';
  fs.mkdirSync(soPagina ? CONFERIR : DESTINO, { recursive: true });
  const cookie = soPagina ? null : await sessao();
  const [nomeCookie, valorCookie] = cookie ? cookie.split('=') : [];
  const { proc, ws } = await abrirChrome();
  const cdp = conectar(ws);
  await cdp.aberto;
  await cdp.enviar('Page.enable');
  await cdp.enviar('Network.enable');
  if (nomeCookie) {
    await cdp.enviar('Network.setCookie', { name: nomeCookie, value: valorCookie, domain: 'studio-aurora.localhost', path: '/' });
  }

  const carregou = () => new Promise(ok => {
    const f = m => { if (m.method === 'Page.loadEventFired') { cdp.ouvintes.splice(cdp.ouvintes.indexOf(f), 1); ok(); } };
    cdp.ouvintes.push(f);
  });
  const rodar = expressao => cdp.enviar('Runtime.evaluate', { expression: expressao, awaitPromise: true });

  async function foto(nome, { url, largura, altura, escala = 2, movel = false, antes, inteira = false, pasta = DESTINO }) {
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: escala, mobile: movel });
    const pronto = carregou();
    await cdp.enviar('Page.navigate', { url });
    await pronto;
    await esperar(1800);
    if (antes) { await rodar(antes); await esperar(1400); }
    let clip;
    if (inteira) {
      const { result } = await rodar('document.documentElement.scrollHeight');
      clip = { x: 0, y: 0, width: largura, height: result.value, scale: 1 };
    }
    const { data } = await cdp.enviar('Page.captureScreenshot', {
      format: 'webp', quality: 82, ...(clip ? { clip, captureBeyondViewport: true } : {}),
    });
    const arquivo = path.join(pasta, `${nome}.webp`);
    fs.writeFileSync(arquivo, Buffer.from(data, 'base64'));
    console.log(`${nome}.webp  ${Math.round(fs.statSync(arquivo).size / 1024)} KB`);
  }

  // Clicar num item pelo texto visível, como a pessoa faria.
  const clicar = texto => `(() => {
    const el = [...document.querySelectorAll('button, a')].find(b => b.textContent.trim().startsWith(${JSON.stringify(texto)}));
    el?.click();
    return Boolean(el);
  })()`;

  try {
    if (soPagina) {
      const pagina = 'http://localhost:5173/vital.html';
      // Rola até o fim e volta: as imagens têm `loading="lazy"` e só carregam
      // quando chegam perto da tela — numa foto da página inteira, sairiam vazias.
      const rolar = `(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120));
        }
        window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 800));
      })()`;
      // A tela visível do celular, sem esticar: é como o botão fixo aparece de verdade.
      await foto('celular-tela', { url: pagina, largura: 390, altura: 844, escala: 1, movel: true, pasta: CONFERIR, antes: rolar });
      await foto('celular-tela-meio', {
        url: pagina, largura: 390, altura: 844, escala: 1, movel: true, pasta: CONFERIR,
        antes: `(async () => { await ${rolar}; window.scrollTo({ top: 2600, behavior: 'instant' }); await new Promise(r => setTimeout(r, 800)); })()`,
      });
      // A troca de modelo: com a seção à vista, toca na aba e fotografa a tela.
      const trocar = t => `(async () => { await ${rolar};
        document.getElementById('seu-site').scrollIntoView({ behavior: 'instant' });
        window.scrollBy({ top: 140, behavior: 'instant' });
        document.getElementById('modelo-${t}').click(); await new Promise(r => setTimeout(r, 900)); })()`;
      await foto('celular-troca', { url: pagina, largura: 390, altura: 844, escala: 1, movel: true, pasta: CONFERIR, antes: trocar('galeria') });
      await foto('desktop-troca', { url: pagina, largura: 1440, altura: 900, escala: 1, pasta: CONFERIR, antes: trocar('serena') });
      for (const [nome, largura, altura, movel] of [['desktop', 1440, 900, false], ['celular', 390, 844, true]]) {
        await foto(`pagina-${nome}`, { url: pagina, largura, altura, escala: 1, movel, inteira: true, pasta: CONFERIR, antes: rolar });
        // Uma imagem por seção, legível em tamanho real.
        const { result } = await rodar(`JSON.stringify([...document.querySelectorAll('main > section')].map(s => {
          const r = s.getBoundingClientRect(); return [r.top + scrollY, r.height];
        }))`);
        for (const [i, [y, h]] of JSON.parse(result.value).entries()) {
          const { data } = await cdp.enviar('Page.captureScreenshot', {
            format: 'webp', quality: 80, captureBeyondViewport: true,
            clip: { x: 0, y, width: largura, height: Math.min(h, 2400), scale: 1 },
          });
          fs.writeFileSync(path.join(CONFERIR, `${nome}-${String(i + 1).padStart(2, '0')}.webp`), Buffer.from(data, 'base64'));
        }
      }
      console.log(`conferência em ${CONFERIR}`);
      return;
    }

    const painel = `${BASE}/painel.html`;
    await foto('painel-resumo', { url: painel, largura: 1280, altura: 820, escala: 1.5 });
    await foto('painel-agenda', { url: painel, largura: 1280, altura: 820, escala: 1.5, antes: clicar('Agenda') });
    // "Ano" e não o mês corrente: no começo do mês o gráfico teria uma coluna só.
    await foto('painel-financeiro', {
      url: painel, largura: 1280, altura: 820, escala: 1.5,
      antes: `(async () => { ${clicar('Financeiro')}; await new Promise(r => setTimeout(r, 1200)); ${clicar('Ano')}; })()`,
    });
    await foto('painel-celular', { url: painel, largura: 390, altura: 844, movel: true });

    // A config é trocada de verdade para cada foto e devolvida no fim, mesmo
    // se uma captura falhar no meio. Clínica fica de fora: sem foto de capa da
    // empresa ela mostra um arco vazio.
    const original = (await pedir('GET', '/api/config', null, cookie)).corpo.marca;
    try {
      for (const m of MODELOS_DO_SITE) {
        let capa;
        if (m.capa) {
          const b64 = fs.readFileSync(path.join(FOTOS, m.capa)).toString('base64');
          capa = (await pedir('POST', '/api/uploads', { arquivo: `data:image/jpeg;base64,${b64}`, uso: 'capa' }, cookie)).corpo.url;
        }
        await pedir('PUT', '/api/config', {
          marca: { ...original, template: m.template, corPrimaria: m.cor, ...(capa ? { capa } : { capa: '' }) },
        }, cookie);
        await foto(`site-${m.nome}`, { url: BASE, largura: 1280, altura: 800, escala: 1.5 });
        await foto(`site-${m.nome}-celular`, { url: BASE, largura: 390, altura: 844, movel: true });
      }
    } finally {
      await pedir('PUT', '/api/config', { marca: original }, cookie);
    }
    // O agendamento até a escolha do horário, que é o passo que vende.
    // Os cartões de serviço começam pela inicial do círculo ("LLimpeza…"), então
    // aqui o texto é procurado dentro do botão, e o último achado é o da janela.
    const passo = t => `[...document.querySelectorAll('button')].filter(b => b.textContent.includes(${JSON.stringify(t)})).pop()?.click();
      await new Promise(r => setTimeout(r, 1300));`;
    await foto('site-agendar-celular', {
      url: `${BASE}/?template=bandeja`, largura: 390, altura: 844, movel: true,
      // O dia seguinte, e não hoje: à tarde, hoje sobram dois horários.
      antes: `(async () => { ${passo('Agendar')} ${passo('Limpeza de pele profunda')} ${passo('Marina')}
        [...document.querySelectorAll('.cal-dia:not([disabled])')][1]?.click();
        await new Promise(r => setTimeout(r, 1300)); })()`,
    });
  } finally {
    cdp.fechar();
    proc.kill();
  }
}

await main();
