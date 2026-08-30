import 'dotenv/config';
import { db, pool, iniciarBanco, uid, setConfig, salvarVinculos } from './db.js';
import { TENANT_PADRAO } from './lib/tenant.js';
import { definirSenhaApp } from './senha-app.js';
import { hoje, addDias } from './lib/dates.js';
import { prepararEmpresaPadrao, provisionarEmpresa } from './lib/provisionar.js';
import { hashDaSenha } from './lib/auth.js';

/** Senha das contas de desenvolvimento. Não vai para lugar nenhum além daqui. */
const SENHA_DEV = 'vital1234';

/**
 * Popula o banco de DESENVOLVIMENTO com um estúdio de estética de exemplo.
 *
 * Nada aqui participa do produto. Empresa de verdade nasce por
 * `lib/provisionar.js`, que instala o mínimo e nada de ramo nenhum — este
 * arquivo existe só para haver o que olhar na tela enquanto se programa.
 *
 * `npm run seed --` com `--vazio` popula só o que o provisionamento normal
 * instalaria: a config e os textos de WhatsApp, sem catálogo nem clientes. É o
 * jeito de ver como uma empresa recém-cadastrada enxerga o sistema.
 *
 * É idempotente: se já houver serviços, não faz nada (use `npm run reset`).
 */

await iniciarBanco();

// As migrations acabaram de criar o papel `vital_app` sem senha; sem este passo
// o próprio seed não conseguiria conectar como ele logo abaixo.
await definirSenhaApp();

// Fora de uma requisição HTTP não existe empresa definida na conexão, e o RLS
// esconde tudo. O seed precisa dizer para quem está populando.
await db.comEmpresa(TENANT_PADRAO, popular);
await pool.end();

async function popular() {

// Os textos de WhatsApp não são exemplo: toda empresa nasce com eles, aqui e
// no cadastro self-service. Vem da mesma função, para não haver duas versões.
await prepararEmpresaPadrao(TENANT_PADRAO);

if (process.argv.includes('--vazio')) {
  console.log('Empresa vazia, como uma recém-cadastrada. Só a config e os textos.');
  return;
}

const { n: jaTem } = await db.get('SELECT COUNT(*) n FROM services');
if (jaTem > 0 && !process.argv.includes('--forcar')) {
  console.log('Banco já populado. Use `npm run reset` para recomeçar do zero.');
  return;
}

const h = hoje();

// `tenants.nome` é a razão social do cadastro e `config.nome` é o que aparece
// no site. O seed mexia só no segundo, e o back-office da Vital listava o
// estúdio como "Meu negócio" — o nome que a migration deixa.
// `slug` vira o subdomínio. A migration deixa 'default', que serve de id e não
// serve de endereço — em desenvolvimento é por ele que se abre o site desta
// empresa, em `laurafaust.localhost:5173`.
//
// Deixou de ser um estúdio fictício: é a bancada de ensaio para a PRIMEIRA
// CLIENTE REAL da Vital (Laura Faust, estética, Joinville/SC) — nome, cor,
// logo, contato e fotos de serviço são os dela de verdade, tirados da
// identidade de marca e das fotos que ela mesma passou. Continua sendo
// cenário de DESENVOLVIMENTO: ela ainda não usa o produto, só vamos lapidar
// o modelo Clínica com o site dela até o produto estar pronto (ver
// PRODUCT.md, "Evidence on Hand"). Empresa de verdade nasce vazia, por
// `lib/provisionar.js` — isto nunca é copiado para lá automaticamente.
//
// O catálogo abaixo (nomes de serviço e preços) continua sendo aproximação
// nossa, não a lista de preços real dela — as fotos são reais, os valores
// não. Ajustar quando ela confirmar o menu de verdade.
await db.run(
  `UPDATE plataforma.tenants SET nome = 'Laura Faust', slug = 'laurafaust' WHERE id = ?`,
  TENANT_PADRAO
);

await setConfig({
  nome: 'Laura Faust',
  slogan: 'Estética e beleza · Joinville',
  fone: '47996195696',
  endereco: 'Rua Félix Heinzelmann, 139, Sala 02 — Bairro Santo Antônio, Joinville/SC',
  instagram: 'estetica_laurafaust',
  linkAvaliacao: 'https://g.page/estetica-laurafaust',
  whatsapp: '47996195696',
  mapa: 'https://maps.google.com/?q=Rua+Felix+Heinzelmann+139+Santo+Antonio+Joinville',
  sobre: 'Um espaço para você se cuidar e se sentir incrível. Estética, beleza '
    + 'e bem-estar, com atendimento pensado para o seu tempo — sem pressa e '
    + 'sem fórmula pronta.',
  marca: {
    // Verde-sálvia da identidade de marca real dela — substitui o palpite
    // (#3F6350) usado antes de a identidade oficial chegar.
    corPrimaria: '#98a68c',
    corFundo: '#FFFFFF',
    corTexto: '#1A1A1A',
    template: 'clinica',
    logo: '/uploads/default/logo.jpg',
    capa: '/uploads/default/capa.jpg',
    // Duas fotos dela mesma — o cabeçalho da Clínica já sabe alternar entre
    // várias (CarrosselHero, em App.jsx); com uma real e uma como próxima,
    // dá pra ver o carrossel funcionando de verdade, não só a estrutura.
    capas: ['/uploads/default/capa.jpg', '/uploads/default/profissional-laura.jpg'],
  },
  textos: {
    chamada: 'Agende seu horário',
    botaoAgendar: 'Agendar',
  },
  janelaDias: 30,            // quantos dias à frente o site deixa agendar
  antecedenciaHoras: 2,      // mínimo entre agora e o horário agendado
  passoAgenda: 30,           // granularidade da grade, em minutos
  horaLembreteVespera: '18:00',
  horasAvisoNoDia: 3,
  horaPosAtendimento: '11:00',
  horaCampanha: '10:00',
  diasAntesAniversario: 7,
  diasReativacao: 60,
});

const staff = [
  { id: 's1', nome: 'Laura Faust', funcao: 'Proprietária · Unhas', cor: '#334942', comissao: 0, fone: '47996195696',
    jornada: { 1: ['09:00', '19:00'], 2: ['09:00', '19:00'], 3: ['09:00', '19:00'], 4: ['09:00', '19:00'], 5: ['09:00', '19:00'], 6: ['08:30', '14:00'] } },
  { id: 's2', nome: 'Bia Menezes', funcao: 'Cílios e sobrancelhas', cor: '#6A57C7', comissao: 40, fone: '47988887777',
    jornada: { 2: ['10:00', '19:00'], 3: ['10:00', '19:00'], 4: ['10:00', '19:00'], 5: ['10:00', '20:00'], 6: ['09:00', '15:00'] } },
  { id: 's3', nome: 'Karen Souza', funcao: 'Estética facial', cor: '#3E7D63', comissao: 45, fone: '47977776666',
    jornada: { 1: ['13:00', '19:00'], 3: ['13:00', '19:00'], 5: ['13:00', '19:00'] } },
];
for (const p of staff) {
  await db.run(
    `INSERT INTO staff (id,nome,funcao,fone,cor,comissao,jornada,ativo,criado_em) VALUES (?,?,?,?,?,?,?,1,?)`,
    p.id, p.nome, p.funcao, p.fone, p.cor, p.comissao, JSON.stringify(p.jornada), h
  );
}

// Foto real por serviço — mesmas 8 fotos que Laura passou, repetidas onde faz
// sentido dentro da mesma categoria (duas fotos de unha cobrem cinco serviços
// de unha, por exemplo). Nomes e preços continuam aproximação nossa: ela
// ainda não confirmou o menu de verdade.
const F = u => `/uploads/default/${u}`;
const servicos = [
  ['v1', 'Esmaltação em gel', 'Unhas', 'Esmaltação curada na cabine, durabilidade de 3 semanas.', 85, 75, ['s1'], F('servico-unhas-1.jpg')],
  ['v2', 'Alongamento em fibra', 'Unhas', 'Alongamento F1 com acabamento em gel.', 160, 150, ['s1'], F('servico-unhas-2.jpg')],
  ['v3', 'Manutenção de alongamento', 'Unhas', '', 110, 105, ['s1'], F('servico-reforco.jpg')],
  ['v4', 'Unhas tradicionais', 'Unhas', 'Cutilagem e esmaltação tradicional.', 45, 50, ['s1'], F('servico-unhas-1.jpg')],
  ['v5', 'Plástica dos pés', 'Unhas', 'Esfoliação, hidratação profunda e esmaltação.', 95, 70, ['s1'], F('servico-unhas-2.jpg')],
  ['v6', 'Extensão de cílios 5D', 'Olhar', 'Volume russo com fios tecnológicos.', 190, 135, ['s2'], F('servico-cilios-1.jpg')],
  ['v7', 'Manutenção de cílios', 'Olhar', 'Até 21 dias após a aplicação.', 100, 90, ['s2'], F('servico-cilios-2.jpg')],
  ['v8', 'Design de sobrancelha', 'Olhar', 'Mapeamento e modelagem com pinça.', 45, 35, ['s2'], F('servico-sobrancelha.jpg')],
  ['v9', 'Design com henna', 'Olhar', '', 60, 45, ['s2'], F('servico-sobrancelha.jpg')],
  ['v10', 'Limpeza de pele profunda', 'Facial', 'Extração, alta frequência e máscara calmante.', 180, 90, ['s3'], F('servico-limpeza.jpg')],
  ['v11', 'Peeling de diamante', 'Facial', 'Renovação celular com microdermoabrasão.', 150, 60, ['s3'], F('servico-facial.jpg')],
];
for (const [i, [id, nome, cat, desc, preco, dur, profs, foto]] of servicos.entries()) {
  await db.run(
    `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem,foto) VALUES (?,?,?,?,?,?,10,1,?,?)`,
    id, nome, cat, desc, preco, dur, i, foto
  );
  await salvarVinculos(id, profs);
}

const clientes = [
  ['c1', 'Amanda Ribeiro', '47991234567', '1994-09-02', 'Rua das Palmeiras, 210 — Costa e Silva', 'Prefere tons nude.', -240],
  ['c2', 'Juliana Kruger', '47992345678', '1988-03-05', 'Av. Getúlio Vargas, 1180 — Anita Garibaldi', '', -180],
  ['c3', 'Patrícia Lemos', '47993456789', '1999-12-19', 'Rua Blumenau, 45 — América', 'Alergia a acetona.', -95],
  ['c4', 'Camila Fontes', '47994567890', '1991-06-11', 'Rua Iririú, 903 — Iririú', '', -400],
  ['c5', 'Renata Alves', '47995678901', '2001-01-27', 'Rua Dona Francisca, 2200 — Santo Antônio', '', -30],
  ['c6', 'Débora Nunes', '47996789012', '1985-08-30', 'Rua São Paulo, 77 — Bucarein', 'Sempre atrasa 10 min.', -520],
];
for (const [id, nome, fone, nasc, end, obs, d] of clientes) {
  await db.run(
    `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,criado_em) VALUES (?,?,?,?,?,?,1,?)`,
    id, nome, fone, nasc, end, obs, addDias(h, d)
  );
}

const mk = async (cli, svc, prof, dia, hora, status, pagStatus, forma) => {
  const s = await db.get('SELECT * FROM services WHERE id=?', svc);
  await db.run(
    `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,pag_status,pag_forma,origem,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'site',?)`,
    uid(), cli, svc, prof, addDias(h, dia), hora, s.duracao + s.intervalo, s.preco,
    status, pagStatus, forma, h
  );
};
await mk('c1', 'v1', 's1', 0, '09:00', 'concluido', 'pago', 'pix');
await mk('c2', 'v6', 's2', 0, '10:30', 'confirmado', 'pago', 'pix');
await mk('c3', 'v4', 's1', 0, '11:00', 'confirmado', 'aberto', 'local');
await mk('c5', 'v10', 's3', 0, '14:00', 'agendado', 'aberto', 'local');
await mk('c4', 'v2', 's1', 0, '14:30', 'confirmado', 'pago', 'cartao');
await mk('c6', 'v8', 's2', 0, '16:00', 'agendado', 'aberto', 'local');
await mk('c1', 'v8', 's2', 1, '10:00', 'agendado', 'aberto', 'local');
await mk('c3', 'v1', 's1', 1, '15:00', 'agendado', 'pago', 'pix');
await mk('c2', 'v11', 's3', 1, '13:30', 'agendado', 'aberto', 'local');
await mk('c5', 'v9', 's2', 2, '11:00', 'agendado', 'aberto', 'local');
await mk('c1', 'v1', 's1', -21, '09:00', 'concluido', 'pago', 'pix');
await mk('c4', 'v3', 's1', -28, '14:30', 'concluido', 'pago', 'cartao');
await mk('c6', 'v8', 's2', -95, '16:00', 'concluido', 'pago', 'dinheiro');
await mk('c2', 'v6', 's2', -40, '10:30', 'concluido', 'pago', 'pix');

await oResto();
await contasDeDesenvolvimento();
await equipeDaVital();
await segundaEmpresa();

console.log(`Banco populado: ${servicos.length} serviços, ${staff.length} profissionais, ${clientes.length} clientes.`);

}

/**
 * O que o estúdio de exemplo ganhou depois que o seed foi escrito.
 *
 * Unidades, adicionais, combo e formulário nasceram em blocos posteriores e
 * ficaram de fora daqui — o que significa que uma máquina nova rodava
 * `npm run reset` e via um sistema mais pobre do que o que existe. Seed que não
 * mostra a funcionalidade é seed que faz a pessoa achar que ela não existe.
 */
async function oResto() {
  const h = hoje();
  /* ── unidades ─────────────────────────────────────────────────────────── */
  // Duas, para a escolha de endereço aparecer no site. Com uma só, o passo some
  // — e some com razão, mas aí não dá para ver como é.
  const unidades = [
    ['u1', 'Centro', 'Rua XV de Novembro, 100 — Centro', 0],
    ['u2', 'Zona Sul', 'Av. Beira-Rio, 900 — Boa Vista', 1],
  ];
  for (const [id, nome, endereco, ordem] of unidades) {
    await db.run(
      `INSERT INTO units (id,nome,endereco,fone,mapa,jornada,ordem,ativo,criado_em)
       VALUES (?,?,?,?,'','{}',?,1,?)`,
      id, nome, endereco, '4733334444', ordem, h
    );
  }
  // Laura fica sem unidade de propósito: é o caso de quem atende nos dois
  // endereços, e o que o sistema faz com `unit_id` nulo.
  await db.run(`UPDATE staff SET unit_id = 'u1' WHERE id = 's2'`);
  await db.run(`UPDATE staff SET unit_id = 'u2' WHERE id = 's3'`);

  /* ── serviços adicionais ──────────────────────────────────────────────── */
  // Um extra que também se vende sozinho (design de sobrancelha na limpeza) e
  // um que não (depilação de buço) — os dois casos que o Bloco 6c precisa
  // mostrar lado a lado.
  await db.run(
    `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem,somente_adicional)
     VALUES ('v12','Depilação de buço','Facial','',30,15,5,1,11,1)`
  );
  await salvarVinculos('v12', ['s3']);

  await db.run(`INSERT INTO service_addons (service_id, addon_id) VALUES ('v10','v8')`);
  await db.run(`INSERT INTO service_addons (service_id, addon_id) VALUES ('v10','v12')`);
  await db.run(`INSERT INTO service_addons (service_id, addon_id) VALUES ('v11','v12')`);
  // Por categoria: qualquer serviço de Unhas oferece a plástica dos pés.
  await db.run(`INSERT INTO category_addons (categoria, addon_id) VALUES ('Unhas','v5')`);

  /* ── combo ────────────────────────────────────────────────────────────── */
  // Limpeza (180) + design de sobrancelha (45) = 225 avulso, por 199.
  await db.run(
    `INSERT INTO combos (id,nome,descricao,preco,foto,valido_ate,ativo,ordem,criado_em)
     VALUES ('k1','Dia de cuidado','Cuide do rosto inteiro num horário só',199,'',NULL,1,0,?)`,
    h
  );
  await db.run(`INSERT INTO combo_services (combo_id, service_id, ordem) VALUES ('k1','v10',0)`);
  await db.run(`INSERT INTO combo_services (combo_id, service_id, ordem) VALUES ('k1','v8',1)`);

  /* ── formulário ───────────────────────────────────────────────────────── */
  await db.run(
    `INSERT INTO forms (id,nome,descricao,ativo,criado_em)
     VALUES ('f1','Anamnese facial','Antes de começar, precisamos saber algumas coisas.',1,?)`,
    h
  );
  const perguntas = [
    ['fq1', 'Está grávida ou amamentando?', 'sim_nao', 1, [], ''],
    ['fq2', 'Tipo de pele', 'escolha', 1, ['Seca', 'Oleosa', 'Mista', 'Sensível'], ''],
    ['fq3', 'Usa algum ácido ou medicação?', 'longo', 0, [], 'Isso muda o que podemos aplicar hoje.'],
    ['fq4', 'Já teve reação a algum produto?', 'longo', 0, [], ''],
  ];
  for (const [i, [id, rotulo, tipo, obrig, opcoes, ajuda]] of perguntas.entries()) {
    await db.run(
      `INSERT INTO form_fields (id,form_id,rotulo,ajuda,tipo,obrigatorio,opcoes,ordem)
       VALUES (?, 'f1', ?, ?, ?, ?, ?, ?)`,
      id, rotulo, ajuda, tipo, obrig, JSON.stringify(opcoes), i
    );
  }
  // Pedida nos dois faciais — a mesma ficha serve a linha inteira.
  await db.run(`INSERT INTO form_services (form_id, service_id) VALUES ('f1','v10')`);
  await db.run(`INSERT INTO form_services (form_id, service_id) VALUES ('f1','v11')`);
}

/** Nada de conta ou empresa de demonstração fora da máquina de quem programa. */
function ehLocal() {
  return /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
}

/**
 * Uma segunda empresa, de outro ramo, para o isolamento ser visível.
 *
 * Com uma empresa só, nada na tela mostra que o sistema é multiempresa — e o
 * tipo de erro que o RLS previne (uma vendo o dado da outra) precisa de duas
 * para aparecer. Aqui ela nasce pelo mesmo caminho de uma empresa de verdade,
 * `provisionarEmpresa`, e não por SQL à parte: se esse caminho quebrar, o seed
 * quebra junto e a gente descobre na hora.
 *
 * Só em localhost, como as contas abaixo.
 */
async function segundaEmpresa() {
  if (!ehLocal()) return;

  const nova = await provisionarEmpresa({
    nome: 'Barbearia do João', ramo: 'Barbearia', slug: 'barbearia', origem: 'seed',
  });

  await db.comEmpresa(nova.id, async () => {
    await setConfig({
      nome: 'Barbearia do João',
      slogan: 'Corte e barba · Joinville',
      endereco: 'Rua das Palmeiras, 88 — Joinville/SC',
      configurado: true,
      vocabulario: { profissional: 'barbeiro', profissionais: 'barbeiros' },
      // Segundo modelo de exemplo — Quadro de Horários, fundo escuro, números
      // em mono. É onde alguém vê que o site muda de verdade entre empresas.
      marca: { corPrimaria: '#1F4E5F', template: 'quadro' },
    });

    await db.run(
      `INSERT INTO users (id, nome, email, senha_hash, papel, ativo, criado_em)
       VALUES (?,?,?,?,'dono',1,?)`,
      uid(), 'João Silva', 'joao@barbearia.com', await hashDaSenha(SENHA_DEV), hoje()
    );

    const jornada = JSON.stringify(Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map(d => [d, ['09:00', '19:00']])
    ));
    for (const [id, nome, cor] of [['b1', 'João Silva', '#1F4E5F'], ['b2', 'Rafa Duarte', '#8A6A2F']]) {
      await db.run(
        `INSERT INTO staff (id,nome,funcao,cor,comissao,jornada,ativo,criado_em) VALUES (?,?,?,?,?,?,1,?)`,
        id, nome, 'Barbeiro', cor, 40, jornada, hoje()
      );
    }
    for (const [id, nome, preco, dur] of [
      ['bs1', 'Corte masculino', 45, 40],
      ['bs2', 'Barba', 35, 30],
      ['bs3', 'Corte + barba', 70, 60],
    ]) {
      await db.run(
        `INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem) VALUES (?,?,?,?,?,5,1,0)`,
        id, nome, 'Cabelo e barba', preco, dur
      );
      await salvarVinculos(id, ['b1', 'b2']);
    }
  });

  console.log(`  Segunda empresa: ${nova.nome} · ${nova.slug}.localhost:5173`);
}

/**
 * Duas contas prontas para entrar no painel, uma de cada papel.
 *
 * Só em localhost, com a mesma guarda do `reset.js` — senha conhecida em script
 * que possa rodar em produção é problema esperando acontecer. Aqui a alternativa
 * era pior: a cada `npm run reset` os acessos sumiam e a pessoa precisava
 * recriar o dono na mão para voltar a ver a própria tela.
 *
 * Em produção, quem cria o dono é `POST /api/cadastro` ou a tela de primeiro
 * acesso — nunca um seed.
 */
async function contasDeDesenvolvimento() {
  if (!ehLocal()) return;

  const contas = [
    { email: 'dono@vital.com', nome: 'Laura Prado', papel: 'dono', prof: null },
    { email: 'funcionaria@vital.com', nome: 'Karen Souza', papel: 'funcionario', prof: 's3' },
  ];
  for (const c of contas) {
    await db.run(
      `INSERT INTO users (id, nome, email, senha_hash, papel, staff_id, ativo, criado_em)
       VALUES (?,?,?,?,?,?,1,?)`,
      uid(), c.nome, c.email, await hashDaSenha(SENHA_DEV), c.papel, c.prof, hoje()
    );
  }

  console.log('');
  console.log(`  Contas de desenvolvimento (senha ${SENHA_DEV} nas duas):`);
  for (const c of contas) console.log(`    ${c.email.padEnd(24)} ${c.papel}`);
  console.log('    Só em localhost. Em produção ninguém nasce por seed.');
  console.log('');
  console.log('  Painel: http://localhost:5173/painel.html');
}

/**
 * O primeiro acesso do nosso back-office.
 *
 * Fora daqui, quem cria é a própria tela de primeiro acesso em
 * `vital.html#equipe`, que se fecha depois da primeira pessoa.
 */
async function equipeDaVital() {
  if (!ehLocal()) return;
  const { n } = await db.get('SELECT COUNT(*) n FROM plataforma.usuarios');
  if (n > 0) return;

  await db.run(
    `INSERT INTO plataforma.usuarios (id, nome, email, senha_hash, papel, ativo, criado_em)
     VALUES (?,?,?,?,'admin',1,?)`,
    uid(), 'Victor Alvarenga', 'victor@vital.com', await hashDaSenha(SENHA_DEV), hoje()
  );
  console.log(`  Equipe Vital: victor@vital.com · http://localhost:5173/vital.html#equipe`);
}
