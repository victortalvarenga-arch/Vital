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
  res.json({
    mes, de, ate, dias,
    recebido,
    aReceber,
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
