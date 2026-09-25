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
        <div className="fin-cards">
          {meu ? (
            <>
              <Numero rotulo="Sua receita" valor={r && brl(r.recebido)}
                      dica="O que você atendeu neste período e já foi pago."
                      extra={r && <Variacao de={r.anterior.recebido} para={r.recebido} />} />
              <Numero rotulo="Sua comissão" valor={r && brl(r.custos)}
                      dica="A sua parte sobre o que foi pago, pela sua porcentagem de comissão." />
            </>
          ) : (
            <>
              <Numero rotulo={`Receita${de1}`} valor={r && brl(r.recebido)}
                      dica="Tudo o que foi atendido e já foi pago neste período."
                      extra={r && <Variacao de={r.anterior.recebido} para={r.recebido} />} />
              <Numero rotulo={`Custos${de1}`} valor={r && brl(r.custos)}
                      dica="O que sai para pagar as comissões da equipe. Outras despesas (aluguel, produtos) ainda não são registradas no sistema." />
              <Numero rotulo={`Lucro${de1}`} valor={r && brl(r.lucro)}
                      dica="Receita menos custos: o que sobra para a empresa depois de pagar as comissões." />
            </>
          )}
        </div>

        <GraficoFinanceiro pontos={serie?.por === por ? serie.pontos : null} por={por} comLucro={!meu} />

        {r && <Detalhes r={r} staff={staff} />}
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
  // O valor em cima de cada coluna só cabe enquanto são poucas: com trinta dias
  // ou doze horas os números se encavalam e nenhum se lê. Acima disso, o valor
  // continua a um toque, na leitura do topo.
  const comRotulos = n <= 12;

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
          <div className={'rs-graf-corpo' + (comRotulos ? ' com-rotulos' : '')}>
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

/**
 * O que ficou de fora dos três cartões e ainda faz falta: dinheiro em aberto, o
 * que se espera receber, e o quadro por serviço, por pessoa e por forma de
 * pagamento.
 */
function Detalhes({ r, staff }) {
  const rank = r.porServico.map(s => [s.nome, s.total]);
  const max = rank[0]?.[1] || 1;
  const formas = Object.fromEntries(r.porForma.map(f => [f.forma, f.total]));
  const producaoPor = Object.fromEntries(r.porProfissional.map(p => [p.id, p.producao]));

  return (
    <>
      <div className="fin-miudos">
        {/* Este continua ancorado em hoje de propósito — é a dívida em aberto
            acumulada, não algo que o período recorte. O rótulo diz isso. */}
        <div className="fin-miudo">
          <span className="eyebrow">A receber, até hoje</span>
          <b className="mono" style={{ color: r.aReceber > 0 ? 'var(--warn)' : 'inherit' }}>{brl(r.aReceber)}</b>
        </div>
        {/* Do período, não de hoje: previsto hoje ao lado de recebido na semana
            passada eram dois recortes diferentes no mesmo cartão. */}
        <div className="fin-miudo"><span className="eyebrow">Previsto</span><b className="mono">{brl(r.previsto)}</b></div>
        <div className="fin-miudo"><span className="eyebrow">Ticket médio</span><b className="mono">{brl(r.ticketMedio)}</b></div>
        <div className="fin-miudo"><span className="eyebrow">Faltas</span><b className="mono">{r.faltas}</b></div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>O que mais dá dinheiro</div>
          {rank.map(([nome, v]) => (
            <div key={nome} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>{nome}</span><span className="mono" style={{ fontWeight: 600 }}>{brl(v)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--line)', borderRadius: 6 }}>
                <div style={{ height: 6, width: `${v / max * 100}%`, background: 'var(--lacquer)', borderRadius: 6 }} />
              </div>
            </div>
          ))}
          {rank.length === 0 && <p className="rs-vazio">Sem atendimentos concluídos neste período.</p>}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Comissões do período</div>
          {/* `r.profissionalId` é quem está no recorte, seja por escolha do dono
              ou por papel. Listar a equipe inteira mostrava a colega com
              "produziu R$ 0,00" para quem não pode ver a produção dela — e zero
              não é "não sei", é uma afirmação falsa. */}
          {staff.filter(p => !r.profissionalId || p.id === r.profissionalId).map(p => {
            const prod = producaoPor[p.id] || 0;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="avatar" style={{ background: p.cor, width: 30, height: 30, fontSize: 11 }}>{iniciais(p.nome)}</div>
                <div style={{ flex: 1, fontSize: 13.5 }}>{p.nome.split(' ')[0]}
                  <span style={{ color: 'var(--muted)' }}> · produziu {brl(prod)}</span></div>
                <b className="mono" style={{ fontSize: 13.5 }}>{brl(prod * p.comissao / 100)}</b>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Como entrou</div>
          {Object.entries(formas).map(([f, v]) => (
            <div key={f} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
              <span style={{ textTransform: 'capitalize' }}>{f}</span><b className="mono">{brl(v)}</b>
            </div>
          ))}
          {Object.keys(formas).length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum pagamento registrado.</p>}
        </div>
      </div>
    </>
  );
}
