import { useEffect, useState } from 'react';
import { Clock, Trophy } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import { emFaixas, faixaDeHoras, hojeISO, iniciais, toMin } from '../shared/tempo.js';

/**
 * Resumo: a tela que abre primeiro no painel.
 *
 * Responde uma pergunta só: **como está o meu dia agora.** Sem seletor de
 * período, de propósito — semana, mês e comparação com o período anterior são
 * a pergunta do Financeiro, e duas telas respondendo a mesma coisa é o começo
 * de duas respostas diferentes.
 *
 * Os números vêm de `/api/relatorios/resumo`, a mesma fonte do Financeiro, em
 * vez de somados aqui a partir de `dados.agendamentos`. Não é sobre hoje caber
 * na memória (cabe): é que a conta de "recebido" e "ticket médio" já existe no
 * servidor, recortada por `escopoDe` — refazê-la no navegador seria a segunda
 * versão da mesma regra, livre para divergir.
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
  const [r, setR] = useState(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    setR(null);
    setFalhou(false);
    api.resumo({ de: hoje, ate: hoje, profissionalId: quem || undefined })
      .then(x => { if (vivo) setR(x); })
      // Falha precisa parecer falha. Antes isto caía em `setR(null)`, que é o
      // mesmo estado de "carregando" — sessão expirada virava um "Calculando…"
      // eterno, sem nada no console.
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [hoje, quem]);

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
        {poderes.verDeTodos && (
          <div className="chips chips-rolagem">
            <button type="button" className={'chip' + (quem === '' ? ' on' : '')}
                    onClick={() => setQuem('')}>Todos</button>
            {staff.filter(p => p.ativo).map(p => (
              <button key={p.id} type="button"
                      className={'chip' + (quem === p.id ? ' on' : '')}
                      onClick={() => setQuem(p.id)}>{p.nome.split(' ')[0]}</button>
            ))}
          </div>
        )}
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
        <Numero rotulo={dono('Recebido')} valor={r && brl(r.recebido)} />
        <Numero rotulo={dono('Previsto')} valor={r && brl(r.previsto)} />
        <Numero rotulo="Ticket médio" valor={r && brl(r.ticketMedio)} />
        <Numero rotulo="Atendimentos" valor={r && r.agendados} />
        <Numero rotulo="Concluídos" valor={r && r.atendimentos} />
        <Numero rotulo="Faltas / cancelados" valor={r && `${r.faltas} / ${r.cancelados}`} />
      </div>

      <div className="rs-colunas" style={{ gridTemplateColumns: poderes.verDeTodos ? '1.1fr 1fr' : '1fr' }}>
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

        {poderes.verDeTodos && <Ranking staff={staff} r={r} falhou={falhou} />}
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

/** Um número do topo. Enquanto o período não chega, ocupa o mesmo espaço. */
const Numero = ({ rotulo, valor }) => (
  <div className="card stat">
    <span className="eyebrow">{rotulo}</span>
    <span className="v">{valor == null ? <span className="rs-esperando">—</span> : valor}</span>
  </div>
);

/**
 * Quem produziu hoje. Do dia, como todo o resto da tela — comparação entre
 * profissionais ao longo do mês é do Financeiro, onde há escala de período.
 */
function Ranking({ staff, r, falhou }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        <Trophy size={13} style={{ verticalAlign: -2 }} /> Ranking do dia
      </div>
      {falhou && <p className="rs-vazio">Não deu para carregar.</p>}
      {!falhou && !r && <p className="rs-vazio">Calculando…</p>}
      {r && r.porProfissional.length === 0 && (
        <p className="rs-vazio">Nenhum atendimento concluído hoje ainda.</p>
      )}
      {r && r.porProfissional.map((linha, i) => {
        const p = staff.find(x => x.id === linha.id);
        return (
          <div key={linha.id} className="li" style={{ padding: '9px 0' }}>
            <span className="mono rs-pos">{i + 1}º</span>
            <div className="avatar rs-av-pq" style={{ background: p?.cor || '#999' }}>
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
