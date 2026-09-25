import 'dotenv/config';
import { db, pool, iniciarBanco, uid, setConfig, salvarVinculos } from './db.js';
import { TENANT_PADRAO } from './lib/tenant.js';
import { definirSenhaApp } from './senha-app.js';
import { bancoDescartavel } from './lib/ambiente.js';
import { hoje, addDias } from './lib/dates.js';
import { prepararEmpresaPadrao, provisionarEmpresa } from './lib/provisionar.js';
import { hashDaSenha } from './lib/auth.js';
import { compactarFunil } from './jobs/funil.js';

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
// `default`/TENANT_PADRAO fica só nisto — o fallback de verdade vazio para
// quem abre `localhost` sem subdomínio, do jeito que o CLAUDE.md sempre disse
// que devia ser. Laura Faust não mora mais aqui: ver `primeiraClienteReal()`.
await prepararEmpresaPadrao(TENANT_PADRAO);

if (process.argv.includes('--vazio')) {
  console.log('Empresa vazia, como uma recém-cadastrada. Só a config e os textos.');
  return;
}

// `plataforma.tenants` é a única tabela sem RLS (ver ARQUITETURA.md) — dá
// para checar se já rodou sem precisar de contexto de empresa nenhum.
const jaTem = await db.get(`SELECT 1 FROM plataforma.tenants WHERE id = 'laurafaust'`);
if (jaTem && !process.argv.includes('--forcar')) {
  console.log('Banco já populado. Use `npm run reset` para recomeçar do zero.');
  return;
}

await primeiraClienteReal();
await equipeDaVital();
await segundaEmpresa();

// Fecha o que já passou da retenção, como o cron faria de madrugada. Sem esta
// passada, `funil_diario` nasceria vazia numa máquina nova e a compactação
// pareceria não existir — e é ela que impede a tabela de visitas crescer para
// sempre. Atravessa o RLS por dentro, então roda fora de `comEmpresa`.
const { dias, linhas } = await compactarFunil();
console.log(`  Funil: ${dias} dia(s) além da retenção já compactado(s), ${linhas} linha(s) a menos.`);

console.log('Banco populado.');

}

/**
 * A PRIMEIRA CLIENTE REAL da Vital — Laura Faust, estética, Joinville/SC (ver
 * PRODUCT.md, "Evidence on Hand"). Nome, cor da marca, logo, contato e fotos
 * de serviço são os dela de verdade, tirados da identidade que ela mesma
 * passou; o catálogo abaixo (nomes de serviço e preços) continua aproximação
 * nossa, não a lista de preços real dela — ajustar quando ela confirmar o
 * menu de verdade.
 *
 * Nasce pelo mesmo caminho de uma empresa de verdade, `provisionarEmpresa` —
 * só com **id fixo** (`'laurafaust'`) em vez de sorteado, porque as fotos já
 * foram redimensionadas (e, opcionalmente, sobem para um bucket — ver
 * `subir-uploads-r2.js`) sob esse prefixo antes deste script rodar; um id
 * sorteado a cada `npm run reset` deixaria essas fotos órfãs toda vez.
 *
 * Continua sendo dado de DESENVOLVIMENTO: ela ainda não usa o produto, só
 * vamos lapidar o modelo Clínica com o site dela até o produto estar pronto.
 * Quando ela começar a usar de fato, o cadastro dela de verdade nasce por
 * `POST /api/cadastro` como o de qualquer empresa — este tenant de ensaio não
 * vira aquele sozinho.
 */
async function primeiraClienteReal() {
  const h = hoje();

  const nova = await provisionarEmpresa({
    id: 'laurafaust', nome: 'Laura Faust', ramo: 'Estética', slug: 'laurafaust', origem: 'seed',
  });

  // Onde as fotos do cenário moram. `uploads/` não é versionado — é pasta de
  // arquivo enviado por empresa, não de código —, então numa máquina recém
  // clonada elas não existem e o site nasce com buracos.
  //
  // Com `UPLOADS_BASE_URL` apontando para um bucket público, o seed grava a
  // URL de lá e qualquer máquina nasce completa, sem nada para copiar à mão.
  // Sem a variável, cai no caminho local de sempre, que serve a quem tem os
  // arquivos em disco. A pasta por empresa é a mesma dos dois lados —
  // `uploads.js` grava em `/uploads/<empresa>/`, e é isso que o bucket
  // espelha.
  const BASE_UPLOADS = (process.env.UPLOADS_BASE_URL || '/uploads').replace(/\/+$/, '');
  const F = u => `${BASE_UPLOADS}/${nova.id}/${u}`;

  await db.comEmpresa(nova.id, async () => {
    await setConfig({
      nome: 'Laura Faust',
      slogan: 'Estética e beleza · Joinville',
      fone: '47996195696',
      endereco: 'Rua Félix Heinzelmann, 139, Sala 02 — Bairro Santo Antônio, Joinville/SC',
      cidade: 'Joinville',
      instagram: 'estetica_laurafaust',
      linkAvaliacao: 'https://g.page/estetica-laurafaust',
      whatsapp: '47996195696',
      mapa: 'https://maps.google.com/?q=Rua+Felix+Heinzelmann+139+Santo+Antonio+Joinville',
      sobre: 'Um espaço para você se cuidar e se sentir incrível. Estética, beleza '
        + 'e bem-estar, com atendimento pensado para o seu tempo — sem pressa e '
        + 'sem fórmula pronta.',
      marca: {
        // Verde-sálvia da identidade de marca real dela.
        corPrimaria: '#98a68c',
        corFundo: '#FFFFFF',
        corTexto: '#1A1A1A',
        template: 'clinica',
        logo: F('logo.jpg'),
        // Só uma foto no hero: a em preto-e-branco (profissional-laura.jpg). Já foi
        // a colorida (capa.jpg, que continua no bucket); a troca é decisão de
        // set/2026. O carrossel (CarrosselHero, em Clinica.jsx) continua pronto
        // para `capas` quando uma empresa tiver mais de uma.
        capa: F('profissional-laura.jpg'),
      },
      // Caso real de limpeza de pele, do acervo da Laura. As duas fotos são do
      // rosto de um cliente dela — só ficam no ar enquanto houver autorização
      // de imagem assinada; sem isso, esvaziar este array e a seção volta
      // sozinha ao "Em breve".
      antesDepois: [
        {
          titulo: 'Limpeza de pele profunda',
          antes: F('antes-1.jpg'),
          depois: F('depois-1.jpg'),
        },
      ],
      // A grade do Instagram no site. São fotos reais dela (as mesmas dos
      // serviços), como quem preencheu a tela do painel — não são os posts
      // de verdade do perfil, que só a conexão com a conta traria. Sem link,
      // o toque abre o perfil.
      instagramPosts: [
        'servico-unhas-1.jpg', 'servico-cilios-1.jpg', 'servico-limpeza.jpg',
        'servico-sobrancelha.jpg', 'servico-unhas-2.jpg', 'servico-facial.jpg',
      ].map(u => ({ imagem: F(u), link: '' })),
      textos: {
        chamada: 'Agende seu horário',
        botaoAgendar: 'Agendar',
        // A frase do topo. A anterior ("um espaço para você se cuidar e se
        // sentir incrível") descrevia o negócio e não respondia nada a quem
        // chegou; esta nomeia o incômodo concreto de quem procura estética.
        // Como o catálogo, é RASCUNHO NOSSO — a Laura ainda não escreveu o
        // texto dela.
        hero: 'Sem fila de espera e sem "te encaixo depois": você escolhe o horário '
          + 'que cabe no seu dia e sai daqui com ele confirmado.',
      },
      // As objeções que seguram a decisão neste ramo. Também são RASCUNHO
      // NOSSO, escrito a partir do que costuma aparecer no WhatsApp de um
      // estúdio de estética — trocar pelas respostas dela quando confirmar.
      // Nada disto é do produto: empresa nova nasce sem pergunta nenhuma, e a
      // seção só aparece quando alguém escreve as suas.
      faq: [
        {
          pergunta: 'Nunca fiz. Dá para começar por qualquer serviço?',
          resposta: 'Dá. Antes de começar a gente conversa sobre o que você quer, o que '
            + 'combina com você e quanto tempo leva. Se o que você pediu não for o melhor '
            + 'caminho, a gente diz — e não faz.',
        },
        {
          pergunta: 'Dói?',
          resposta: 'Design de sobrancelha e depilação incomodam por alguns segundos, e dá '
            + 'para aliviar bastante evitando os dias antes da menstruação. Cílios, unhas e '
            + 'limpeza de pele não doem: na limpeza, a parte da extração pode incomodar em '
            + 'pele muito sensível, e a gente vai no seu ritmo.',
        },
        {
          pergunta: 'Quanto tempo dura?',
          resposta: 'Esmaltação em gel, cerca de 3 semanas. Alongamento de unhas pede '
            + 'manutenção a cada 3 ou 4 semanas. Cílios duram o ciclo natural do fio, com '
            + 'manutenção em até 21 dias. Laminação de sobrancelhas, até 6 semanas.',
        },
        {
          pergunta: 'Preciso de manutenção sempre?',
          resposta: 'Só nos serviços que crescem junto com você — unhas e cílios. Você pode '
            + 'parar quando quiser: no alongamento, a remoção é feita aqui, sem danificar a '
            + 'unha natural. Limpeza de pele e design não prendem você a nada.',
        },
        {
          pergunta: 'E se eu não gostar do resultado?',
          resposta: 'Me diga ainda no atendimento, ou nos dois dias seguintes pelo WhatsApp. '
            + 'O que der para ajustar, a gente ajusta sem cobrar de novo.',
        },
        {
          pergunta: 'Posso remarcar se acontecer algo?',
          resposta: 'Pode, pelo mesmo link ou pelo WhatsApp. Avisando com pelo menos 3 horas '
            + 'de antecedência, o horário volta para a agenda e outra pessoa consegue usar.',
        },
      ],
      configurado: true,
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

    // Foto por serviço — as 8 que Laura passou, repetidas onde faz sentido
    // dentro da mesma categoria (duas fotos de unha cobrem cinco serviços de
    // unha), mais a de laminação (`servico-sobrancelha-2.jpg`) e uma
    // ilustrativa do site de referência dela (`servico-cuidado-pele.jpg`),
    // pedida para o cartão de Facial. Nomes e preços continuam aproximação
    // nossa: ela ainda não confirmou o menu de verdade.
    //
    // Quatro categorias, para a grade de cartões da Clínica fechar em 2×2. O
    // cartão de uma categoria mostra a foto do PRIMEIRO serviço dela que tem
    // foto — por isso a laminação vem antes dos dois designs.
    const servicos = [
      ['v1', 'Esmaltação em gel', 'Unhas', 'Esmaltação curada na cabine, durabilidade de 3 semanas.', 85, 75, ['s1'], F('servico-unhas-1.jpg')],
      ['v2', 'Alongamento em fibra', 'Unhas', 'Alongamento F1 com acabamento em gel.', 160, 150, ['s1'], F('servico-unhas-2.jpg')],
      ['v3', 'Manutenção de alongamento', 'Unhas', '', 110, 105, ['s1'], F('servico-reforco.jpg')],
      ['v4', 'Unhas tradicionais', 'Unhas', 'Cutilagem e esmaltação tradicional.', 45, 50, ['s1'], F('servico-unhas-1.jpg')],
      ['v5', 'Plástica dos pés', 'Unhas', 'Esfoliação, hidratação profunda e esmaltação.', 95, 70, ['s1'], F('servico-unhas-2.jpg')],
      ['v6', 'Extensão de cílios 5D', 'Olhar', 'Volume russo com fios tecnológicos.', 190, 135, ['s2'], F('servico-cilios-1.jpg')],
      ['v7', 'Manutenção de cílios', 'Olhar', 'Até 21 dias após a aplicação.', 100, 90, ['s2'], F('servico-cilios-2.jpg')],
      ['v13', 'Laminação de sobrancelhas', 'Sobrancelhas', 'Fios alinhados e efeito preenchido por até 6 semanas.', 120, 60, ['s2'], F('servico-sobrancelha-2.jpg')],
      // Karen também faz o design: é o que faz existir alguém que execute o
      // combo "Dia de cuidado" (limpeza + design) do começo ao fim. Sem isso o
      // combo ia para a vitrine sem ninguém habilitado, e o calendário dele
      // nascia sem dia nenhum.
      ['v8', 'Design de sobrancelha', 'Sobrancelhas', 'Mapeamento e modelagem com pinça.', 45, 35, ['s2', 's3'], F('servico-sobrancelha.jpg')],
      ['v9', 'Design com henna', 'Sobrancelhas', '', 60, 45, ['s2'], F('servico-sobrancelha.jpg')],
      ['v10', 'Limpeza de pele profunda', 'Facial', 'Extração, alta frequência e máscara calmante.', 180, 90, ['s3'], F('servico-cuidado-pele.jpg')],
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

    // Devolve o id porque as fichas de exemplo, mais abaixo, precisam se
    // pendurar num atendimento — resposta de anamnese existe presa a um
    // atendimento, nunca solta na cliente.
    const mk = async (cli, svc, prof, dia, hora, status, pagStatus, forma) => {
      const s = await db.get('SELECT * FROM services WHERE id=?', svc);
      const id = uid();
      await db.run(
        `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,pag_status,pag_forma,origem,criado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'site',?)`,
        id, cli, svc, prof, addDias(h, dia), hora, s.duracao + s.intervalo, s.preco,
        status, pagStatus, forma, h
      );
      return id;
    };
    await mk('c1', 'v1', 's1', 0, '09:00', 'concluido', 'pago', 'pix');
    await mk('c2', 'v6', 's2', 0, '10:30', 'confirmado', 'pago', 'pix');
    await mk('c3', 'v4', 's1', 0, '11:00', 'confirmado', 'aberto', 'local');
    // Limpeza de pele de hoje: fica com a ficha PENDENTE de propósito. É o
    // estado normal de quem agendou pelo site, e é o que a profissional vai
    // encontrar ao abrir o atendimento.
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
    // Duas limpezas antigas da mesma cliente, com a ficha respondida — é o que
    // dá o que mostrar em "Ver fichas de saúde", e mostra a resposta mudando
    // entre uma visita e outra, que é justamente o motivo de a ficha ficar
    // presa ao atendimento em vez de virar campo no cadastro.
    const limpezaAntiga = await mk('c5', 'v10', 's3', -60, '10:00', 'concluido', 'pago', 'pix');
    const limpezaRecente = await mk('c5', 'v10', 's3', -14, '10:00', 'concluido', 'pago', 'pix');

    await oResto();
    // Depois de `oResto()`, que é quem cria o formulário de anamnese: ficha
    // respondida precisa do formulário existindo.
    await fichasDeExemplo({ limpezaAntiga, limpezaRecente });
    // Quatro meses de visitas, com o afunilamento de um site que funciona mas
    // perde gente no meio. Quatro e não um: é o que faz a compactação ter o
    // que fechar (a retenção é de 90 dias), e numa máquina nova a tabela
    // `funil_diario` nasce preenchida em vez de parecer que não existe.
    await funilDeExemplo({ dias: 120, visitasPorDia: 14, queda: [0.42, 0.55, 0.62] });
    await contasDeDesenvolvimento();
  });

  console.log(`  Primeira cliente: ${nova.nome} · ${nova.slug}.localhost:5173`);
}

/**
 * O que o estúdio de exemplo ganhou depois que o seed foi escrito.
 *
 * Adicionais, combo e formulário nasceram em blocos posteriores e ficaram de
 * fora daqui — o que significa que uma máquina nova rodava `npm run reset` e
 * via um sistema mais pobre do que o que existe. Seed que não mostra a
 * funcionalidade é seed que faz a pessoa achar que ela não existe.
 *
 * Unidades NÃO moram aqui de propósito: a Laura tem um endereço só, o de
 * verdade, e duas lojas inventadas faziam o site contradizer o hero ("Rua
 * Félix Heinzelmann" em cima, "Centro / Zona Sul" na janela). A funcionalidade
 * continua visível no seed — na Barbearia, que é ficção inteira.
 */
async function oResto() {
  const h = hoje();

  /* ── horários fechados ────────────────────────────────────────────────── */
  // Dois casos, porque são as duas formas de fechar a agenda e elas se parecem
  // pouco: o almoço avulso de amanhã, e as férias que se repetem por três
  // semanas (uma linha por ocorrência, ligadas por `serie` — ver migration
  // 013). Sem os dois no seed, a tela de Horários fechados nasce vazia numa
  // máquina nova e a repetição parece não existir.
  await db.run(
    `INSERT INTO blocks (id,staff_id,data,hora_ini,hora_fim,motivo,criado_em)
     VALUES (?,?,?,?,?,?,?)`,
    uid(), 's2', addDias(h, 1), '12:00', '13:30', 'Almoço', h
  );
  const ferias = uid();
  for (let i = 0; i < 3; i++) {
    await db.run(
      `INSERT INTO blocks (id,staff_id,data,hora_ini,hora_fim,motivo,serie,criado_em)
       VALUES (?,?,?,?,?,?,?,?)`,
      uid(), 's3', addDias(h, 14 + i * 7), '09:00', '19:00', 'Férias', ferias, h
    );
  }

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

/**
 * Duas anamneses já respondidas, para a tela ter o que mostrar.
 *
 * A ficha saiu do site em 2026-09-23 (dado de saúde; ver `ARQUITETURA.md`) e
 * hoje é a profissional quem pergunta, no atendimento. Sem nenhuma respondida
 * no seed, "Ver fichas de saúde" nasce vazio numa máquina nova e a
 * funcionalidade parece não existir.
 *
 * **As duas são da mesma cliente e mudam entre uma visita e outra** — de pele
 * mista para sensível, e um ácido que ela não usava antes. É o que torna
 * visível a razão de a resposta ficar presa ao atendimento em vez de virar
 * campo no cadastro: guardar só a mais recente apagaria o motivo de um
 * procedimento ter sido feito de um jeito naquele dia.
 *
 * Como o resto do catálogo da Laura, é conteúdo inventado nosso — não é ficha
 * de cliente real nenhuma.
 */
async function fichasDeExemplo({ limpezaAntiga, limpezaRecente }) {
  const form = await db.get(`SELECT id FROM forms WHERE id = 'f1'`);
  if (!form) return;

  // O rótulo vai congelado junto, como o produto faz: a resposta é o registro
  // do que foi perguntado naquele dia, não um ponteiro para a pergunta viva.
  const responder = (agendamentoId, quandoDias, itens) => db.run(
    `INSERT INTO form_answers (id, form_id, appointment_id, client_id, respostas, criado_em)
     VALUES (?, 'f1', ?, 'c5', ?, ?)`,
    uid(), agendamentoId, JSON.stringify(itens), addDias(hoje(), quandoDias)
  );

  await responder(limpezaAntiga, -60, [
    { rotulo: 'Está grávida ou amamentando?', tipo: 'sim_nao', valor: false },
    { rotulo: 'Tipo de pele', tipo: 'escolha', valor: 'Mista' },
    { rotulo: 'Usa algum ácido ou medicação?', tipo: 'longo', valor: 'Não uso nada no momento.' },
  ]);
  await responder(limpezaRecente, -14, [
    { rotulo: 'Está grávida ou amamentando?', tipo: 'sim_nao', valor: false },
    { rotulo: 'Tipo de pele', tipo: 'escolha', valor: 'Sensível' },
    { rotulo: 'Usa algum ácido ou medicação?', tipo: 'longo',
      valor: 'Comecei ácido salicílico à noite, há umas três semanas.' },
    { rotulo: 'Já teve reação a algum produto?', tipo: 'longo',
      valor: 'Ardência com um esfoliante forte, mas passou no mesmo dia.' },
  ]);
}

/**
 * Um mês de visitas ao site, com gente sumindo pelo caminho.
 *
 * O funil é a tela que diz **em qual passo as pessoas desistem** (ver
 * `lib/funil.js`). Sem dado, ela nasce vazia numa máquina nova e a
 * funcionalidade parece não existir — o erro que o CLAUDE.md manda não repetir.
 *
 * As visitas são sorteadas, então dois `npm run reset` dão números diferentes.
 * É de propósito: número redondo demais na tela passa a impressão de que o
 * dado é calculado, e não medido.
 *
 * O `appointment_id` de quem confirmou aponta para os agendamentos que o seed
 * já criou — é o que faz o quinto passo ("compareceu") ter o que contar, já
 * que ele não é evento e sim um join com `appointments.status`.
 *
 * @param {number} o.dias           quantos dias para trás
 * @param {number} o.visitasPorDia  quantas abrem o site por dia
 * @param {number[]} o.queda        fração que sobrevive a cada passo seguinte
 */
async function funilDeExemplo({ dias = 30, visitasPorDia, queda }) {
  const h = hoje();
  // Os agendamentos que já existem, para pendurar os "confirmou" neles. Os
  // concluídos são os que viram "compareceu" na conta.
  const agendamentos = await db.all(`SELECT id FROM appointments ORDER BY data DESC`);
  let proximo = 0;

  for (let d = dias - 1; d >= 0; d--) {
    const dia = addDias(h, -d);
    // Fim de semana movimenta menos, como num negócio de verdade.
    const fds = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
    const visitas = Math.max(1, Math.round(visitasPorDia * (fds ? 0.45 : 1) * (0.7 + Math.random() * 0.6)));

    // Uma sessão por visita, e cada uma anda por quantas etapas sobreviver —
    // como acontece de verdade. Sessões independentes por etapa dariam a mesma
    // contagem na tela, mas gravariam algo que não pode existir (uma visita
    // que confirmou sem ter aberto o site).
    for (let v = 0; v < visitas; v++) {
      const sessao = sessaoSorteada();
      await marcarNoSeed(sessao, 'site', dia);

      const etapas = ['agendamento', 'horario', 'confirmou'];
      for (const [i, etapa] of etapas.entries()) {
        if (Math.random() > queda[i]) break;         // desistiu aqui
        // Empresa sem agenda nenhuma no seed não pode ter "confirmou": seria
        // uma visita que marcou horário sem existir agendamento, e a tela
        // mostraria uma conversão que o banco desmente. O funil dela para no
        // horário — que é, aliás, um caso real: site visitado, nada vendido.
        if (etapa === 'confirmou' && !agendamentos.length) break;
        await marcarNoSeed(
          sessao, etapa, dia,
          etapa === 'confirmou' ? agendamentos[proximo++ % agendamentos.length].id : null
        );
      }
    }
  }
}

/**
 * 32 hexadecimais, a mesma forma que o navegador sorteia e a rota exige.
 *
 * `function` e não `const`: estas duas são chamadas por `funilDeExemplo()`,
 * que roda enquanto o módulo ainda está sendo avaliado — uma `const` declarada
 * aqui embaixo só existe depois, e a chamada morre na zona morta temporal.
 */
function sessaoSorteada() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Um passo, direto no banco: o seed não passa pela rota pública. */
function marcarNoSeed(sessao, etapa, data, appointmentId = null) {
  return db.run(
    `INSERT INTO funil (sessao, etapa, data, appointment_id) VALUES (?,?,?,?)
     ON CONFLICT DO NOTHING`,
    sessao, etapa, data, appointmentId
  );
}

/** Nada de conta ou empresa de demonstração fora da máquina de quem programa. */
function ehLocal() {
  return bancoDescartavel();
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
      // Com mais de uma unidade, o site mostra os endereços DELAS, não este —
      // ver `lugares()` em web/src/site/enderecos.js. Fica igual ao da
      // primeira loja para não haver duas versões do mesmo endereço.
      endereco: 'Rua das Palmeiras, 88 — Centro, Joinville/SC',
      cidade: 'Joinville',
      // Fictício, como o resto desta empresa — mas precisa existir: sem
      // WhatsApp cadastrado o "tirar dúvida" de cada serviço some, e some com
      // razão. Sem ele aqui, a funcionalidade não apareceria no seed.
      whatsapp: '47933334444',
      configurado: true,
      vocabulario: { profissional: 'barbeiro', profissionais: 'barbeiros' },
      textos: { hero: 'Corte na hora marcada. Você não espera sentado, e a cadeira é sua.' },
      // Duas perguntas de outro ramo, de propósito: é o que mostra que o FAQ
      // é campo da empresa e não uma lista de estética embutida no produto.
      faq: [
        {
          pergunta: 'Preciso marcar ou posso chegar e esperar?',
          resposta: 'Pode chegar, mas quem marcou tem preferência. Marcando aqui pelo site '
            + 'você entra na cadeira na hora combinada.',
        },
        {
          pergunta: 'Atendem criança?',
          resposta: 'Atendemos, a partir dos 3 anos. Marque no nome da criança para o tempo '
            + 'do corte já sair certo.',
        },
      ],
      // Segundo modelo de exemplo — Quadro de Horários, fundo escuro, números
      // em mono. É onde alguém vê que o site muda de verdade entre empresas.
      marca: { corPrimaria: '#1F4E5F', template: 'quadro' },
    });

    await db.run(
      `INSERT INTO users (id, nome, email, senha_hash, papel, ativo, criado_em)
       VALUES (?,?,?,?,'dono',1,?)`,
      uid(), 'João Silva', 'joao@barbearia.com', await hashDaSenha(SENHA_DEV), hoje()
    );

    /* ── unidades ───────────────────────────────────────────────────────── */
    // Duas, para a escolha de endereço aparecer no site. Com uma só, o passo
    // some — e some com razão, mas aí não dá para ver como é. É a Barbearia
    // que tem duas lojas, e não a Laura, porque a Barbearia é ficção inteira
    // e a Laura tem um endereço só, o de verdade.
    for (const [id, nome, endereco, ordem] of [
      ['u1', 'Centro', 'Rua das Palmeiras, 88 — Centro, Joinville/SC', 0],
      ['u2', 'Zona Sul', 'Av. Beira-Rio, 900 — Boa Vista, Joinville/SC', 1],
    ]) {
      await db.run(
        `INSERT INTO units (id,nome,endereco,fone,mapa,jornada,ordem,ativo,criado_em)
         VALUES (?,?,?,?,'','{}',?,1,?)`,
        id, nome, endereco, '4733334444', ordem, hoje()
      );
    }

    const jornada = JSON.stringify(Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map(d => [d, ['09:00', '19:00']])
    ));
    // João fica sem unidade de propósito: é o dono, atende nas duas lojas, e é
    // o que o sistema faz com `unit_id` nulo. Rafa só na Zona Sul — no Centro
    // o passo de barbeiro some (sobra um), na Zona Sul aparece.
    for (const [id, nome, cor, unidade] of [
      ['b1', 'João Silva', '#1F4E5F', null], ['b2', 'Rafa Duarte', '#8A6A2F', 'u2'],
    ]) {
      await db.run(
        `INSERT INTO staff (id,nome,funcao,cor,comissao,jornada,unit_id,ativo,criado_em) VALUES (?,?,?,?,?,?,?,1,?)`,
        id, nome, 'Barbeiro', cor, 40, jornada, unidade, hoje()
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

    // Um funil bem pior que o da Laura, de propósito: é com duas empresas
    // diferentes lado a lado que a tela da Vital mostra para que serve —
    // aqui a queda grande está logo na abertura do agendamento.
    await funilDeExemplo({ dias: 120, visitasPorDia: 9, queda: [0.18, 0.5, 0.45] });
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
    { email: 'dono@vital.com', nome: 'Laura Faust', papel: 'dono', prof: 's1' },
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
  console.log('  Painel: http://laurafaust.localhost:5173/painel.html');
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
