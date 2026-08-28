import 'dotenv/config';
import { db, pool, iniciarBanco, uid, setConfig, salvarVinculos } from './db.js';
import { TENANT_PADRAO } from './lib/tenant.js';
import { definirSenhaApp } from './senha-app.js';
import { hoje, addDias } from './lib/dates.js';
import { prepararEmpresaPadrao } from './lib/provisionar.js';
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
await db.run(`UPDATE plataforma.tenants SET nome = 'Estúdio Lume' WHERE id = ?`, TENANT_PADRAO);

await setConfig({
  nome: 'Estúdio Lume',
  slogan: 'Estética & beleza · Joinville',
  fone: '47996195696',
  endereco: 'Rua Félix Heinzelmann, 320 — Joinville/SC',
  instagram: 'estudiolume',
  pixChave: 'contato@estudiolume.com.br',
  linkAvaliacao: 'https://g.page/estudiolume',
  whatsapp: '47996195696',
  mapa: 'https://maps.google.com/?q=Rua+Felix+Heinzelmann+320+Joinville',
  marca: {
    corPrimaria: '#A32A4E',
    corFundo: '#FFFFFF',
    corTexto: '#1A1A1A',
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
  { id: 's1', nome: 'Laura Prado', funcao: 'Proprietária · Unhas', cor: '#A32A4E', comissao: 0, fone: '47996195696',
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

const servicos = [
  ['v1', 'Esmaltação em gel', 'Unhas', 'Esmaltação curada na cabine, durabilidade de 3 semanas.', 85, 75, ['s1']],
  ['v2', 'Alongamento em fibra', 'Unhas', 'Alongamento F1 com acabamento em gel.', 160, 150, ['s1']],
  ['v3', 'Manutenção de alongamento', 'Unhas', '', 110, 105, ['s1']],
  ['v4', 'Unhas tradicionais', 'Unhas', 'Cutilagem e esmaltação tradicional.', 45, 50, ['s1']],
  ['v5', 'Plástica dos pés', 'Unhas', 'Esfoliação, hidratação profunda e esmaltação.', 95, 70, ['s1']],
  ['v6', 'Extensão de cílios 5D', 'Olhar', 'Volume russo com fios tecnológicos.', 190, 135, ['s2']],
  ['v7', 'Manutenção de cílios', 'Olhar', 'Até 21 dias após a aplicação.', 100, 90, ['s2']],
  ['v8', 'Design de sobrancelha', 'Olhar', 'Mapeamento e modelagem com pinça.', 45, 35, ['s2']],
  ['v9', 'Design com henna', 'Olhar', '', 60, 45, ['s2']],
  ['v10', 'Limpeza de pele profunda', 'Facial', 'Extração, alta frequência e máscara calmante.', 180, 90, ['s3']],
  ['v11', 'Peeling de diamante', 'Facial', 'Renovação celular com microdermoabrasão.', 150, 60, ['s3']],
];
for (const [i, [id, nome, cat, desc, preco, dur, profs]] of servicos.entries()) {
  await db.run(
    `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem) VALUES (?,?,?,?,?,?,10,1,?)`,
    id, nome, cat, desc, preco, dur, i
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

await contasDeDesenvolvimento();

console.log(`Banco populado: ${servicos.length} serviços, ${staff.length} profissionais, ${clientes.length} clientes.`);

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
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')) return;

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
