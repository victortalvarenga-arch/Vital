import { useEffect, useState } from 'react';
import { Check, Clock, Trophy, X } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import { hojeISO, iniciais, toMin } from '../shared/tempo.js';

/**
 * Resumo: a tela que abre primeiro no painel.
 *
 * Tudo aqui vem do que `/api/estado` já carrega — nenhuma rota nova. O único
 * pedido extra é o ranking do mês, que reaproveita a mesma
 * `/api/relatorios/resumo` que o Financeiro já chama.
 *
 * Dia fixo em hoje, sem seletor de período: essa tela responde "como está o
 * meu dia agora", não "como foi o mês" — isso já é o Financeiro. O ranking é
 * a única peça que olha pra trás (mês até hoje), porque só o dia de hoje deixa
 * a comparação entre profissionais rasa demais para servir de alguma coisa.
 */
export default function Resumo({ dados, acao, aviso, poderes }) {
  const { staff, clientes, servicos, agendamentos } = dados;
  const hoje = hojeISO();

  const deHoje = agendamentos.filter(a => a.data === hoje);
  const ativosHoje = deHoje.filter(a => a.status !== 'cancelado');
  const concluidos = deHoje.filter(a => a.status === 'concluido').length;
  const faltas = deHoje.filter(a => a.status === 'falta').length;
  const cancelados = deHoje.filter(a => a.status === 'cancelado').length;

  // Mesma dupla que o Financeiro calcula pra qualquer período — aqui só de/ate
  // são o dia de hoje: recebido é o que já entrou, previsto é o dia inteiro,
  // pago ou não.
  const recebido = ativosHoje
    .filter(a => a.status === 'concluido' && a.pagamento.status === 'pago')
    .reduce((s, a) => s + a.valor, 0);
  const previsto = ativosHoje.reduce((s, a) => s + a.valor, 0);

  const agora = new Date();
  const minAgora = agora.getHours() * 60 + agora.getMinutes();
  const proximos = ativosHoje
    .filter(a => (a.status === 'agendado' || a.status === 'confirmado')
      && toMin(a.hora) + a.duracao > minAgora)
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .slice(0, 5);

  // Funcionário vê só a própria coluna — mesmo recorte que o resto do painel
  // já aplica (escopoDe, no servidor). Dono vê todo mundo, lado a lado.
  const colunas = poderes.verDeTodos
    ? staff.filter(p => p.ativo)
    : staff.filter(p => p.id === dados.eu?.profissionalId);

  const mudarStatus = (id, status) =>
    acao(() => api.atualizarAgendamento(id, { status }), 'Agendamento atualizado');
  const excluir = id => {
    if (!confirm('Excluir este atendimento?')) return;
    acao(() => api.removerAgendamento(id), 'Agendamento removido');
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Resumo</h2>
          <div className="sub">{fmtHoje(hoje)}</div>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <span className="eyebrow">Recebido hoje</span>
          <span className="v">{brl(recebido)}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Previsto hoje</span>
          <span className="v">{brl(previsto)}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Atendimentos hoje</span>
          <span className="v">{deHoje.length}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Concluídos</span>
          <span className="v">{concluidos}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Faltas / cancelados</span>
          <span className="v">{faltas} / {cancelados}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: poderes.verDeTodos ? '1.1fr 1fr' : '1fr' }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Próximos atendimentos</div>
          {proximos.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nada agendado pro resto do dia.</p>
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
                      {!poderes.verDeTodos ? null : <span>{p?.nome.split(' ')[0]}</span>}
                    </div>
                  </div>
                  <button className="btn btn-g btn-s" title="Concluir"
                          onClick={() => mudarStatus(a.id, 'concluido')}>
                    <Check size={15} />
                  </button>
                  <button className="btn btn-g btn-s" title="Excluir" style={{ color: '#8A2B2B' }}
                          onClick={() => excluir(a.id)}>
                    <X size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {poderes.verDeTodos && <RankingDoMes staff={staff} />}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          {poderes.verDeTodos ? 'Como está o dia, por profissional' : 'Como está o meu dia'}
        </div>
        <TimelineDoDia colunas={colunas} agendamentos={ativosHoje} clientes={clientes} servicos={servicos} />
      </div>
    </>
  );
}

/**
 * Ranking dos profissionais no mês — a única peça do Resumo que busca dado
 * novo (o resto vem pronto de `dados`). Mesma rota que o Financeiro chama,
 * sem parâmetro: o servidor já assume "mês atual até hoje" nesse caso.
 */
function RankingDoMes({ staff }) {
  const [r, setR] = useState(null);
  useEffect(() => { api.resumo().then(setR).catch(() => setR(null)); }, []);

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        <Trophy size={13} style={{ verticalAlign: -2 }} /> Ranking do mês
      </div>
      {!r && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Calculando…</p>}
      {r && r.porProfissional.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sem atendimentos concluídos neste mês ainda.</p>
      )}
      {r && r.porProfissional.map((linha, i) => {
        const p = staff.find(x => x.id === linha.id);
        return (
          <div key={linha.id} className="li" style={{ padding: '9px 0' }}>
            <span className="mono" style={{ width: 18, color: 'var(--muted)', fontSize: 13 }}>{i + 1}º</span>
            <div className="avatar" style={{ background: p?.cor || '#999', width: 30, height: 30, fontSize: 11 }}>
              {iniciais(linha.nome)}
            </div>
            <div style={{ flex: 1, fontSize: 13.5 }}>{linha.nome.split(' ')[0]}
              <span style={{ color: 'var(--muted)' }}> · {linha.qtd} atendimento{linha.qtd === 1 ? '' : 's'}</span></div>
            <b className="mono" style={{ fontSize: 13.5 }}>{brl(linha.producao)}</b>
          </div>
        );
      })}
    </div>
  );
}

const H_INI = 8, H_FIM = 20, PX_H = 34, TOPO = 8;
const MIN_POR_PX = 60 / PX_H;

/**
 * Grade de hoje, uma coluna por profissional — a "timeline do dia".
 *
 * Coluna por pessoa foi tentado e descartado na Agenda semanal (virava sete
 * toques pra ver a semana inteira). Aqui não tem esse problema: é um dia só,
 * e comparar quem está ocupado agora é exatamente o que a coluna resolve.
 *
 * Não é editável — sem arrastar, sem clique pra abrir detalhe. É a versão
 * "de relance" da Agenda, não uma segunda forma de mexer na agenda.
 */
function TimelineDoDia({ colunas, agendamentos, clientes, servicos }) {
  if (colunas.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum profissional ativo.</p>;
  }
  return (
    <div className="eq-timeline">
      <div className="eq-horas">
        <div className="eq-horas-topo" />
        <div className="eq-horas-corpo" style={{ height: (H_FIM - H_INI) * PX_H + TOPO * 2 }}>
          {Array.from({ length: H_FIM - H_INI + 1 }, (_, i) => (
            <span key={i} className="eq-hlabel" style={{ top: TOPO + i * PX_H }}>
              {String(H_INI + i).padStart(2, '0')}:00
            </span>
          ))}
        </div>
      </div>
      <div className="eq-cols">
        {colunas.map(p => {
          const meus = agendamentos.filter(a => a.prof === p.id);
          return (
            <div key={p.id} className="eq-col">
              <div className="eq-colhead">
                <span className="avatar" style={{ background: p.cor, width: 20, height: 20, fontSize: 9 }}>
                  {iniciais(p.nome)}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.nome.split(' ')[0]}
                </span>
              </div>
              <div className="eq-colbody" style={{ height: (H_FIM - H_INI) * PX_H + TOPO * 2 }}>
                {Array.from({ length: (H_FIM - H_INI) * 2 + 1 }, (_, i) => (
                  <div key={i} className={'linha' + (i % 2 ? ' meia' : '')}
                       style={{ top: TOPO + i * PX_H / 2 }} />
                ))}
                {meus.map(a => {
                  const c = clientes.find(x => x.id === a.cliente);
                  const s = servicos.find(x => x.id === a.servico);
                  const ini = toMin(a.hora), fim = ini + a.duracao;
                  return (
                    <div key={a.id}
                         className={'appt' + (a.status === 'concluido' ? ' done' : '') + (a.status === 'falta' ? ' falta' : '')}
                         style={{
                           top: TOPO + (ini - H_INI * 60) / MIN_POR_PX,
                           height: Math.max((fim - ini) / MIN_POR_PX - 2, 22),
                           left: 3, right: 3, width: 'auto',
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
const fmtHoje = iso => {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
};
