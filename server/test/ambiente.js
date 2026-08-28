import 'dotenv/config';
import http from 'node:http';
import pg from 'pg';

/**
 * Banco de teste, separado do de desenvolvimento.
 *
 * Os testes apagam e recriam dados a cada arquivo. Apontar para o banco de
 * trabalho significaria perder o catálogo e a agenda toda vez que alguém
 * rodasse `npm test` — e alguém vai rodar sem pensar. O nome do banco leva
 * `_teste` no fim e o módulo recusa rodar se a URL não terminar assim.
 *
 * É banco de verdade, não simulação: o motor de horários concilia jornada,
 * agendamentos e bloqueios em SQL, e simular o banco testaria o simulador.
 */

const url = new URL(process.env.DATABASE_ADMIN_URL || '');
const NOME = (url.pathname.slice(1) || 'vital') + '_teste';

function comBanco(base, nome) {
  const u = new URL(base);
  u.pathname = '/' + nome;
  return u.toString();
}

/** Cria o banco de teste se não existir. Roda uma vez, antes de tudo. */
/**
 * Conexão de administrador, para o que a aplicação de propósito não pode.
 *
 * Apagar empresa é o caso: `vital_app` recebeu INSERT em `plataforma.tenants`
 * para o cadastro self-service, e nunca DELETE — apagar empresa é operação de
 * plataforma, com backup e registro. O teste que cria empresas precisa
 * desfazer, e desfaz por aqui, não afrouxando a permissão da aplicação.
 */
let admin = null;
export const comoAdmin = (sql, ...params) => admin.query(sql, params);

async function garantirBanco() {
  const manutencao = new pg.Pool({ connectionString: comBanco(url, 'postgres'), ssl: false });
  try {
    const { rows } = await manutencao.query('SELECT 1 FROM pg_database WHERE datname = $1', [NOME]);
    // CREATE DATABASE não aceita parâmetro; o nome vem do .env, não de fora.
    if (!rows.length) await manutencao.query(`CREATE DATABASE "${NOME}"`);
  } finally {
    await manutencao.end();
  }
}

/**
 * Prepara o ambiente e devolve os módulos já apontados para o banco de teste.
 *
 * As variáveis precisam ser trocadas ANTES de importar `db.js`, que lê a URL
 * na carga do módulo. Por isso o import é dinâmico.
 */
export async function prepararBanco() {
  await garantirBanco();

  const adminTeste = comBanco(process.env.DATABASE_ADMIN_URL, NOME);
  const appTeste = comBanco(process.env.DATABASE_URL, NOME);
  if (!adminTeste.endsWith('_teste')) {
    throw new Error('recusando rodar: a URL de teste não termina em _teste');
  }

  process.env.DATABASE_ADMIN_URL = adminTeste;
  process.env.DATABASE_URL = appTeste;

  admin = new pg.Pool({ connectionString: adminTeste, ssl: false });

  const db = await import('../src/db.js');

  // Confere onde o pool REALMENTE foi parar, não o que a variável diz.
  //
  // `db.js` monta o pool na carga do módulo. Se qualquer coisa importar `db.js`
  // — direto ou por tabela — antes desta função rodar, o import abaixo devolve
  // o módulo já em cache, com o pool apontado para o banco de trabalho, e as
  // variáveis de ambiente trocadas acima não valem para nada. Já aconteceu: um
  // `import` estático no topo de um arquivo de teste, e a suíte apagou o banco
  // de desenvolvimento inteiro.
  //
  // Perguntar ao servidor em qual banco a conexão caiu é a única checagem que
  // não pode ser enganada por ordem de import.
  const { current_database: banco } = await db.db.get('SELECT current_database()');
  if (banco !== NOME) {
    throw new Error(
      `o pool está em "${banco}", não em "${NOME}". ` +
      'Algum import estático carregou src/db.js antes de prepararBanco(). ' +
      'Troque por `await import(...)` depois da chamada.'
    );
  }

  await db.iniciarBanco();
  return db;
}

/**
 * Zera as tabelas de negócio entre testes.
 *
 * DELETE, e não TRUNCATE: `vital_app` só recebeu SELECT, INSERT, UPDATE e
 * DELETE — de propósito. E TRUNCATE ignora RLS, então apagaria também o que é
 * de outra empresa. A ordem abaixo é a das chaves estrangeiras, de folha para
 * raiz; tabela nova entra no lugar certo.
 */
const TABELAS = [
  'appointment_addons', 'appointments', 'blocks', 'messages',
  'service_addons', 'category_addons', 'service_staff',
  'users', 'services', 'clients', 'staff', 'units', 'templates',
];

export async function limpar(db) {
  for (const t of TABELAS) await db.db.run(`DELETE FROM ${t}`);

  // A config mora em `plataforma.tenants`, que não tem RLS e não está na lista
  // acima. Sem zerar, um ajuste de config feito por um teste sobrevive para o
  // próximo — e o próximo falha por um motivo que não é dele.
  const { empresaAtual } = await import('../src/lib/contexto.js');
  await db.db.run(`UPDATE plataforma.tenants SET config = '{}' WHERE id = ?`, empresaAtual());
}

/**
 * Zera só a agenda, preservando catálogo e equipe.
 *
 * Criar usuário custa um hash argon2, que é lento de propósito. Refazer a
 * equipe a cada teste somaria segundos à suíte sem testar nada de novo.
 */
export async function limparAgenda(db) {
  for (const t of ['appointment_addons', 'appointments', 'blocks', 'messages']) {
    await db.db.run(`DELETE FROM ${t}`);
  }
}

/**
 * Cenário mínimo e previsível.
 *
 * Números redondos de propósito: jornada das 9 às 18, serviço de 60 min sem
 * intervalo, grade de 30 min. Assim a conta esperada de cada teste é óbvia à
 * leitura, e um resultado errado aponta o bug em vez de levantar dúvida sobre
 * a aritmética do próprio teste.
 */
/**
 * O `prefixo` existe porque as chaves primárias são globais, não por empresa:
 * `staff.id` é único no banco inteiro. Em produção os ids vêm de `uid()`, que é
 * aleatório, então nunca colidem — mas duas empresas de teste com ids escritos
 * à mão colidem na hora.
 */
export async function cenario(db, { jornada, duracao = 60, intervalo = 0, passo = 30, prefixo = '' } = {}) {
  const dias = {};
  for (let d = 0; d <= 6; d++) dias[d] = jornada || ['09:00', '18:00'];

  await db.setConfig({ passoAgenda: passo, antecedenciaHoras: 0, janelaDias: 365 });

  await db.db.run(
    `INSERT INTO staff (id,nome,jornada,ativo,criado_em) VALUES (?,?,?,1,?)`,
    prefixo + 'p1', 'Ana', JSON.stringify(dias), '2026-01-01'
  );
  await db.db.run(
    `INSERT INTO staff (id,nome,jornada,ativo,criado_em) VALUES (?,?,?,1,?)`,
    prefixo + 'p2', 'Bia', JSON.stringify(dias), '2026-01-01'
  );
  await db.db.run(
    `INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem)
     VALUES (?,?,?,?,?,?,1,0)`,
    prefixo + 's1', 'Corte', 'Cabelo', 100, duracao, intervalo
  );
  await db.salvarVinculos(prefixo + 's1', [prefixo + 'p1', prefixo + 'p2']);

  await db.db.run(
    `INSERT INTO clients (id,nome,fone,criado_em) VALUES (?,?,?,?)`,
    prefixo + 'c1', 'Cliente Um', '47900000001', '2026-01-01'
  );
}

/** Ocupa um horário, como um agendamento faria. */
export const agendar = (db, {
  prof = 'p1', data, hora, duracao = 60, status = 'agendado',
  cliente, servico,
}) =>
  db.db.run(
    `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    `a-${data}-${hora}-${prof}`,
    // Sem cliente e serviço explícitos, seguem os do cenário — e o prefixo de
    // empresa, quando houver, é o mesmo do profissional.
    cliente || prof.replace(/p\d+$/, 'c1'),
    servico || prof.replace(/p\d+$/, 's1'),
    prof, data, hora, duracao, 100, status, '2026-01-01'
  );

/** Fecha um intervalo. `prof` nulo fecha a empresa toda. */
export const bloquear = (db, { prof = null, data, ini, fim, motivo = 'teste' }) =>
  db.db.run(
    `INSERT INTO blocks (id,staff_id,data,hora_ini,hora_fim,motivo,criado_em)
     VALUES (?,?,?,?,?,?,?)`,
    `b-${data}-${ini}-${prof || 'todos'}`, prof, data, ini, fim, motivo, '2026-01-01'
  );

/* ------------------------------------------------------------------ *
 * Falar com a API de verdade
 * ------------------------------------------------------------------ */

/**
 * Sobe a aplicação numa porta livre e devolve um cliente HTTP por pessoa.
 *
 * Rota é mais do que o handler: é o middleware de empresa, o cookie de sessão e
 * a guarda de papel, nessa ordem. Testar a função exportada pularia justamente
 * as três camadas onde os vazamentos deste projeto apareceram. Por isso aqui
 * entra pelo `fetch`, como o navegador entraria.
 *
 * Porta 0 = o sistema escolhe uma livre: a suíte não briga com o `npm run dev`
 * que pode estar rodando na 3333.
 */
export async function subirApi() {
  const { app } = await import('../src/app.js');
  const servidor = app.listen(0);
  await new Promise(ok => servidor.once('listening', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  /**
   * Um cliente HTTP que guarda o cookie de sessão, como um navegador.
   *
   * `node:http` e não `fetch`: o `fetch` do Node ignora um header `Host`
   * passado à mão, e é justamente o `Host` que decide de qual empresa é a
   * requisição. Sem controlá-lo não dá para testar o isolamento entre
   * empresas pelas rotas de verdade.
   */
  const cliente = ({ host } = {}) => {
    // Um pote por nome, como o navegador guarda. Guardar a string inteira e
    // substituí-la a cada resposta fazia o último `Set-Cookie` apagar os
    // outros — e aí duas sessões de nomes diferentes nunca coexistiam, o que
    // parecia bug do produto e era do teste.
    const pote = new Map();
    return (metodo, caminho, corpo) => new Promise((ok, falha) => {
      const dados = corpo === undefined ? null : JSON.stringify(corpo);
      const req = http.request({
        hostname: '127.0.0.1', port: servidor.address().port, path: caminho, method: metodo,
        headers: {
          'content-type': 'application/json',
          ...(host ? { host } : {}),
          ...(pote.size ? { cookie: [...pote].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(dados ? { 'content-length': Buffer.byteLength(dados) } : {}),
        },
      }, res => {
        for (const bruto of res.headers['set-cookie'] || []) {
          const [nome, ...resto] = bruto.split(';')[0].split('=');
          const valor = resto.join('=');
          // Cookie limpo pelo servidor vem com valor vazio: sai do pote.
          if (valor) pote.set(nome, valor); else pote.delete(nome);
        }
        let texto = '';
        res.setEncoding('utf8');
        res.on('data', p => { texto += p; });
        res.on('end', () => {
          let json;
          try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
          ok({ status: res.statusCode, corpo: json });
        });
      });
      req.on('error', falha);
      if (dados) req.write(dados);
      req.end();
    });
  };

  const entrar = async (email, senha, opcoes) => {
    const req = cliente(opcoes);
    const r = await req('POST', '/api/auth/login', { email, senha });
    if (r.status !== 200) throw new Error(`login de ${email} falhou: ${JSON.stringify(r.corpo)}`);
    return req;
  };

  /** O mesmo cliente, mas dizendo-se de outro endereço. */
  const noHost = host => cliente({ host });

  return {
    base,
    anonimo: cliente,
    entrar,
    noHost,
    fechar: () => new Promise(ok => servidor.close(ok)),
  };
}

/**
 * Cria uma segunda empresa e a popula com dados próprios.
 *
 * Existe para o teste de isolamento: provar que uma empresa não vê a outra
 * exige duas empresas de verdade, com dado de verdade em cada uma.
 */
export async function criarEmpresa(db, { id, slug, nome, dominio = '' }) {
  // `tenants.nome` é a razão social do cadastro; `config.nome` é o que aparece
  // no site. Nascem iguais — é o que o cadastro self-service também faz.
  await db.db.run(
    `INSERT INTO plataforma.tenants (id, slug, nome, dominio, config, ativo, criado_em)
     VALUES (?,?,?,?,?,1,?)
     ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, dominio = EXCLUDED.dominio,
                                    config = EXCLUDED.config, ativo = 1, status = 'ativa'`,
    id, slug, nome, dominio, JSON.stringify({ nome }), '2026-01-01'
  );
  const { esquecerCacheDeEmpresas } = await import('../src/lib/tenant.js');
  esquecerCacheDeEmpresas();
}

export const SENHA = 'senha-de-teste-1234';

/**
 * Cria dono e funcionária vinculada a `p1`.
 *
 * O dono nasce pelo `/primeiro-acesso` — é o único caminho que existe para o
 * primeiro usuário, e usá-lo aqui garante que o teste esbarra nele também.
 */
export async function criarEquipe(api) {
  const dono = api.anonimo();
  const r = await dono('POST', '/api/auth/primeiro-acesso',
    { nome: 'Dona', email: 'dona@teste.com', senha: SENHA });
  if (r.status !== 201) throw new Error(`primeiro acesso falhou: ${JSON.stringify(r.corpo)}`);

  const nova = await dono('POST', '/api/auth/usuarios', {
    nome: 'Ana', email: 'ana@teste.com', senha: SENHA,
    papel: 'funcionario', profissionalId: 'p1',
  });
  if (nova.status !== 201) throw new Error(`criar funcionária falhou: ${JSON.stringify(nova.corpo)}`);

  return { dono, ana: await api.entrar('ana@teste.com', SENHA) };
}
