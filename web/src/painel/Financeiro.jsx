import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import { hojeISO, iniciais } from '../shared/tempo.js';
import {
  FILTROS, degrauDe, deslocar, estadoInicial, intervaloDe, intervaloPorExtenso, podeAvancar, tituloDe,
} from '../shared/periodo.js';
import { compacto, rotuloDeValor, tetoDoEixo } from '../shared/graficos.js';
import SeletorProfissional from './Seletor.jsx';
import IntervaloDatas from './IntervaloDatas.jsx';
import { Numero } from './Cartoes.jsx';

/**
 * Financeiro: quanto entrou, quanto saiu e quanto sobrou, no período que a
 * pessoa escolher com o menor número de toques possível.
 *
 * O período são cinco chips (Hoje, Semana, Mês, Ano, Personalizado) e duas setas
 * que andam de um período para o outro. Todos são recortes do calendário, não
 * janelas deslizantes: "Semana" é a semana em que se está, domingo a sábado, e
 * não os últimos sete dias — a mecânica está em
 * `shared/periodo.js`, fora do React, porque é onde mora o erro que só aparece
 * na virada do ano. Personalizado abre um calendário de intervalo.
 *
 * **Custos são as comissões**, e só elas: o sistema não tem cadastro de despesa
 * (aluguel, produto, conta de luz). O Lucro, portanto, é receita menos
 * comissões — o cartão diz isso no "!" para ninguém tomar por lucro contábil.
 *
 * Os números vêm do servidor (`/relatorios/resumo` e `/serie`), recortados por
 * `escopoDe`: funcionário vê só o dele, e no lugar de "custos" vê a própria
 * comissão. Esconder cartão na tela não é o controle — a rota recusa.
 */
export default function Financeiro({ dados, poderes }) {
  const { staff } = dados;
  const hoje = hojeISO();
  const meu = !poderes.verDeTodos;

  const [estado, setEstado] = useState(() => estadoInicial('mes', hoje));
  const [escolhendo, setEscolhendo] = useState(false);
  // Quem o dono está olhando. '' é a empresa inteira. O servidor ignora este
  // parâmetro para funcionário — esconder o seletor é conveniência.
  const [quem, setQuem] = useState('');
  const [r, setR] = useState(null);
  const [serie, setSerie] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);

  const { de, ate } = intervaloDe(estado, hoje);
  const por = degrauDe(estado, hoje);

  // Cada troca de período busca de novo, mas a tela NÃO volta para "Calculando…":
  // os números antigos ficam, esmaecidos, até os novos chegarem. Piscar a tela
  // toda a cada toque numa seta faria o "mínimo de cliques" parecer lento.
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setFalhou(false);
    const profissionalId = quem || undefined;
    Promise.all([
      api.resumo({ de, ate, profissionalId }),
      api.serie({ de, ate, por, profissionalId }),
    ])
      // A série vem junto do degrau a que pertence. Guardar só os pontos deixava
      // a tela desenhar os antigos com o degrau novo — trocar de "Hoje" para
      // "Ano" lia '08' (hora) como se fosse um mês, e o gráfico quebrava.
      .then(([resumo, s]) => { if (vivo) { setR(resumo); setSerie({ por: s.por, pontos: s.pontos }); setCarregando(false); } })
      // Falha precisa parecer falha: caindo em "null", sessão expirada virava um
      // "Calculando…" eterno, sem nada no console.
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [de, ate, por, quem]);

  const escolherFiltro = k => {
    if (k === 'custom') { setEscolhendo(true); return; }
    setEscolhendo(false);
    setEstado(estadoInicial(k, hoje));
  };

  const filtroAtivo = escolhendo ? 'custom' : estado.filtro;
  const doFiltro = quem && staff.find(p => p.id === quem);
  const de1 = doFiltro ? ` · ${doFiltro.nome.split(' ')[0]}` : '';

  if (falhou) {
    return (
      <div className="rs-falha" style={{ margin: 24 }}>
        Não deu para carregar os números deste período. Se você ficou muito tempo
        com a tela aberta, a sessão pode ter expirado — recarregue a página.
      </div>
    );
  }

  return (
    <>
      <div className="fin-topo">
        <div className="fin-head">
          <h2>Financeiro</h2>
          <div className="fin-seg" role="group" aria-label="Período">
            {FILTROS.map(f => (
              <button key={f.k} type="button" className={filtroAtivo === f.k ? 'on' : ''}
                      aria-pressed={filtroAtivo === f.k} onClick={() => escolherFiltro(f.k)}>
                {f.k === 'custom' && <CalendarDays size={14} />}{f.rotulo}
              </button>
            ))}
          </div>
        </div>

        {escolhendo && (
          <IntervaloDatas de={estado.filtro === 'custom' ? de : null} ate={estado.filtro === 'custom' ? ate : null}
                          hoje={hoje} aoFechar={() => setEscolhendo(false)}
                          aoAplicar={c => {
                            setEstado({ filtro: 'custom', ancora: hoje, custom: c });
                            setEscolhendo(false);
                          }} />
        )}
      </div>

      <div className="fin-periodo">
        <div className="fin-nav">
          <button type="button" className="fin-seta" aria-label="Período anterior"
                  disabled={estado.filtro === 'custom'}
                  onClick={() => setEstado(e => deslocar(e, -1, hoje))}>
            <ChevronLeft size={18} />
          </button>
          <div className="fin-titulo" aria-live="polite">
            <b>{tituloDe(estado, hoje)}</b>
            <span>{intervaloPorExtenso(de, ate, hoje)}</span>
          </div>
          <button type="button" className="fin-seta" aria-label="Próximo período"
                  disabled={!podeAvancar(estado, hoje)}
                  onClick={() => setEstado(e => deslocar(e, +1, hoje))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <SeletorProfissional staff={staff} valor={quem} aoMudar={setQuem}
                             podeVerTodos={poderes.verDeTodos} rotuloTodos="A empresa toda" />
      </div>

      <div className="fin-corpo" aria-busy={carregando}>
        {/* Quatro números, na ordem em que a pergunta se faz: o que entrou, o que
            sobrou, o que ainda vem, e quanto rende cada atendimento. */}
        <div className="fin-cards">
          <Numero rotulo={meu ? 'Sua receita' : `Receita${de1}`} valor={r && brl(r.recebido)}
                  dica={meu ? 'O que você atendeu neste período e já foi pago.'
                            : 'Tudo o que foi atendido e já foi pago neste período.'}
                  extra={r && <Variacao de={r.anterior.recebido} para={r.recebido} />} />
          {meu
            ? <Numero rotulo="Sua comissão" valor={r && brl(r.custos)}
                      dica="A sua parte sobre o que foi pago, pela sua porcentagem de comissão." />
            : <Numero rotulo={`Lucro${de1}`} valor={r && brl(r.lucro)}
                      dica="Receita menos as comissões da equipe: o que sobra para a empresa. Outras despesas (aluguel, produtos) ainda não são registradas no sistema." />}
          <Numero rotulo="A receber" valor={r && brl(r.aReceberNoPeriodo)}
                  dica="O que os atendimentos deste período ainda devem render: os que estão marcados e os que já foram atendidos sem pagar. Falta e cancelamento ficam de fora."
                  extra={r && r.aReceber > 0 && (
                    <span className="fin-atraso">{brl(r.aReceber)} em atraso, até hoje</span>
                  )} />
          <Numero rotulo="Ticket médio" valor={r && brl(r.ticketMedio)}
                  dica="Quanto rendeu cada atendimento concluído, em média, neste período." />
        </div>

        <GraficoFinanceiro pontos={serie?.por === por ? serie.pontos : null} por={por} comLucro={!meu} />

        {r && <Detalhes r={r} staff={staff} meu={meu} />}
      </div>
    </>
  );
}

/** Quanto subiu ou desceu em relação ao período anterior de mesmo tamanho. */
const Variacao = ({ de, para }) => {
  // Sem base de comparação não há porcentagem que signifique alguma coisa —
  // "cresceu infinito" a partir de zero é ruído, não informação.
  if (!de) return null;
  const pct = Math.round((para - de) / de * 100);
  const tom = pct > 0 ? 'sobe' : pct < 0 ? 'desce' : 'igual';
  return (
    <span className={'variacao ' + tom}>
      {pct > 0 ? '↑' : pct < 0 ? '↓' : '='} {Math.abs(pct)}% vs. período anterior
    </span>
  );
};

const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const data12 = chave => new Date(`${chave}T12:00:00`);

/** O nome de uma coluna por extenso, para a leitura do topo e para leitor de tela. */
function rotuloCheio(chave, por) {
  if (por === 'hora') return `${Number(chave)}h`;
  if (por === 'mes') { const [a, m] = chave.split('-'); return `${MESES_ABREV[m - 1]} ${a}`; }
  const d = data12(chave);
  return `${DIAS_ABREV[d.getDay()]}, ${d.getDate()} de ${MESES_ABREV[d.getMonth()]}`;
}

/** O nome de uma coluna debaixo dela, curto. Poucas colunas mostram todos; muitas, um sim outro não. */
function rotuloDoEixo(chave, por, i, n) {
  const passo = n <= 14 ? 1 : Math.ceil(n / 8);
  if (i % passo !== 0) return { cheio: '', inicial: '', sub: '' };
  if (por === 'hora') return { cheio: String(Number(chave)), inicial: String(Number(chave)), sub: '' };
  if (por === 'mes') {
    const [a, m] = chave.split('-').map(Number);
    return { cheio: MESES_ABREV[m - 1], inicial: MESES_ABREV[m - 1][0], sub: i === 0 || m === 1 ? String(a).slice(2) : '' };
  }
  const d = data12(chave);
  // Uma semana cabe com o dia da semana; um mês, só com o número do dia.
  return n <= 8
    ? { cheio: DIAS_ABREV[d.getDay()], inicial: DIAS_ABREV[d.getDay()][0], sub: String(d.getDate()) }
    : { cheio: String(d.getDate()), inicial: String(d.getDate()), sub: '' };
}

/**
 * Colunas do período, no degrau que a tela pediu (hora, dia ou mês).
 *
 * Cada coluna é a receita do degrau; para o dono, ela se parte em lucro (embaixo)
 * e custos (em cima), um tom claro e um escuro do mesmo vinho — o total é a
 * receita, e o olho vê de uma vez quanto dela fica. O funcionário não tem
 * "lucro", então a coluna dele é inteira de um tom só.
 *
 * O valor exato aparece no topo ao tocar (ou passar o mouse) numa coluna, e não
 * em cima de cada uma: trinta números de dinheiro lado a lado não se leem.
 */
function GraficoFinanceiro({ pontos, por, comLucro }) {
  const [sel, setSel] = useState(null);

  const n = pontos ? pontos.length : 0;
  const teto = tetoDoEixo(Math.max(0, ...(pontos || []).map(p => p.receita)));
  const vazio = pontos && pontos.every(p => p.receita <= 0);
  const escolhido = sel != null && pontos?.[sel] ? pontos[sel] : null;

  const titulo = { hora: 'Receita por hora', dia: 'Receita por dia', mes: 'Receita por mês' }[por];
  // O que decide se o valor cabe em cima da coluna são as colunas COM VALOR, não
  // o total delas: um mês de trinta dias em que se vendeu em cinco tem cinco
  // números para escrever, com folga. Num mês de venda quase todo dia eles se
  // encavalariam — aí o valor continua a um toque, na leitura do topo.
  const comValor = (pontos || []).filter(p => p.receita > 0).length;
  const comRotulos = comValor > 0 && comValor <= 12;

  return (
    <div className="card fin-grafico" onMouseLeave={() => setSel(null)}>
      <div className="rs-graf-topo">
        <div className="eyebrow">{titulo}</div>
        <div className="rs-graf-leitura" aria-live="polite">
          {escolhido ? (
            <>
              <span>{rotuloCheio(escolhido.chave, por)}</span>
              <b className="mono">{brl(escolhido.receita)}</b>
              {comLucro && (
                <span className="fin-leitura-parte">
                  custos {brl(escolhido.custos)} · lucro {brl(escolhido.lucro)}
                </span>
              )}
            </>
          ) : (
            <span>Toque numa coluna para ver o valor</span>
          )}
        </div>
      </div>

      {!pontos && <p className="rs-vazio">Calculando…</p>}
      {vazio && <p className="rs-vazio">Nada recebido neste período.</p>}

      {pontos && !vazio && (
        <>
          <div className={'rs-graf-corpo' + (comRotulos ? ' com-rotulos' : '')
            + (comRotulos && n > 14 ? ' rotulos-apertados' : '')}>
            <div className="rs-graf-eixo" aria-hidden="true">
              {[teto, teto / 2, 0].map(v => <span key={v}>{compacto(v)}</span>)}
            </div>
            <div className="rs-graf-plot">
              <div className="rs-graf-grade" aria-hidden="true"><i /><i /><i /></div>
              <div className="rs-graf-cols" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gap: n > 31 ? 1 : 2 }}>
                {pontos.map((p, i) => {
                  const eixo = rotuloDoEixo(p.chave, por, i, n);
                  const lucro = Math.max(0, p.lucro ?? p.receita);
                  const custos = Math.max(0, p.receita - lucro);
                  return (
                    <button key={p.chave} type="button" className="rs-col"
                            aria-pressed={i === sel}
                            aria-label={`${rotuloCheio(p.chave, por)}: ${brl(p.receita)}`}
                            onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)}
                            onClick={() => setSel(i)}>
                      <span className="rs-col-area">
                        {/* O rótulo é irmão da barra e se posiciona na mesma
                            porcentagem: assim a barra continua batendo com o
                            eixo, em vez de encolher para abrir espaço. */}
                        {comRotulos && p.receita > 0 && (
                          <span className="rs-col-valor" style={{ bottom: `${Math.max(p.receita / teto * 100, 1.5)}%` }}>
                            {rotuloDeValor(p.receita)}
                          </span>
                        )}
                        {p.receita > 0 && (
                          <span className="fin-barra" style={{ height: `${Math.max(p.receita / teto * 100, 1.5)}%` }}>
                            {custos > 0 && <span className="fin-custos" style={{ flex: custos }} />}
                            <span className="fin-lucro" style={{ flex: lucro }} />
                          </span>
                        )}
                      </span>
                      <span className="rs-col-mes" aria-hidden="true">
                        <span className="rs-mes-cheio">{eixo.cheio}</span>
                        <span className="rs-mes-inicial">{eixo.inicial}</span>
                      </span>
                      <span className="rs-col-ano">{eixo.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {comLucro && (
            <div className="fin-legenda" aria-hidden="true">
              <span><i className="fin-lucro" /> Lucro</span>
              <span><i className="fin-custos" /> Custos</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Uma porcentagem pequena, ao lado do valor. Sem base, não há porcentagem. */
function pct(v, total) {
  if (!total || !v) return null;
  const p = v / total * 100;
  return p < 1 ? '<1%' : `${Math.round(p)}%`;
}

/**
 * O quadro do período, depois dos quatro números e do gráfico: o que mais rende,
 * quanto sai de comissão, quanto se perde em falta — e, embaixo, como o dinheiro
 * entrou e quem produziu.
 *
 * As porcentagens são pequenas de propósito: o valor é a resposta, a
 * porcentagem é o tamanho dela dentro do todo.
 */
function Detalhes({ r, staff, meu }) {
  const formas = r.porForma.filter(f => f.total > 0);
  const producaoPor = Object.fromEntries(r.porProfissional.map(p => [p.id, p.producao]));
  const max = r.porServico[0]?.total || 1;
  // Tudo o que foi marcado no período, cancelado incluído: é a base que faz
  // "10% faltaram" querer dizer alguma coisa.
  const marcados = r.agendados + r.cancelados;
  // A produção é maior que o recebido quando alguém atendeu e ainda não pagou.
  const produzido = r.porProfissional.reduce((s, p) => s + (p.producao || 0), 0);

  return (
    <>
      <div className="fin-quadros">
        <div className="card fin-quadro">
          <div className="eyebrow">Serviços mais lucrativos</div>
          {/* A lista rola dentro do cartão em vez de esticá-lo: uma empresa com
              quarenta serviços empurraria o resto da tela para baixo, e a
              coluna do lado ficaria com um vão do tamanho de uma página. */}
          <div className="fin-servicos">
          {r.porServico.map(s => (
            <div key={s.nome} className="fin-servico">
              <div className="fin-servico-linha">
                <span>{s.nome}</span>
                <span>
                  <b className="mono">{brl(s.total)}</b>
                  <i className="fin-pct">{pct(s.total, r.recebido)}</i>
                </span>
              </div>
              <div className="fin-trilho">
                <div className="fin-preenche" style={{ width: `${s.total / max * 100}%` }} />
              </div>
            </div>
          ))}
          </div>
          {r.porServico.length === 0 && <p className="rs-vazio">Sem atendimentos concluídos neste período.</p>}
        </div>

        {/* Os dois empilhados numa coluna só: sozinhos, ao lado de uma lista de
            seis serviços, ficavam dois cartões baixos com um vão enorme embaixo.
            Juntos, acompanham a altura da lista. */}
        <div className="fin-pilha">
          {/* Para o funcionário a comissão já é um dos quatro números lá em cima —
              repeti-la aqui seria o mesmo número duas vezes na mesma tela. */}
          {!meu && (
            <div className="card fin-quadro">
              <div className="eyebrow">Comissão</div>
              <b className="fin-grande mono">{brl(r.custos)}</b>
              <span className="fin-sub">
                <i className="fin-pct">{pct(r.custos, r.recebido) || '0%'}</i> da receita
              </span>
              <p className="fin-nota">O que sai para a equipe sobre o que já foi pago.</p>
            </div>
          )}

          <div className="card fin-quadro">
            <div className="eyebrow">Faltas</div>
            <b className="fin-grande mono">{r.faltas}</b>
            <span className="fin-sub">
              <i className="fin-pct">{pct(r.faltas, marcados) || '0%'}</i> dos agendamentos
            </span>
            <p className="fin-nota">
              {r.cancelados} cancelado{r.cancelados === 1 ? '' : 's'}
              {pct(r.cancelados, marcados) && <i className="fin-pct"> {pct(r.cancelados, marcados)}</i>}
            </p>
          </div>
        </div>
      </div>

      <div className="fin-quadros fin-quadros-2">
        <div className="card fin-quadro">
          <div className="eyebrow">Pagamentos</div>
          {formas.map(f => (
            <div key={f.forma} className="fin-linha">
              <span style={{ textTransform: 'capitalize' }}>{f.forma}</span>
              <span>
                <b className="mono">{brl(f.total)}</b>
                <i className="fin-pct">{pct(f.total, r.recebido)}</i>
              </span>
            </div>
          ))}
          {formas.length === 0 && <p className="rs-vazio">Nenhum pagamento registrado.</p>}
        </div>

        <div className="card fin-quadro">
          <div className="eyebrow">Profissionais</div>
          {/* `r.profissionalId` é quem está no recorte, seja por escolha do dono
              ou por papel. Listar a equipe inteira mostrava a colega com
              "produziu R$ 0,00" para quem não pode ver a produção dela — e zero
              não é "não sei", é uma afirmação falsa. */}
          {staff.filter(p => !r.profissionalId || p.id === r.profissionalId).map(p => {
            const prod = producaoPor[p.id] || 0;
            return (
              <div key={p.id} className="fin-linha">
                <span className="fin-pessoa">
                  <span className="avatar rs-av-pq" style={{ background: p.cor }}>{iniciais(p.nome)}</span>
                  {p.nome.split(' ')[0]}
                  <i className="fin-pct">{pct(prod, produzido)}</i>
                </span>
                <span>
                  <b className="mono">{brl(prod)}</b>
                  <i className="fin-pct">{p.comissao}% · {brl(prod * p.comissao / 100)}</i>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
