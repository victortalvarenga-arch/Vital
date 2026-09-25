import { useEffect, useState } from 'react';
import { Clock, Trophy } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import SeletorProfissional from './Seletor.jsx';
import { brl } from '../shared/formato.js';
import { Dica, Numero } from './Cartoes.jsx';
import { compacto, rotuloDeValor, tetoDoEixo } from '../shared/graficos.js';
import { emFaixas, faixaDeHoras, hojeISO, iniciais, toMin } from '../shared/tempo.js';

/**
 * Resumo: a tela que abre primeiro no painel.
 *
 * Duas perguntas, cada uma no seu tamanho: **como está o negócio** (faturamento
 * do mês e do ano, lucro, ticket médio, ranking do mês) e **como está o meu dia**
 * (próximos atendimentos e a grade de baixo). Sem seletor de período, de
 * propósito — mês fechado, semana e comparação com o período anterior são a
 * pergunta do Financeiro, e duas telas respondendo a mesma coisa é o começo de
 * duas respostas diferentes.
 *
 * Os números vêm de `/api/relatorios/resumo` e `/ranking`, a mesma fonte do
 * Financeiro, em vez de somados aqui a partir de `dados.agendamentos`: o estado
 * só traz 120 dias para trás (o ano não cabe nele), e a conta de "recebido",
 * "lucro" e "ticket médio" já existe no servidor, recortada por `escopoDe` —
 * refazê-la no navegador seria a segunda versão da mesma regra, livre para
 * divergir.
 *
 * Nada aqui é editável. É a versão de relance da Agenda, não uma segunda
 * forma de mexer nela.
 */
export default function Resumo({ dados, poderes }) {
  const { staff, clientes, servicos, agendamentos } = dados;
  const hoje = hojeISO();

  // Quem o dono está olhando. '' é a empresa inteira. O funcionário não tem
  // essa escolha — e o servidor ignora o parâmetro para ele de qualquer jeito,
  // então esconder o seletor é conveniência, não controle de acesso.
  const [quem, setQuem] = useState('');
  const [mensal, setMensal] = useState(null);
  const [anual, setAnual] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [serie, setSerie] = useState(null);
  const [falhou, setFalhou] = useState(false);

  const mes = hoje.slice(0, 7);
  const ano = hoje.slice(0, 4);

  useEffect(() => {
    let vivo = true;
    setMensal(null);
    setAnual(null);
    setFalhou(false);
    const filtro = { profissionalId: quem || undefined };
    // Falha precisa parecer falha. Antes isto caía em `null`, que é o mesmo
    // estado de "carregando" — sessão expirada virava um "Calculando…" eterno,
    // sem nada no console.
    const falha = () => { if (vivo) setFalhou(true); };
    api.resumo({ mes, ...filtro }).then(x => { if (vivo) setMensal(x); }).catch(falha);
    api.resumo({ de: `${ano}-01-01`, ate: `${ano}-12-31`, ...filtro })
      .then(x => { if (vivo) setAnual(x); }).catch(falha);
    return () => { vivo = false; };
  }, [mes, ano, quem]);

  // Os 12 meses do gráfico. Acompanham o filtro de pessoa, como os cartões.
  useEffect(() => {
    let vivo = true;
    setSerie(null);
    api.mensal({ profissionalId: quem || undefined })
      .then(x => { if (vivo) setSerie(x.meses); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [quem]);

  // O ranking é da equipe toda, então não muda com o filtro de pessoa: o
  // ranking de uma pessoa só não seria ranking.
  useEffect(() => {
    let vivo = true;
    api.ranking({ mes })
      .then(x => { if (vivo) setRanking(x.ranking); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [mes]);

  const doDia = agendamentos
    .filter(a => a.data === hoje && a.status !== 'cancelado')
    .filter(a => !quem || a.prof === quem);

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

  // Rótulo honesto: "Recebido" sozinho, filtrado numa pessoa, faria o dono ler
  // o número dela como o da empresa.
  const doFiltro = quem && staff.find(p => p.id === quem);
  const meu = !poderes.verDeTodos;
  const dono = rotulo => (meu ? `Seu ${rotulo.toLowerCase()}`
    : doFiltro ? `${rotulo} · ${doFiltro.nome.split(' ')[0]}` : rotulo);

  return (
    <>
      <div className="head">
        <div>
          <h2>Resumo</h2>
          <div className="sub">{doDiaPorExtenso(hoje)}</div>
        </div>
        <SeletorProfissional staff={staff} valor={quem} aoMudar={setQuem}
                             podeVerTodos={poderes.verDeTodos} rotuloTodos="A equipe toda" />
      </div>

      {falhou && (
        <div className="rs-falha">
          Não deu para carregar os números de hoje. Se você ficou muito tempo
          com a tela aberta, a sessão pode ter expirado — recarregue a página.
        </div>
      )}

      {/* Cada rótulo diz de quem é o número: para o dono é a empresa, para o
          funcionário é a produção dele. Mesma palavra com dois significados
          numa tela de dinheiro é o que faz alguém desconfiar do sistema. */}
      <div className="stats" style={{ marginBottom: 18 }}>
        <Numero rotulo={dono('Faturamento do mês')} valor={mensal && brl(mensal.recebido)}
                dica={meu ? 'O que você atendeu neste mês e já foi pago.'
                          : 'Tudo o que foi atendido e pago neste mês.'} />
        <Numero rotulo={dono('Faturamento do ano')} valor={anual && brl(anual.recebido)}
                dica={meu ? 'O que você atendeu e já foi pago desde 1º de janeiro.'
                          : 'Tudo o que foi atendido e pago desde 1º de janeiro.'} />
        {/* Lucro é do dono: o que sobra depois de pagar as comissões. O servidor
            manda `null` para o funcionário; o `poderes` só evita o cartão vazio. */}
        {poderes.verDeTodos && (
          <Numero rotulo={doFiltro ? `Lucro do mês · ${doFiltro.nome.split(' ')[0]}` : 'Lucro do mês'}
                  valor={mensal && brl(mensal.lucro)}
                  dica="O faturamento do mês menos a comissão de cada profissional." />
        )}
        <Numero rotulo="Ticket médio do mês" valor={mensal && brl(mensal.ticketMedio)}
                dica="Quanto cada atendimento rendeu, em média, neste mês." />
        <Numero rotulo="Faltas / cancelados no mês"
                valor={mensal && `${mensal.faltas} / ${mensal.cancelados}`}
                dica="Clientes que faltaram e horários cancelados neste mês." />
      </div>

      <GraficoMensal meses={serie}
                     titulo={meu ? 'Seu faturamento por mês'
                       : doFiltro ? `Lucro por mês · ${doFiltro.nome.split(' ')[0]}` : 'Lucro por mês'}
                     dica={meu ? 'O que você atendeu e foi pago em cada mês: o mês atual e os 11 anteriores.'
                               : 'O faturamento de cada mês menos a comissão de cada profissional: o mês atual e os 11 anteriores.'} />

      <div className="rs-colunas" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        <div className="card" style={{ padding: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Próximos atendimentos</div>
            {proximos.length === 0 && (
              <p className="rs-vazio">Nada agendado pro resto do dia.</p>
            )}
            <div className="list">
              {proximos.map(a => {
                const c = clientes.find(x => x.id === a.cliente);
                const s = servicos.find(x => x.id === a.servico);
                const p = staff.find(x => x.id === a.prof);
                return (
                  <div key={a.id} className="li">
                    <div className="avatar" style={{ background: p?.cor || '#999' }}>
                      {p ? iniciais(p.nome) : '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="nm">{c?.nome}</div>
                      <div className="mt">
                        <span><Clock size={12} style={{ verticalAlign: -2 }} /> {a.hora}</span>
                        <span>{s?.nome}</span>
                        {poderes.verDeTodos && <span>{p?.nome.split(' ')[0]}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <Ranking staff={staff} ranking={ranking} falhou={falhou} />
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          {poderes.verDeTodos ? 'Como está o dia, por profissional' : 'Como está o meu dia'}
        </div>
        <TimelineDoDia colunas={colunas} agendamentos={doDia}
                       clientes={clientes} servicos={servicos} />
      </div>
    </>
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

      {meses && !vazio && (
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

const rotuloAtendimentos = n => `${n} atendimento${n === 1 ? '' : 's'}`;

/**
 * Quem mais atendeu no mês. A equipe toda vê o ranking, mas só o dono vê o valor
 * de cada um: para o funcionário o servidor nem manda `producao`, então não
 * depende desta tela esconder nada.
 */
function Ranking({ staff, ranking, falhou }) {
  return (
    <div className="card rs-relativo" style={{ padding: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        <Trophy size={13} style={{ verticalAlign: -2 }} /> Ranking do mês
      </div>
      <Dica texto="Quem mais fez atendimentos neste mês. Só contam os concluídos." />
      {falhou && !ranking && <p className="rs-vazio">Não deu para carregar.</p>}
      {!falhou && !ranking && <p className="rs-vazio">Calculando…</p>}
      {ranking && ranking.length === 0 && (
        <p className="rs-vazio">Nenhum atendimento concluído este mês ainda.</p>
      )}
      {ranking && ranking.map((linha, i) => {
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

const PX_H = 34, TOPO = 8;
const MIN_POR_PX = 60 / PX_H;

/**
 * Grade de um dia, uma coluna por profissional.
 *
 * Não é editável — sem arrastar, sem clique para abrir detalhe. É a versão
 * "de relance" da Agenda, não uma segunda forma de mexer na agenda.
 */
function TimelineDoDia({ colunas, agendamentos, clientes, servicos }) {
  if (colunas.length === 0) {
    return <p className="rs-vazio">Nenhum profissional ativo.</p>;
  }

  // A grade se estica para caber o que existe, em vez de recortar em 8h–20h:
  // quem marcava às 7h ficava com `top` negativo e sumia atrás do
  // `overflow: hidden` da moldura, enquanto os contadores lá em cima
  // continuavam contando o atendimento invisível.
  const [H_INI, H_FIM] = faixaDeHoras(agendamentos);
  const altura = (H_FIM - H_INI) * PX_H + TOPO * 2;

  return (
    <div className="eq-timeline">
      <div className="eq-horas">
        <div className="eq-horas-topo" />
        <div className="eq-horas-corpo" style={{ height: altura }}>
          {Array.from({ length: H_FIM - H_INI + 1 }, (_, i) => (
            <span key={i} className="eq-hlabel" style={{ top: TOPO + i * PX_H }}>
              {String(H_INI + i).padStart(2, '0')}:00
            </span>
          ))}
        </div>
      </div>
      <div className="eq-cols">
        {colunas.map(p => {
          // Dois atendimentos no mesmo horário dividem a largura da coluna. O
          // de baixo ficava escondido, e horário ocupado que parece livre é o
          // pior erro que esta tela pode cometer. Acontece de verdade: marcar
          // falta libera o horário no servidor, e a falta continua desenhada.
          const meus = emFaixas(agendamentos
            .filter(a => a.prof === p.id)
            .map(a => ({ a, ini: toMin(a.hora), fim: toMin(a.hora) + a.duracao })));
          return (
            <div key={p.id} className="eq-col">
              <div className="eq-colhead">
                <span className="avatar eq-av" style={{ background: p.cor }}>
                  {iniciais(p.nome)}
                </span>
                <span className="eq-nome">{p.nome.split(' ')[0]}</span>
              </div>
              <div className="eq-colbody" style={{ height: altura }}>
                {Array.from({ length: (H_FIM - H_INI) * 2 + 1 }, (_, i) => (
                  <div key={i} className={'linha' + (i % 2 ? ' meia' : '')}
                       style={{ top: TOPO + i * PX_H / 2 }} />
                ))}
                {meus.map(({ a, ini, fim, faixa, faixas }) => {
                  const c = clientes.find(x => x.id === a.cliente);
                  const s = servicos.find(x => x.id === a.servico);
                  const largura = 100 / faixas;
                  return (
                    <div key={a.id}
                         className={'appt' + (a.status === 'concluido' ? ' done' : '') + (a.status === 'falta' ? ' falta' : '')}
                         style={{
                           top: TOPO + (ini - H_INI * 60) / MIN_POR_PX,
                           height: Math.max((fim - ini) / MIN_POR_PX - 2, 22),
                           left: `calc(${faixa * largura}% + 3px)`,
                           width: `calc(${largura}% - 6px)`,
                           right: 'auto',
                           background: (p.cor || '#999') + '1f',
                           borderLeftColor: p.cor || '#999',
                         }}>
                      <b>{c?.nome.split(' ')[0]}</b>
                      <span className="t">{a.hora}</span> · {s?.nome}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const doDiaPorExtenso = iso => {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
};
