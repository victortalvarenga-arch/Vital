import { Router } from 'express';
import { db } from '../db.js';
import { hoje, addDias, diasEntre } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { escopoDe } from '../lib/auth.js';

export const relatorios = Router();

/**
 * Resumo financeiro de um período.
 *
 * Aceita `de`/`ate` ('YYYY-MM-DD') ou `mes` ('YYYY-MM'), que continua valendo
 * porque é o recorte que se olha noventa por cento das vezes. Era o único que
 * existia, e "quanto entrou nesta semana" ou "como foi o feriado" não tinham
 * resposta — mês fechado é a pergunta do contador, não a de quem opera.
 */
relatorios.get('/resumo', rota(async (req, res) => {
  const mes = req.query.mes || hoje().slice(0, 7);
  const de = req.query.de || `${mes}-01`;
  const ate = req.query.ate || ultimoDiaDoMes(mes);
  const h = hoje();

  // Funcionário vê a própria produção; dono vê o negócio inteiro. O recorte
  // entra em TODAS as consultas — deixar uma de fora vazaria o faturamento da
  // empresa numa linha só.
  //
  // `profissionalId` deixa quem vê tudo olhar uma pessoa de cada vez. Ele só
  // vale para quem já podia ver todo mundo: para o funcionário, `escopoDe`
  // continua mandando e o parâmetro é ignorado — senão bastaria adivinhar um
  // id na barra de endereço para ler o faturamento da colega.
  const escopo = escopoDe(req.usuario);
  const so = escopo || (req.query.profissionalId || null);
  const meu = so ? 'AND staff_id = ?' : '';
  const meuA = so ? 'AND a.staff_id = ?' : '';
  const arg = so ? [so] : [];

  const g = await db.get(
    `SELECT
        SUM(CASE WHEN status='concluido' AND pag_status='pago' THEN valor ELSE 0 END) recebido,
        SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) atendimentos,
        SUM(CASE WHEN status='falta' THEN 1 ELSE 0 END) faltas,
        SUM(CASE WHEN status='cancelado' THEN 1 ELSE 0 END) cancelados,
        -- Do período, não de hoje: previstoHoje responde "quanto ainda entra
        -- hoje" e não serve a quem está olhando a semana passada. Cancelado
        -- fica de fora dos dois: não é dinheiro que se espera nem
        -- atendimento que ocupou alguém.
        SUM(CASE WHEN status<>'cancelado' THEN valor ELSE 0 END) previsto,
        SUM(CASE WHEN status<>'cancelado' THEN 1 ELSE 0 END) agendados
       FROM appointments WHERE data >= ? AND data <= ? ${meu}`,
    de, ate, ...arg
  );

  const aReceber = (await db.get(
    `SELECT SUM(valor) v FROM appointments
      WHERE pag_status='aberto' AND data <= ? AND status IN ('agendado','confirmado','concluido') ${meu}`,
    h, ...arg
  )).v || 0;

  const previstoHoje = (await db.get(
    `SELECT SUM(valor) v FROM appointments WHERE data=? AND status <> 'cancelado' ${meu}`,
    h, ...arg
  )).v || 0;

  // O que os agendamentos DESTE período ainda devem render: o que está marcado
  // ou já foi atendido e não foi pago. Falta e cancelamento ficam de fora — não
  // é dinheiro que se espera —, e é por isso que não dá para tirar isto de
  // `previsto - recebido`: ali a falta entra, e a tela prometeria o que não vem.
  const aReceberNoPeriodo = (await db.get(
    `SELECT SUM(valor) v FROM appointments
      WHERE data >= ? AND data <= ? AND pag_status='aberto'
        AND status IN ('agendado','confirmado','concluido') ${meu}`,
    de, ate, ...arg
  )).v || 0;

  /**
   * O que mais dá dinheiro, por serviço.
   *
   * `appointments.valor` já traz os adicionais somados — foi assim de propósito,
   * para o motor de horários e o caixa lerem um número só. O efeito colateral
   * aparecia aqui: a limpeza de pele levava o crédito do buço vendido junto, e o
   * ranking dizia que ela rendia mais do que rende.
   *
   * Cada extra passa a valer pelo próprio serviço, e o principal fica com o que
   * sobra. A soma das linhas continua batendo com o caixa — nada foi contado
   * duas vezes, só atribuído a quem é.
   *
   * Combos já saíam certos: cada parte é um agendamento com o rateio no `valor`.
   */
  const porServico = await db.all(
    `WITH concluidos AS (
       SELECT a.id, a.service_id, a.valor
         FROM appointments a
        WHERE a.data >= ? AND a.data <= ? AND a.status='concluido' ${meuA}
     ),
     extras AS (
       SELECT aa.appointment_id, aa.service_id, aa.preco
         FROM appointment_addons aa JOIN concluidos c ON c.id = aa.appointment_id
     ),
     linhas AS (
       SELECT c.service_id,
              c.valor - COALESCE(
                (SELECT SUM(e.preco) FROM extras e WHERE e.appointment_id = c.id), 0) AS valor
         FROM concluidos c
       UNION ALL
       SELECT e.service_id, e.preco FROM extras e
     )
     SELECT s.nome, COUNT(*) qtd, SUM(l.valor) total
       FROM linhas l JOIN services s ON s.id = l.service_id
      GROUP BY s.id, s.nome ORDER BY total DESC`,
    de, ate, ...arg
  );

  const producao = await db.all(
    `SELECT p.id, p.nome, p.comissao, COUNT(*) qtd, SUM(a.valor) producao
       FROM appointments a JOIN staff p ON p.id=a.staff_id
      WHERE a.data >= ? AND a.data <= ? AND a.status='concluido' ${meuA}
      GROUP BY p.id, p.nome, p.comissao ORDER BY producao DESC`,
    de, ate, ...arg
  );
  const porProfissional = producao.map(r => ({
    ...r, comissaoValor: (r.producao || 0) * (r.comissao || 0) / 100,
  }));

  // `status='concluido'` junto, e não só `pag_status='pago'`: um atendimento
  // que entrou como pago e depois virou falta continuava somando aqui, e a
  // divisão por forma passava a discordar do recebido logo acima. Com o
  // fechamento automático isso deixou de ser hipótese — é o caminho normal de
  // quem corrige um no-show.
  const porForma = await db.all(
    `SELECT pag_forma forma, SUM(valor) total FROM appointments
      WHERE data >= ? AND data <= ? AND pag_status='pago' AND status='concluido' ${meu}
      GROUP BY pag_forma ORDER BY total DESC`,
    de, ate, ...arg
  );

  // O mesmo tanto de dias, imediatamente antes: sem comparação, um número
  // sozinho não diz se o mês está indo bem ou mal.
  const dias = diasEntre(de, ate) + 1;
  const anterior = await db.get(
    `SELECT SUM(CASE WHEN status='concluido' AND pag_status='pago' THEN valor ELSE 0 END) recebido,
            SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) atendimentos
       FROM appointments WHERE data >= ? AND data <= ? ${meu}`,
    addDias(de, -dias), addDias(de, -1), ...arg
  );

  const recebido = g.recebido || 0;

  // Custos: as comissões pagas sobre o que entrou. Mesma base do `recebido`
  // (concluído e pago), senão receita, custos e lucro lado a lado contariam
  // coisas diferentes. A comissão é arredondada em centavos POR atendimento e a
  // sobra do arredondamento fica com a empresa. Vale para todos: para o
  // funcionário o `escopoDe` já recortou nas comissões DELE (é o que ele recebe).
  //
  // Lucro é do dono. Funcionário recebe `null`: a comissão dos colegas não é
  // dado dele — e para ele "lucro da empresa" nem existe.
  const { c: comissaoCentavos } = await db.get(
    `SELECT SUM(ROUND(a.valor * 100 * COALESCE(p.comissao, 0) / 100)) c
       FROM appointments a JOIN staff p ON p.id = a.staff_id
      WHERE a.data >= ? AND a.data <= ? AND a.status='concluido' AND a.pag_status='pago' ${meuA}`,
    de, ate, ...arg
  );
  const custos = (comissaoCentavos || 0) / 100;
  const lucro = escopo ? null : lucroEmReais(recebido, comissaoCentavos);

  res.json({
    mes, de, ate, dias,
    recebido,
    custos,
    lucro,
    aReceber,
    aReceberNoPeriodo,
    previstoHoje,
    atendimentos: g.atendimentos || 0,
    faltas: g.faltas || 0,
    cancelados: g.cancelados || 0,
    previsto: g.previsto || 0,
    agendados: g.agendados || 0,
    ticketMedio: g.atendimentos ? recebido / g.atendimentos : 0,
    porServico, porProfissional, porForma,
    // A tela precisa saber que está vendo um recorte, senão o dono acha que o
    // faturamento caiu quando na verdade está olhando pelo login errado.
    //
    // `escopo`, não `so`: um dono que escolheu ver uma pessoa não está limitado
    // pelo papel dele, está filtrando de propósito. Confundir os dois faria a
    // tela avisar "você só vê o seu" para quem vê tudo.
    somenteMeu: Boolean(escopo),
    // Quem está no recorte, seja por papel ou por escolha. `null` = a empresa
    // inteira.
    profissionalId: so || null,
    anterior: {
      de: addDias(de, -dias), ate: addDias(de, -1),
      recebido: anterior?.recebido || 0,
      atendimentos: anterior?.atendimentos || 0,
    },
  });
}));

/**
 * A série do gráfico do Financeiro: receita, custos e lucro por hora, dia ou mês.
 *
 * `por` diz o tamanho do degrau; quem escolhe é a tela, conforme o período
 * (hoje → hora, semana e mês → dia, ano → mês). Devolve **todos** os degraus do
 * período, zerados onde não houve venda, para o eixo nunca pular — e recusa o
 * que geraria um gráfico ilegível (mais de 400 degraus).
 *
 * Mesma base e mesmo recorte do `/resumo`: concluído e pago, `escopoDe` para o
 * funcionário (que recebe `lucro: null`), `profissionalId` só para quem vê tudo.
 * A hora é a do atendimento, não a do pagamento — o sistema só guarda a data
 * em que o pagamento foi marcado como feito.
 */
const DEGRAUS = {
  hora: 'substr(a.hora, 1, 2)',
  dia: 'a.data',
  mes: 'substr(a.data, 1, 7)',
};
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

relatorios.get('/serie', rota(async (req, res) => {
  const por = String(req.query.por || 'dia');
  const de = String(req.query.de || '');
  const ate = String(req.query.ate || '');
  if (!DEGRAUS[por]) return res.status(400).json({ erro: 'por deve ser hora, dia ou mes' });
  if (!DATA_ISO.test(de) || !DATA_ISO.test(ate) || de > ate) {
    return res.status(400).json({ erro: 'informe de e ate (AAAA-MM-DD), com de até ate' });
  }

  const escopo = escopoDe(req.usuario);
  const so = escopo || (req.query.profissionalId || null);

  // Os degraus do período, antes de consultar: 400 é decidido sem tocar no banco.
  let chaves = [];
  if (por === 'dia') {
    if (diasEntre(de, ate) + 1 > 400) return res.status(400).json({ erro: 'período grande demais para ver por dia' });
    for (let d = de; d <= ate; d = addDias(d, 1)) chaves.push(d);
  } else if (por === 'mes') {
    chaves = mesesEntre(de.slice(0, 7), ate.slice(0, 7));
    if (chaves.length > 400) return res.status(400).json({ erro: 'período grande demais' });
  }

  const linhas = await db.all(
    `SELECT ${DEGRAUS[por]} chave, SUM(a.valor) recebido,
            SUM(ROUND(a.valor * 100 * COALESCE(p.comissao, 0) / 100)) comissao
       FROM appointments a JOIN staff p ON p.id = a.staff_id
      WHERE a.data >= ? AND a.data <= ? AND a.status='concluido' AND a.pag_status='pago'
        ${so ? 'AND a.staff_id = ?' : ''}
      GROUP BY ${DEGRAUS[por]}`,
    de, ate, ...(so ? [so] : [])
  );
  const porChave = new Map(linhas.map(l => [l.chave, l]));

  if (por === 'hora') {
    // Horário comercial por padrão, esticado para caber o que existe: uma venda
    // às 7h ou às 21h não pode ficar de fora do eixo.
    const horas = linhas.map(l => Number(l.chave));
    const ini = Math.min(8, ...horas);
    const fim = Math.max(19, ...horas);
    for (let h = ini; h <= fim; h++) chaves.push(String(h).padStart(2, '0'));
  }

  res.json({
    por, de, ate,
    profissionalId: so || null,
    somenteMeu: Boolean(escopo),
    pontos: chaves.map(chave => {
      const l = porChave.get(chave);
      const receita = l?.recebido || 0;
      const custos = (l?.comissao || 0) / 100;
      return { chave, receita, custos, lucro: escopo ? null : lucroEmReais(receita, l?.comissao) };
    }),
  });
}));

/**
 * O mês atual e os 11 anteriores, um número por mês — o gráfico do Resumo.
 *
 * Sempre 12 linhas, do mais antigo ao atual, com zero nos meses sem venda: quem
 * desenha não precisa inventar o mês que faltou, e o eixo nunca pula.
 *
 * Mesma base e mesmo recorte do `/resumo`: só o concluído e pago, `escopoDe`
 * para o funcionário (que recebe `lucro: null` e fica com o `recebido`
 * dele), `profissionalId` para o dono olhar uma pessoa.
 */
relatorios.get('/mensal', rota(async (req, res) => {
  const meses = ultimosMeses(hoje().slice(0, 7), 12);
  const de = `${meses[0]}-01`;
  const ate = ultimoDiaDoMes(meses[meses.length - 1]);

  const escopo = escopoDe(req.usuario);
  const so = escopo || (req.query.profissionalId || null);

  const linhas = await db.all(
    `SELECT substr(a.data, 1, 7) mes, SUM(a.valor) recebido,
            SUM(ROUND(a.valor * 100 * COALESCE(p.comissao, 0) / 100)) comissao
       FROM appointments a JOIN staff p ON p.id = a.staff_id
      WHERE a.data >= ? AND a.data <= ? AND a.status='concluido' AND a.pag_status='pago'
        ${so ? 'AND a.staff_id = ?' : ''}
      GROUP BY substr(a.data, 1, 7)`,
    de, ate, ...(so ? [so] : [])
  );
  const porMes = new Map(linhas.map(l => [l.mes, l]));

  res.json({
    profissionalId: so || null,
    somenteMeu: Boolean(escopo),
    meses: meses.map(mes => {
      const l = porMes.get(mes);
      const recebido = l?.recebido || 0;
      return { mes, recebido, lucro: escopo ? null : lucroEmReais(recebido, l?.comissao) };
    }),
  });
}));

/** Recebido menos comissões, com as comissões já somadas em centavos inteiros. */
function lucroEmReais(recebido, comissaoCentavos) {
  return (Math.round(recebido * 100) - (comissaoCentavos || 0)) / 100;
}

/** Todos os 'YYYY-MM' de `ini` a `fim`, inclusive. */
function mesesEntre(ini, fim) {
  let [ano, m] = ini.split('-').map(Number);
  const [anoFim, mFim] = fim.split('-').map(Number);
  const meses = [];
  while (ano < anoFim || (ano === anoFim && m <= mFim)) {
    meses.push(`${ano}-${String(m).padStart(2, '0')}`);
    if (++m === 13) { m = 1; ano++; }
    if (meses.length > 1000) break;
  }
  return meses;
}

/** 'YYYY-MM' de `n` meses terminando em `fim`, do mais antigo ao mais novo. */
function ultimosMeses(fim, n) {
  let [ano, m] = fim.split('-').map(Number);
  const meses = [];
  for (let i = 0; i < n; i++) {
    meses.unshift(`${ano}-${String(m).padStart(2, '0')}`);
    if (--m === 0) { m = 12; ano--; }
  }
  return meses;
}

/**
 * Ranking do mês: quem mais atendeu.
 *
 * É a única rota de relatório que mostra a equipe inteira a um funcionário — de
 * propósito, porque o ranking só serve se todo mundo aparece nele. Por isso ela
 * devolve **só contagem** para quem está sob `escopoDe`; a produção em dinheiro
 * (o que cada colega faturou) só sai para o dono. Ordena por atendimentos, e não
 * por valor, para a ordem que o funcionário vê não denunciar o faturamento dos
 * outros.
 */
relatorios.get('/ranking', rota(async (req, res) => {
  const mes = req.query.mes || hoje().slice(0, 7);
  const de = `${mes}-01`;
  const ate = ultimoDiaDoMes(mes);
  const veDinheiro = !escopoDe(req.usuario);

  const linhas = await db.all(
    `SELECT p.id, p.nome, COUNT(*) qtd, SUM(a.valor) producao
       FROM appointments a JOIN staff p ON p.id = a.staff_id
      WHERE a.data >= ? AND a.data <= ? AND a.status='concluido'
      GROUP BY p.id, p.nome ORDER BY qtd DESC, producao DESC, p.nome`,
    de, ate
  );
  res.json({
    mes, de, ate,
    ranking: linhas.map(l => ({
      id: l.id, nome: l.nome, qtd: l.qtd,
      ...(veDinheiro ? { producao: l.producao || 0 } : {}),
    })),
  });
}));

/** Último dia de um mês 'YYYY-MM'. Em UTC, para não escorregar de fuso. */
function ultimoDiaDoMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
}

/** Ocupação da agenda: quanto da jornada foi vendido. Serve para decidir contratação. */
relatorios.get('/ocupacao', rota(async (req, res) => {
  const de = req.query.de || hoje().slice(0, 7) + '-01';
  const ate = req.query.ate || hoje();
  const so = escopoDe(req.usuario);
  const rows = await db.all(
    `SELECT p.nome, SUM(a.duracao) minutos_vendidos, COUNT(*) atendimentos
       FROM appointments a JOIN staff p ON p.id=a.staff_id
      WHERE a.data BETWEEN ? AND ? AND a.status IN ('confirmado','concluido')
        ${so ? 'AND a.staff_id = ?' : ''}
      GROUP BY p.id, p.nome`,
    de, ate, ...(so ? [so] : [])
  );
  res.json({ de, ate, profissionais: rows });
}));
