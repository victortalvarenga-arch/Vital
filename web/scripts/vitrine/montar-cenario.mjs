/**
 * Monta o "Studio Aurora", a empresa inventada das fotos da página de venda.
 *
 * Por que uma empresa só para isso: a página da Vital precisa de telas de
 * verdade, e as duas empresas do seed não servem. A Laura Faust é uma pessoa
 * real (nome, cor e fotos dela não vão para material público — CLAUDE.md), e a
 * Barbearia do João faria a Vital parecer coisa de barbearia. O Studio Aurora é
 * ficção inteira: nomes, telefones e preços inventados.
 *
 * Nasce pelo caminho de uma empresa de verdade (`POST /api/cadastro`) e é
 * preenchido pela API do painel, como uma dona faria. Fica no banco de
 * desenvolvimento e some no próximo `npm run reset`; rodar de novo sem reset
 * só acrescenta a agenda de hoje.
 *
 * Uso, com o `npm run dev` de pé:
 *   node web/scripts/vitrine/montar-cenario.mjs
 *   node web/scripts/vitrine/capturar.mjs
 */
import http from 'node:http';

const SLUG = 'studio-aurora';
const HOST = `${SLUG}.localhost:5173`;
const EMAIL = 'vitrine@vital.com';
const SENHA = 'vital1234';

function pedir(metodo, caminho, corpo, { host = HOST, cookie } = {}) {
  return new Promise((ok, falha) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const r = http.request({
      host: '127.0.0.1', port: 3333, method: metodo, path: caminho,
      headers: {
        host, 'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(dados ? { 'content-length': Buffer.byteLength(dados) } : {}),
      },
    }, res => {
      let s = '';
      res.on('data', c => { s += c; });
      res.on('end', () => {
        let json;
        try { json = s ? JSON.parse(s) : null; } catch { json = s; }
        ok({ status: res.statusCode, headers: res.headers, corpo: json });
      });
    });
    r.on('error', falha);
    if (dados) r.write(dados);
    r.end();
  });
}

const deve = (r, oQue) => {
  if (r.status >= 300) throw new Error(`${oQue}: ${r.status} ${JSON.stringify(r.corpo)}`);
  return r.corpo;
};

// Datas no fuso do aparelho, como texto — o sistema inteiro trabalha assim.
const dia = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const HOJE = dia(0);

/* ── 1. a empresa ── */
// Entra primeiro: o cadastro não recusa nome repetido, ele acrescenta um
// número ao endereço — rodar duas vezes criaria um "studio-aurora-2" vazio.
let entrou = await pedir('POST', '/api/auth/login', { email: EMAIL, senha: SENHA });
if (entrou.status !== 200) {
  deve(await pedir('POST', '/api/cadastro', {
    nome: 'Studio Aurora', ramo: 'Estética', responsavel: 'Marina Prado', email: EMAIL, senha: SENHA, endereco: SLUG,
  }, { host: 'localhost:5173' }), 'cadastro');
  console.log('empresa criada');
  entrou = await pedir('POST', '/api/auth/login', { email: EMAIL, senha: SENHA });
}
deve(entrou, 'login');
const cookie = entrou.headers['set-cookie'][0].split(';')[0];
const api = (m, c, b) => pedir(m, c, b, { cookie });

const estado = deve(await api('GET', '/api/estado'), 'estado');
const jaMontado = estado.profissionais.length > 0;

/* ── 2. marca e textos ── */
deve(await api('PUT', '/api/config', {
  nome: 'Studio Aurora',
  slogan: 'Estética facial e corporal',
  cidade: 'São Paulo',
  endereco: 'Rua das Acácias, 120 — Vila Mariana, São Paulo/SP',
  whatsapp: '11900000000',
  fone: '11900000000',
  instagram: 'studioaurora',
  sobre: 'Um estúdio pequeno, com hora marcada e sem pressa. Cada atendimento começa '
    + 'por uma conversa sobre a sua pele e o que você quer dela.',
  marca: { corPrimaria: '#A32A4E', corFundo: '#FFFFFF', corTexto: '#1A1A1A', template: 'bandeja' },
  textos: {
    hero: 'Você escolhe o horário que cabe no seu dia e sai daqui com ele confirmado.',
    chamada: 'Agende seu horário', botaoAgendar: 'Agendar',
  },
  faq: [
    { pergunta: 'Preciso de avaliação antes?', resposta: 'Na primeira visita a gente conversa antes de começar. Não é preciso marcar nada à parte.' },
    { pergunta: 'Posso remarcar?', resposta: 'Pode, pelo WhatsApp, com até 3 horas de antecedência.' },
  ],
  configurado: true,
  antecedenciaHoras: 0,
  janelaDias: 30,
  passoAgenda: 30,
}), 'config');

if (jaMontado) {
  console.log('catálogo e equipe já existem; nada a refazer além da agenda de hoje');
}

/* ── 3. equipe, serviços, clientes ── */
const semana = (ini, fim, dias = [1, 2, 3, 4, 5, 6]) => Object.fromEntries(dias.map(d => [d, [ini, fim]]));
let equipe = estado.profissionais;
if (!jaMontado) {
  equipe = [];
  for (const p of [
    // A Lúcia começa às 13h: é o que faz a faixa vermelha de "antes das 13:00"
    // aparecer na grade do dia.
    { nome: 'Marina Prado', funcao: 'Estética facial', cor: '#A32A4E', comissao: 0, jornada: semana('09:00', '19:00') },
    { nome: 'Lúcia Ramos', funcao: 'Corporal e massagem', cor: '#59182B', comissao: 40, jornada: semana('13:00', '20:00', [1, 2, 3, 4, 5]) },
    { nome: 'Rafaela Costa', funcao: 'Sobrancelhas e cílios', cor: '#C2476C', comissao: 45, jornada: semana('09:00', '18:00') },
  ]) equipe.push(deve(await api('POST', '/api/profissionais', { ...p, ativo: true }), `profissional ${p.nome}`));
}
// Por nome, não por posição: o `/api/estado` devolve a equipe em ordem alfabética.
const quem = nome => equipe.find(p => p.nome.startsWith(nome));
const [marina, lucia, rafa] = [quem('Marina'), quem('Lúcia'), quem('Rafaela')];

let servicos = estado.servicos;
if (!jaMontado) {
  servicos = [];
  for (const s of [
    ['Limpeza de pele profunda', 'Facial', 180, 60, [marina]],
    ['Peeling de diamante', 'Facial', 150, 45, [marina]],
    ['Drenagem linfática', 'Corporal', 140, 60, [lucia]],
    ['Massagem relaxante', 'Corporal', 160, 60, [lucia]],
    ['Design de sobrancelha', 'Sobrancelhas e cílios', 70, 30, [rafa, marina]],
    ['Lash lifting', 'Sobrancelhas e cílios', 160, 60, [rafa]],
  ]) {
    servicos.push(deve(await api('POST', '/api/servicos', {
      nome: s[0], categoria: s[1], preco: s[2], duracao: s[3], intervalo: 0, ativo: true,
      profissionais: s[4].map(p => p.id), mostrarPreco: true,
    }), `serviço ${s[0]}`));
  }
}
const sv = nome => servicos.find(s => s.nome === nome);

let clientes = estado.clientes;
if (!jaMontado) {
  clientes = [];
  const nomes = ['Ana Beatriz Lima', 'Carla Mendes', 'Júlia Martins', 'Paula Andrade', 'Renata Viana',
    'Bianca Rocha', 'Fernanda Alves', 'Camila Duarte', 'Letícia Nunes', 'Sofia Pires', 'Helena Castro', 'Marta Siqueira'];
  for (const [i, nome] of nomes.entries()) {
    clientes.push(deve(await api('POST', '/api/clientes', {
      nome, fone: `1190000${String(1000 + i).padStart(4, '0')}`,
      nascimento: `199${i % 10}-0${(i % 9) + 1}-1${i % 9}`, optin: true,
    }), `cliente ${nome}`));
  }
}
const cli = i => clientes[i % clientes.length];

/* ── 4. agenda ── */
async function marcar({ data, hora, s, p, c, status, pago }) {
  const r = await api('POST', '/api/agendamentos', {
    clienteId: c.id, servicoId: s.id, profissionalId: p.id, data, hora, forcar: true,
  });
  if (r.status === 409) return null;         // horário já ocupado numa rodada anterior
  const a = deve(r, `agendamento ${data} ${hora}`);
  if (status && status !== 'agendado') {
    deve(await api('PUT', `/api/agendamentos/${a.id}`, {
      status, ...(pago ? { pagamento: { recebido: Number(a.valor), forma: pago } } : {}),
    }), 'situação');
  }
  return a;
}

// O histórico dos últimos meses, para o Financeiro e o gráfico do Resumo não
// nascerem vazios. Só na primeira rodada.
if (!jaMontado) {
  const formas = ['pix', 'cartao', 'pix', 'dinheiro'];
  const combinacoes = [
    ['Limpeza de pele profunda', marina], ['Design de sobrancelha', rafa], ['Drenagem linfática', lucia],
    ['Lash lifting', rafa], ['Massagem relaxante', lucia], ['Peeling de diamante', marina],
  ];
  let n = 0;
  for (let d = -120; d < 0; d++) {
    const data = dia(d);
    const semanaDia = new Date(data + 'T12:00:00').getDay();
    if (semanaDia === 0) continue;
    // Mais movimento nos meses recentes: a curva sobe, como numa agenda que pega.
    const porDia = 1 + Math.floor(((d + 120) / 120) * 3) + (semanaDia >= 4 ? 1 : 0);
    for (let k = 0; k < porDia; k++) {
      const [nome, p] = combinacoes[(n + k) % combinacoes.length];
      const hora = p === lucia ? `${14 + k}:00` : `${String(9 + k * 2).padStart(2, '0')}:00`;
      await marcar({ data, hora, s: sv(nome), p, c: cli(n + k), status: 'concluido', pago: formas[(n + k) % formas.length] });
    }
    n += porDia;
  }
  console.log(`histórico: ${n} atendimentos`);
}

// Hoje: a manhã já atendida, alguém na cadeira agora e a tarde marcada.
const agora = new Date();
const hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minAgora = agora.getHours() * 60 + agora.getMinutes();
const meiaHora = Math.floor(minAgora / 30) * 30;
const hojeLista = [
  { hora: '09:00', s: sv('Limpeza de pele profunda'), p: marina, c: cli(0), status: 'concluido', pago: 'pix' },
  { hora: '09:30', s: sv('Design de sobrancelha'), p: rafa, c: cli(1), status: 'concluido', pago: 'cartao' },
  { hora: '10:30', s: sv('Lash lifting'), p: rafa, c: cli(2), status: 'concluido', pago: 'pix' },
  { hora: '11:00', s: sv('Peeling de diamante'), p: marina, c: cli(3), status: 'concluido', pago: 'dinheiro' },
  { hora: hh(meiaHora - 30), s: sv('Drenagem linfática'), p: lucia, c: cli(4), status: 'em_atendimento' },
  { hora: hh(meiaHora + 30), s: sv('Limpeza de pele profunda'), p: marina, c: cli(5), status: 'confirmado' },
  { hora: hh(meiaHora + 60), s: sv('Design de sobrancelha'), p: rafa, c: cli(6), status: 'confirmado' },
  { hora: hh(meiaHora + 90), s: sv('Massagem relaxante'), p: lucia, c: cli(7), status: 'agendado' },
  { hora: hh(meiaHora + 120), s: sv('Peeling de diamante'), p: marina, c: cli(8), status: 'agendado' },
  { hora: hh(meiaHora + 150), s: sv('Lash lifting'), p: rafa, c: cli(9), status: 'confirmado' },
];
// A agenda de hoje é refeita a cada rodada: "na cadeira agora" e "próxima"
// dependem da hora em que a foto é tirada.
for (const a of estado.agendamentos.filter(x => x.data === HOJE)) {
  await api('DELETE', `/api/agendamentos/${a.id}`);
}
for (const a of hojeLista) await marcar({ data: HOJE, ...a });

// O resto da semana, para a visão semanal ter o que mostrar.
if (!jaMontado) {
  for (let d = 1; d <= 6; d++) {
    const data = dia(d);
    if (new Date(data + 'T12:00:00').getDay() === 0) continue;
    await marcar({ data, hora: '10:00', s: sv('Limpeza de pele profunda'), p: marina, c: cli(d), status: 'confirmado' });
    await marcar({ data, hora: '14:00', s: sv('Drenagem linfática'), p: lucia, c: cli(d + 3), status: 'agendado' });
    await marcar({ data, hora: '11:00', s: sv('Design de sobrancelha'), p: rafa, c: cli(d + 6), status: 'confirmado' });
  }
}

// O histórico gera centenas de mensagens de pós-atendimento atrasadas — uma
// empresa de verdade teria mandado aos poucos. Na foto ficam só três na fila.
deve(await api('POST', '/api/mensagens/fila/gerar'), 'fila');
const fila = deve(await api('GET', '/api/mensagens/fila'), 'fila').itens;
for (const m of fila.slice(3)) await api('POST', `/api/mensagens/fila/${m.id}/pular`);

console.log(`pronto: http://${HOST}  ·  painel: http://${HOST}/painel.html  (${EMAIL} / ${SENHA})`);
