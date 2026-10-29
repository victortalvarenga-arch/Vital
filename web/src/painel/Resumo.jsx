import { useEffect, useState } from 'react';
import {
  Ban, Cake, CalendarPlus, Check, ChevronDown, Copy, Globe, Plus, Send, TriangleAlert, Trophy, User, Wallet,
} from 'lucide-react';
import { FLUXO, mudarSituacao } from './fluxo.js';
import { api } from '../shared/painel-api.js';
import SeletorPessoas from './SeletorPessoas.jsx';
import { brl } from '../shared/formato.js';
import { Dica, Numero } from './Cartoes.jsx';
import { compacto, rotuloDeValor, tetoDoEixo } from '../shared/graficos.js';
import { faixaDeHoras, hojeISO, iniciais, toMin } from '../shared/tempo.js';
import GradeDoDia from './GradeDoDia.jsx';
import Remarcar from './Remarcar.jsx';
import { useArrastar } from './useArrastar.js';

/**
 * Resumo: a tela que abre primeiro no painel.
 *
 * Responde, de cima para baixo, três perguntas na ordem em que alguém abre o
 * painel de manhã: **como está o dia agora**, **o que precisa de mim** e **como
 * vai o negócio**. Sem seletor de período, de propósito — mês fechado, semana e
 * comparação com o período anterior são a pergunta do Financeiro, e duas telas
 * respondendo a mesma coisa é o começo de duas respostas diferentes.
 *
 * **Dinheiro vem do servidor; contagem de agenda vem do estado.** Os valores
 * saem de `/api/relatorios/resumo`, `/ranking` e `/mensal`, a mesma fonte do
 * Financeiro: a conta de "recebido", "lucro" e "ticket médio" já existe lá,
 * recortada por `escopoDe`, e refazê-la no navegador seria a segunda versão da
 * mesma regra, livre para divergir. Já quantos atendimentos há hoje, quem é o
 * próximo e o que está sem confirmar sai de `dados.agendamentos`, que a tela já
 * tem na memória — pedir ao servidor o que está aqui do lado só deixaria a tela
 * mais lenta.
 *
 * Nada aqui é editável. É a versão de relance da Agenda, não uma segunda forma
 * de mexer nela — o que existe são atalhos que levam para a tela certa.
 */
export default function Resumo({ dados, acao, aviso, poderes, irPara, fila }) {
  const { staff, clientes, servicos, agendamentos } = dados;
  const hoje = hojeISO();

  // Quem o dono está olhando. '' é a empresa inteira. O funcionário não tem
  // essa escolha — e o servidor ignora o parâmetro para ele de qualquer jeito,
  // então esconder o seletor é conveniência, não controle de acesso.
  const [quem, setQuem] = useState('');
  const [mensal, setMensal] = useState(null);
  const [diario, setDiario] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [serie, setSerie] = useState(null);
  const [falhou, setFalhou] = useState(false);
  // Cada "Tentar de novo" muda este número, e os três carregamentos refazem.
  const [tentativa, setTentativa] = useState(0);

  const mes = hoje.slice(0, 7);

  useEffect(() => {
    let vivo = true;
    setMensal(null);
    setDiario(null);
    setFalhou(false);
    const filtro = { profissionalId: quem || undefined };
    // Falha precisa parecer falha. Antes isto caía em `null`, que é o mesmo
    // estado de "carregando" — sessão expirada virava um "Calculando…" eterno,
    // sem nada no console.
    const falha = () => { if (vivo) setFalhou(true); };
    api.resumo({ mes, ...filtro }).then(x => { if (vivo) setMensal(x); }).catch(falha);
    api.resumo({ de: hoje, ate: hoje, ...filtro }).then(x => { if (vivo) setDiario(x); }).catch(falha);
    return () => { vivo = false; };
  }, [mes, hoje, quem, tentativa]);

  // Os 12 meses do gráfico. Acompanham o filtro de pessoa, como os cartões.
  useEffect(() => {
    let vivo = true;
    setSerie(null);
    api.mensal({ profissionalId: quem || undefined })
      .then(x => { if (vivo) setSerie(x.meses); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [quem, tentativa]);

  // O ranking é da equipe toda, então não muda com o filtro de pessoa: o
  // ranking de uma pessoa só não seria ranking.
  useEffect(() => {
    let vivo = true;
    api.ranking({ mes })
      .then(x => { if (vivo) setRanking(x.ranking); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [mes, tentativa]);

  const doMeuRecorte = a => !quem || a.prof === quem;
  const doDia = agendamentos
    .filter(a => a.data === hoje && a.status !== 'cancelado')
    .filter(doMeuRecorte);
  const concluidosHoje = doDia.filter(a => a.status === 'concluido').length;

  const agora = new Date();
  const minAgora = agora.getHours() * 60 + agora.getMinutes();
  // Só o que ainda não terminou: passou a hora de fim, sai da lista sozinho.
  const proximos = doDia
    .filter(a => (a.status === 'agendado' || a.status === 'confirmado')
      && toMin(a.hora) + a.duracao > minAgora)
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .slice(0, 6);

  // Funcionário vê só a própria coluna — mesmo recorte que o servidor já
  // aplica em `escopoDe`. Dono vê todo mundo, lado a lado.
  const colunas = poderes.verDeTodos
    ? staff.filter(p => p.ativo && (!quem || p.id === quem))
    : staff.filter(p => p.id === dados.eu?.profissionalId);

  // A agenda do dia aqui também se arrasta: é a mesma grade da Agenda, e quem
  // abre o painel de manhã e vê que a de 9h não vem quer empurrar ali mesmo,
  // sem trocar de tela. Sem beirada, porque esta grade mostra hoje e só hoje —
  // não há para onde virar a página.
  const [remarcando, setRemarcando] = useState(null);
  const arrastar = useArrastar({
    agendamentos, bloqueios: dados.bloqueios || [], servicos, staff,
    agora: { data: hoje, hora: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}` },
    faixa: faixaDeHoras(doDia), regua: [34, 8], grade: '.eq-timeline',
    aoSoltar: setRemarcando, aviso,
    // Tocar sem arrastar leva para a Agenda: aqui não há gaveta de atendimento,
    // e bloco que não faz nada ao ser clicado parece defeito.
    aoTocar: () => irPara?.('agenda'),
  });

  // Rótulo honesto: "Faturamento" sozinho, filtrado numa pessoa, faria o dono
  // ler o número dela como o da empresa.
  const doFiltro = quem && staff.find(p => p.id === quem);
  const meu = !poderes.verDeTodos;
  const dono = rotulo => (meu ? `Seu ${rotulo.toLowerCase()}`
    : doFiltro ? `${rotulo} · ${doFiltro.nome.split(' ')[0]}` : rotulo);

  const alertas = pendencias({ agendamentos, clientes, hoje, doMeuRecorte, fila, poderes, irPara });
  // Quem está na cadeira agora: o próximo passo dela é "Concluir".
  const naCadeira = doDia.filter(a => a.status === 'em_atendimento');
  const avancar = (id, status) => mudarSituacao({ acao, agendamentos, clientes }, id, status);
  // Empresa que ainda não atendeu ninguém: zeros ensinam nada. No lugar deles,
  // os três passos até o primeiro agendamento. Só para o dono — quem atende
  // não configura o negócio.
  const comecando = poderes.verDeTodos && agendamentos.length === 0;

  return (
    <>
      <div className="head">
        <div>
          <h2>Olá, {primeiroNome(dados.eu?.nome)}</h2>
          <div className="sub">{doDiaPorExtenso(hoje)}</div>
        </div>
        {/* O mesmo seletor da Agenda, mas de uma pessoa só: os números do Resumo
            vêm somados do servidor, que recorta uma pessoa por vez. */}
        <SeletorPessoas staff={staff} valor={quem ? [quem] : []} aoMudar={l => setQuem(l[0] || '')}
                        podeVerTodos={poderes.verDeTodos} rotuloTodos="A equipe toda" />
      </div>

      {falhou && (
        <div className="rs-falha" role="alert">
          <span>Não deu para carregar os números agora.</span>
          <button className="btn btn-g btn-s" onClick={() => setTentativa(n => n + 1)}>Tentar de novo</button>
        </div>
      )}

      {/* O que se abre o painel para saber, quarenta vezes por dia: quem é a
          próxima, e o botão do passo dela ali mesmo — o mesmo da gaveta. */}
      {comecando
        ? <PrimeirosPassos irPara={irPara} aviso={aviso} />
        : <ProximaCliente proxima={proximos[0]} naCadeira={naCadeira} clientes={clientes}
                          servicos={servicos} staff={staff} mostrarQuem={poderes.verDeTodos}
                          avancar={avancar} irPara={irPara} />}

      <Hoje total={doDia.length} concluidos={concluidosHoje}
            diario={diario} pendencias={alertas.length} />

      <Atencao alertas={alertas} />

      <AcoesRapidas irPara={irPara} poderes={poderes} naFila={fila?.itens.length || 0} />

      {proximos.length > 1 && (
        <div className="card rs-depois">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Depois, hoje</div>
          <div className="list">
            {proximos.slice(1).map(a => {
              const c = clientes.find(x => x.id === a.cliente);
              const s = servicos.find(x => x.id === a.servico);
              const p = staff.find(x => x.id === a.prof);
              return (
                <div key={a.id} className="li">
                  <span className="mono rs-depois-hora">{a.hora}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{c?.nome}</div>
                    <div className="mt">
                      <span>{s?.nome}</span>
                      {poderes.verDeTodos && <span>{p?.nome.split(' ')[0]}</span>}
                    </div>
                  </div>
                  {/* Confirmado ou não é o que decide se vale mandar mensagem. */}
                  <span className={'rs-selo' + (a.status === 'confirmado' ? ' ok' : '')}>
                    {a.status === 'confirmado' ? 'Confirmado' : 'Pendente'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          {poderes.verDeTodos ? 'Como está o dia, por profissional' : 'Como está o meu dia'}
        </div>
        <GradeDoDia colunas={colunas} agendamentos={doDia}
                       clientes={clientes} servicos={servicos} staff={staff}
                       data={hoje} bloqueios={(dados.bloqueios || []).filter(b => b.data === hoje)}
                       arrasto={arrastar.arrasto} aoPegar={arrastar.aoPegar}
                       arrastado={agendamentos.find(x => x.id === arrastar.arrasto?.id) || null} />
      </div>

      {/* O mês é a pergunta de fim de dia, não a do balcão: fica recolhido,
          a um toque. Cada rótulo diz de quem é o número — para o dono é a
          empresa, para o funcionário é a produção dele. */}
      <MesRecolhido>
        <div className="stats" style={{ marginBottom: 18 }}>
          <Numero rotulo={dono('Faturamento do mês')} valor={mensal && brl(mensal.recebido)}
                  dica={meu ? 'O que você atendeu neste mês e já foi pago.'
                            : 'Tudo o que foi atendido e pago neste mês.'} />
          {/* Lucro é do dono: o servidor manda `null` para o funcionário. */}
          {poderes.verDeTodos && (
            <Numero rotulo={doFiltro ? `Lucro do mês · ${doFiltro.nome.split(' ')[0]}` : 'Lucro do mês'}
                    valor={mensal && brl(mensal.lucro)}
                    dica="O faturamento do mês menos a comissão de cada profissional." />
          )}
          {/* O total e, embaixo, de que ele é feito. Só "4" ao lado de um
              ranking que diz "1 atendimento" parecia número errado. */}
          <Numero rotulo="Atendimentos no mês" valor={mensal && mensal.agendados}
                  extra={mensal && <span className="rs-stat-sub">{partesDoMes(mensal)}</span>}
                  dica="Horários marcados neste mês, tirando os cancelados: os já feitos, os que ainda vão acontecer e as faltas." />
          <Numero rotulo="Ticket médio do mês" valor={mensal && brl(mensal.ticketMedio)}
                  dica="Quanto entrou, em média, por atendimento pago neste mês. Atendimento concluído e ainda em aberto não entra na conta." />
          <Numero rotulo="Faltas / cancelados no mês"
                  valor={mensal && `${mensal.faltas} / ${mensal.cancelados}`}
                  dica="Clientes que faltaram e horários cancelados neste mês." />
        </div>

        <GraficoMensal meses={serie}
                       titulo={meu ? 'Seu faturamento por mês'
                         : doFiltro ? `Lucro por mês · ${doFiltro.nome.split(' ')[0]}` : 'Lucro por mês'}
                       dica={meu ? 'O que você atendeu e foi pago em cada mês: o mês atual e os 11 anteriores.'
                                 : 'O faturamento de cada mês menos a comissão de cada profissional: o mês atual e os 11 anteriores.'} />

        <Ranking staff={staff} ranking={ranking} falhou={falhou} />

        {poderes.site && <FunilDoSite />}
      </MesRecolhido>

      {/* O mesmo rótulo flutuante da Agenda: onde vai cair, e por que não dá. */}
      {arrastar.arrasto?.hora && (
        <div className={'arrasto-aviso' + (arrastar.arrasto.ok ? '' : ' nao')}>
          {arrastar.arrasto.ok || arrastar.arrasto.igual
            ? arrastar.arrasto.hora
            : arrastar.arrasto.motivo}
        </div>
      )}

      {remarcando && (
        <Remarcar alvo={remarcando} clientes={clientes} servicos={servicos} staff={staff}
                  acao={acao} aoFechar={() => setRemarcando(null)} />
      )}
    </>
  );
}

const primeiroNome = n => (n || '').trim().split(/\s+/)[0] || '';

/**
 * O dia em uma linha: quanto já foi feito, quem é o próximo e quanto entrou.
 *
 * A barra é a única coisa da tela que responde sem ler número nenhum — é para
 * ela que se olha de passagem, entre um atendimento e outro.
 */
function Hoje({ total, concluidos, diario, pendencias }) {
  const feito = total ? Math.round(concluidos / total * 100) : 0;

  return (
    <div className="card rs-hoje">
      <div className="rs-hoje-topo">
        <div>
          <div className="eyebrow">Hoje</div>
          <p className="rs-hoje-conta">
            {total === 0
              ? 'Nenhum atendimento marcado para hoje.'
              : `${concluidos} de ${total} ${total === 1 ? 'atendimento' : 'atendimentos'} ${concluidos === 1 ? 'concluído' : 'concluídos'}`}
          </p>
        </div>
        {pendencias > 0 && (
          <span className="rs-pendencias">
            {pendencias} {pendencias === 1 ? 'aviso abaixo' : 'avisos abaixo'}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="rs-prog" role="img" aria-label={`${feito}% do dia concluído`}>
          <div className="rs-prog-feito" style={{ '--feito': feito / 100 }} />
        </div>
      )}

      <div className="rs-hoje-numeros">
        <div>
          <span className="eyebrow">Já recebido hoje</span>
          <b className="mono">{diario ? brl(diario.recebido) : <span className="rs-esperando">—</span>}</b>
        </div>
        <div>
          <span className="eyebrow">Previsto para hoje</span>
          <b className="mono">{diario ? brl(diario.previsto) : <span className="rs-esperando">—</span>}</b>
        </div>
      </div>
    </div>
  );
}

/**
 * A próxima cliente, e o passo dela ali mesmo.
 *
 * É o que se abre o painel para saber entre um atendimento e outro. Antes era
 * uma célula pequena ("14:00 · Maria") sem ação: confirmar ou dizer que ela
 * chegou pedia Menu → Agenda → tocar no bloco → gaveta. O botão é o mesmo da
 * gaveta (`FLUXO`), com o mesmo "Desfazer".
 */
function ProximaCliente({ proxima, naCadeira, clientes, servicos, staff, mostrarQuem, avancar, irPara }) {
  const nome = a => clientes.find(c => c.id === a.cliente)?.nome || 'Cliente';
  return (
    <div className="card rs-proxima">
      {naCadeira.map(a => (
        <div key={a.id} className="rs-cadeira">
          <span><i className="rs-cadeira-ponto" aria-hidden="true" />Na cadeira: <b>{primeiroNome(nome(a))}</b></span>
          <button className="btn btn-g btn-s" onClick={() => avancar(a.id, 'concluido')}>Concluir</button>
        </div>
      ))}
      {proxima ? (
        <>
          <div className="eyebrow">Próxima cliente</div>
          <div className="rs-proxima-corpo">
            <span className="mono rs-proxima-hora">{proxima.hora}</span>
            <div style={{ minWidth: 0 }}>
              <div className="rs-proxima-nome">{nome(proxima)}</div>
              <div className="rs-proxima-mt">
                {servicos.find(s => s.id === proxima.servico)?.nome}
                {mostrarQuem && <> · {staff.find(p => p.id === proxima.prof)?.nome.split(' ')[0]}</>}
                {' · '}<span className={'rs-selo' + (proxima.status === 'confirmado' ? ' ok' : '')}>
                  {FLUXO[proxima.status].rotulo}
                </span>
              </div>
            </div>
          </div>
          <div className="rs-proxima-acoes">
            <button className="btn btn-p" onClick={() => avancar(proxima.id, FLUXO[proxima.status].proximo)}>
              {FLUXO[proxima.status].acao}
            </button>
            {irPara && <button className="btn btn-g" onClick={() => irPara('agenda')}>Ver na agenda</button>}
          </div>
        </>
      ) : (
        <p className="rs-proxima-nada">Ninguém mais marcado para hoje.</p>
      )}
    </div>
  );
}

/**
 * A primeira tela de quem acabou de chegar.
 *
 * Empresa sem nenhum atendimento via cinco "R$ 0,00" e duas grades vazias —
 * a tela parecia quebrada, e não ensinava o passo seguinte. Aqui ficam os três
 * passos até o primeiro agendamento; somem sozinhos quando ele existir.
 */
function PrimeirosPassos({ irPara, aviso }) {
  const link = `${window.location.origin}/`;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); aviso?.('Link do site copiado'); }
    catch { aviso?.(`O link do seu site é ${link}`); }
  };
  const passos = [
    { icone: <Globe size={18} />, titulo: 'Confira o seu site', texto: 'É onde as clientes marcam sozinhas. Veja as fotos, os textos e os serviços.',
      botao: irPara && <button className="btn btn-g btn-s" onClick={() => irPara('site')}>Ajustar o site</button> },
    { icone: <Copy size={18} />, titulo: 'Mande o link para as clientes', texto: 'No status do WhatsApp, na bio do Instagram ou direto na conversa.',
      botao: <button className="btn btn-g btn-s" onClick={copiar}>Copiar o link</button> },
    { icone: <CalendarPlus size={18} />, titulo: 'Marque o primeiro horário', texto: 'Quem já é cliente e liga ou manda mensagem, você marca por aqui.',
      botao: irPara && <button className="btn btn-p btn-s" onClick={() => irPara('agenda', 'novo')}>Novo agendamento</button> },
  ];
  return (
    <div className="card rs-passos">
      <h3>Primeiros passos</h3>
      <ol>
        {passos.map(p => (
          <li key={p.titulo}>
            <span className="rs-passos-icone" aria-hidden="true">{p.icone}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{p.titulo}</b>
              <p>{p.texto}</p>
              {p.botao}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * O mês, recolhido. Aberto por padrão na tela larga, onde cabe; no celular,
 * a um toque. A escolha fica lembrada neste aparelho — é conveniência, e
 * falhar em lembrar não quebra nada.
 */
function MesRecolhido({ children }) {
  const [aberto, setAberto] = useState(() => {
    try {
      const salvo = localStorage.getItem('rs-mes-aberto');
      if (salvo != null) return salvo === '1';
    } catch { /* sem armazenamento: vale o padrão */ }
    return window.matchMedia?.('(min-width: 900px)').matches ?? false;
  });
  const alternar = () => setAberto(v => {
    try { localStorage.setItem('rs-mes-aberto', v ? '0' : '1'); } catch { /* idem */ }
    return !v;
  });
  return (
    <section className="rs-mes">
      <button type="button" className="rs-mes-cab" aria-expanded={aberto} onClick={alternar}>
        <span>O mês: faturamento, ranking e o site</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {aberto && <div className="rs-mes-corpo">{children}</div>}
    </section>
  );
}

/**
 * O que está esperando alguém fazer alguma coisa.
 *
 * Cada alerta é um botão que leva para a tela onde se resolve — avisar sem
 * dizer onde resolver só empurra o trabalho de volta para quem leu. Só aparece
 * o que existe: alerta que mostra zero é ruído com cara de aviso.
 */
function Atencao({ alertas }) {
  if (alertas.length === 0) {
    return (
      <div className="card rs-tudo-certo">
        <Check size={16} /> Nada pendente por aqui.
      </div>
    );
  }
  return (
    <div className="rs-alertas">
      {alertas.map(a => (
        <button key={a.k} type="button" className="card rs-alerta" onClick={a.ir}>
          <span className="rs-alerta-icone">{a.icone}</span>
          <span className="rs-alerta-texto">
            <b>{a.titulo}</b>
            <i>{a.detalhe}</i>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * As pendências, na ordem em que doem: cliente que não confirmou, dinheiro que
 * não entrou, aniversário que vem aí e mensagem parada na fila.
 *
 * Tudo sai do estado que a tela já tem. `irPara` pode não existir (a tela roda
 * fora do App em teste), e aí o alerta vira só informação.
 */
function pendencias({ agendamentos, clientes, hoje, doMeuRecorte, fila, poderes, irPara }) {
  const ir = (k, oQue) => (irPara ? () => irPara(k, oQue) : undefined);
  const lista = [];

  const semConfirmar = agendamentos.filter(a =>
    a.data >= hoje && a.status === 'agendado' && doMeuRecorte(a)).length;
  if (semConfirmar) {
    lista.push({
      k: 'confirmar', icone: <TriangleAlert size={15} />, ir: ir('agenda', 'lista'),
      titulo: `${semConfirmar} ${semConfirmar === 1 ? 'confirmação pendente' : 'confirmações pendentes'}`,
      detalhe: 'Clientes que ainda não responderam.',
    });
  }

  // Atendeu e não recebeu. Só até hoje (o de amanhã ainda não devia ter pago) e
  // só `aberto`: um estornado não é pagamento esperando, é dinheiro devolvido —
  // cobrar de novo seria constrangedor.
  //
  // Raro de propósito: o fechamento automático já marca como pago o que passou
  // da hora (ver `jobs/fechamento.js`). Sobra o caso de alguém ter mexido no
  // pagamento à mão, que é justamente quando vale avisar.
  const aCobrar = agendamentos.filter(a =>
    a.data <= hoje && a.status === 'concluido'
    && a.pagamento?.status === 'aberto' && doMeuRecorte(a)).length;
  if (aCobrar) {
    lista.push({
      k: 'cobrar', icone: <Wallet size={15} />, ir: ir('agenda', 'lista'),
      titulo: `${aCobrar} ${aCobrar === 1 ? 'pagamento pendente' : 'pagamentos pendentes'}`,
      detalhe: 'Atendimento feito e ainda não pago.',
    });
  }

  // Aniversário dos próximos sete dias, dia e mês — o ano não interessa.
  const aniversariantes = clientes.filter(c => c.nasc && emSeteDias(c.nasc, hoje)).length;
  if (aniversariantes && poderes.cadastros) {
    lista.push({
      k: 'aniversario', icone: <Cake size={15} />, ir: ir('clientes'),
      titulo: `${aniversariantes} ${aniversariantes === 1 ? 'aniversariante' : 'aniversariantes'} na semana`,
      detalhe: 'Boa hora para uma mensagem.',
    });
  }

  const naFila = fila?.itens.length || 0;
  if (naFila) {
    lista.push({
      k: 'fila', icone: <Send size={15} />, ir: ir('crm'),
      titulo: `${naFila} ${naFila === 1 ? 'mensagem' : 'mensagens'} na fila`,
      detalhe: 'Lembretes esperando para sair.',
    });
  }

  return lista;
}

/** O aniversário cai nos próximos sete dias? Compara só dia e mês. */
function emSeteDias(nasc, hoje) {
  const alvo = nasc.slice(5);
  const base = new Date(`${hoje}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    if (alvo === `${mm}-${dd}`) return true;
  }
  return false;
}

/**
 * Os quatro caminhos que se toma abrindo o painel. Levam para a tela onde a
 * coisa se faz, em vez de repetir o formulário aqui: um "novo agendamento" de
 * duas telas diferentes vira duas regras diferentes na primeira mudança.
 */
function AcoesRapidas({ irPara, poderes, naFila }) {
  if (!irPara) return null;
  const acoes = [
    { k: 'agenda', oQue: 'novo', icone: <Plus size={16} />, nome: 'Novo agendamento' },
    // Nada de "registrar pagamento": o fechamento automático já marca como pago
    // o que passou da hora (`jobs/fechamento.js`), então isso não é rotina — é
    // conserto, e conserto tem o caminho dele nas pendências. Fechar um horário,
    // sim, se faz toda semana.
    { k: 'bloqueios', oQue: { novo: true }, icone: <Ban size={16} />, nome: 'Bloquear horário' },
    ...(poderes.cadastros ? [{ k: 'clientes', icone: <User size={16} />, nome: 'Nova cliente' }] : []),
    { k: 'crm', icone: <Send size={16} />, nome: 'Enviar lembretes', badge: naFila },
  ];
  return (
    <div className="rs-acoes">
      {acoes.map(a => (
        <button key={a.nome} type="button" className="rs-acao" onClick={() => irPara(a.k, a.oQue)}>
          {a.icone}<span>{a.nome}</span>
          {a.badge > 0 && <i className="rs-acao-badge">{a.badge}</i>}
        </button>
      ))}
    </div>
  );
}

/**
 * Colunas, uma por mês, do mais antigo ao atual.
 *
 * Mede `lucro` para o dono e `recebido` para o funcionário (para quem o servidor
 * manda `lucro: null`). Lê o mês tocando ou passando o mouse: o valor aparece no
 * topo, e sem ninguém apontar mostra o mês atual. Nada de número em cima de
 * toda coluna — doze rótulos de dinheiro lado a lado no celular não se leem; o
 * eixo dá a ordem de grandeza e o topo dá o valor exato.
 *
 * Sem biblioteca de gráfico, de propósito: são doze retângulos, e o CSS do
 * bundle já dá conta.
 */
export function GraficoMensal({ meses, titulo, dica }) {
  const [sel, setSel] = useState(null);

  const valores = (meses || []).map(m => m.lucro ?? m.recebido);
  const teto = tetoDoEixo(Math.max(0, ...valores));
  const vazio = meses && valores.every(v => v <= 0);
  // Com menos de três meses de movimento, doze colunas são onze vazias e uma
  // barra: parece produto parado. Até lá, o número do mês fala sozinho.
  const poucos = meses && !vazio && valores.filter(v => v > 0).length < 3;
  const ativo = sel ?? (meses ? meses.length - 1 : 0);
  const [anoAtivo, mesAtivo] = meses ? meses[ativo].mes.split('-').map(Number) : [0, 0];

  return (
    <div className="card rs-relativo rs-grafico" onMouseLeave={() => setSel(null)}>
      <div className="rs-graf-topo">
        <div className="eyebrow">{titulo}</div>
        {meses && !vazio && (
          <div className="rs-graf-leitura" aria-live="polite">
            <span>{MESES[mesAtivo - 1]} {anoAtivo}</span>
            <b className="mono">{brl(valores[ativo])}</b>
          </div>
        )}
      </div>
      <Dica texto={dica} />

      {!meses && <p className="rs-vazio">Calculando…</p>}
      {vazio && <p className="rs-vazio">Ainda não há atendimentos pagos nestes meses.</p>}
      {poucos && (
        <p className="rs-vazio">
          A comparação mês a mês aparece quando houver três meses de movimento.
        </p>
      )}

      {meses && !vazio && !poucos && (
        <div className="rs-graf-corpo com-rotulos">
          <div className="rs-graf-eixo" aria-hidden="true">
            {[teto, teto / 2, 0].map(v => <span key={v}>{compacto(v)}</span>)}
          </div>
          <div className="rs-graf-plot">
            <div className="rs-graf-grade" aria-hidden="true"><i /><i /><i /></div>
            <div className="rs-graf-cols">
              {meses.map((m, i) => {
                const [ano, mm] = m.mes.split('-').map(Number);
                const v = valores[i];
                return (
                  <button key={m.mes} type="button" className="rs-col"
                          aria-pressed={i === ativo}
                          aria-label={`${MESES[mm - 1]} de ${ano}: ${brl(v)}`}
                          onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)}
                          onClick={() => setSel(i)}>
                    <span className="rs-col-area">
                      {/* O rótulo é irmão da barra e se posiciona na mesma
                          porcentagem: assim a barra continua batendo com o
                          eixo, em vez de encolher para abrir espaço. */}
                      {v > 0 && (
                        <span className="rs-col-valor" style={{ bottom: `${Math.max(v / teto * 100, 1.5)}%` }}>
                          {rotuloDeValor(v)}
                        </span>
                      )}
                      <span className="rs-barra"
                            style={{ height: v > 0 ? `${Math.max(v / teto * 100, 1.5)}%` : 0 }} />
                    </span>
                    <span className="rs-col-mes" aria-hidden="true">
                      <span className="rs-mes-cheio">{MESES[mm - 1]}</span>
                      <span className="rs-mes-inicial">{MESES[mm - 1][0]}</span>
                    </span>
                    <span className="rs-col-ano">{i === 0 || mm === 1 ? String(ano).slice(2) : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Onde as visitas do site desistem, nos últimos 30 dias.
 *
 * É do dono: ele é quem pode mexer no site, e o número que diria "você perde
 * 70% na abertura do agendamento" ficava só no back-office da Vital. A conta
 * vem pronta do servidor (`comTaxas`, em lib/funil.js) — a tela não divide.
 */
function FunilDoSite() {
  const [funil, setFunil] = useState(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    api.funil(30).then(x => { if (vivo) setFunil(x); }).catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, []);

  const passos = funil?.passos || [];
  const vazio = funil && !passos[0]?.total;
  const queda = funil?.maiorQueda;
  return (
    <div className="card rs-relativo rs-funil">
      <div className="eyebrow" style={{ marginBottom: 14 }}>Seu site · últimos 30 dias</div>
      <Dica texto="Quantas visitas chegaram a cada passo do agendamento pelo site. Cada visita conta uma vez por passo; ninguém é identificado." />
      {falhou && <p className="rs-vazio">Não deu para carregar.</p>}
      {!falhou && !funil && <p className="rs-vazio">Calculando…</p>}
      {vazio && <p className="rs-vazio">Ainda não houve visita ao site nestes 30 dias.</p>}
      {funil && !vazio && (
        <>
          <ol className="rs-funil-passos">
            {passos.map(p => (
              <li key={p.chave}>
                <span className="rs-funil-rotulo">{p.rotulo}</span>
                <span className="rs-funil-trilho" aria-hidden="true">
                  <i style={{ width: `${p.doTopo ?? 0}%` }} />
                </span>
                <b className="mono">{p.total}</b>
              </li>
            ))}
          </ol>
          {queda && (
            <p className="rs-funil-queda">
              A maior perda é entre “{queda.de}” e “{queda.para}”:{' '}
              <b>{queda.perdidos} {queda.perdidos === 1 ? 'visita' : 'visitas'}</b>.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const rotuloAtendimentos = n => `${n} atendimento${n === 1 ? '' : 's'}`;

/**
 * O dono vê o ranking pelo que cada um produziu: com o valor ao lado, quem
 * faturou mais aparecendo em 2º parecia erro. O servidor ordena por
 * atendimentos de propósito — é a ordem do funcionário, que não recebe valor e
 * não pode deduzir o faturamento dos colegas por ela (ver `/ranking`).
 */
const ordenado = linhas => (linhas.some(l => l.producao != null)
  ? [...linhas].sort((a, b) => (b.producao || 0) - (a.producao || 0) || b.qtd - a.qtd)
  : linhas);

/** "1 feito · 3 marcados · 1 faltou" — só as partes que existem. */
function partesDoMes({ agendados = 0, atendimentos = 0, faltas = 0 }) {
  const marcados = Math.max(agendados - atendimentos - faltas, 0);
  return [
    `${atendimentos} ${atendimentos === 1 ? 'feito' : 'feitos'}`,
    marcados > 0 && `${marcados} ${marcados === 1 ? 'marcado' : 'marcados'}`,
    faltas > 0 && `${faltas} ${faltas === 1 ? 'faltou' : 'faltaram'}`,
  ].filter(Boolean).join(' · ');
}

/**
 * Quem mais atendeu no mês. A equipe toda vê o ranking, mas só o dono vê o valor
 * de cada um: para o funcionário o servidor nem manda `producao`, então não
 * depende desta tela esconder nada.
 */
function Ranking({ staff, ranking, falhou }) {
  return (
    <div className="card rs-relativo" style={{ padding: 18 }}>
      <div className="eyebrow">
        <Trophy size={13} style={{ verticalAlign: -2 }} /> Ranking do mês
      </div>
      <p className="rs-stat-sub" style={{ margin: '2px 0 12px' }}>
        {ranking?.some(l => l.producao != null) ? 'Pelo que cada um produziu no mês' : 'Pelos atendimentos já feitos'}
      </p>
      <Dica texto="Quem mais fez atendimentos neste mês. Só contam os concluídos." />
      {falhou && !ranking && <p className="rs-vazio">Não deu para carregar.</p>}
      {!falhou && !ranking && <p className="rs-vazio">Calculando…</p>}
      {ranking && ranking.length === 0 && (
        <p className="rs-vazio">Nenhum atendimento concluído este mês ainda.</p>
      )}
      {ranking && ordenado(ranking).map((linha, i) => {
        const p = staff.find(x => x.id === linha.id);
        return (
          <div key={linha.id} className="li" style={{ padding: '9px 0' }}>
            <span className="mono rs-pos">{i + 1}º</span>
            <div className="avatar rs-av-pq" style={{ background: p?.cor || '#999' }}>
              {iniciais(linha.nome)}
            </div>
            <div style={{ flex: 1, fontSize: 13.5 }}>{linha.nome.split(' ')[0]}
              {linha.producao != null && <span style={{ color: 'var(--muted)' }}> · {rotuloAtendimentos(linha.qtd)}</span>}
            </div>
            {linha.producao != null
              ? <b className="mono" style={{ fontSize: 13.5 }}>{brl(linha.producao)}</b>
              : <b className="mono" style={{ fontSize: 13.5 }}>{rotuloAtendimentos(linha.qtd)}</b>}
          </div>
        );
      })}
    </div>
  );
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];
const MES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Abreviado — é o eixo do gráfico, onde doze nomes inteiros não cabem. */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const doDiaPorExtenso = iso => {
  const d = new Date(iso + 'T12:00:00');
  const dia = DIAS[d.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)}, ${d.getDate()} de ${MES_EXT[d.getMonth()]}`;
};
