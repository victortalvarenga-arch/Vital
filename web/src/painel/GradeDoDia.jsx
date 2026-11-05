import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { emFaixas, faixaDeHoras, hojeISO, iniciais, toMin } from '../shared/tempo.js';
import { fechadoDaEmpresa, fechadoNoDia, semAs } from '../shared/jornada.js';
import { proximasDoDia } from './fluxo.js';

const PX_H = 34, TOPO = 8;
const MIN_POR_PX = 60 / PX_H;

/**
 * Os minutos do dia agora, atualizados a cada minuto. É o que move a linha do
 * "agora" e o destaque da próxima sem precisar recarregar nada: sem isso, a
 * próxima das 10h continuava destacada às 11h até alguém mexer na agenda.
 */
export function useMinutoAgora() {
  const ler = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const [agora, setAgora] = useState(ler);
  useEffect(() => {
    const id = setInterval(() => setAgora(ler()), 60_000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

/**
 * As faixas em que não se marca, em vermelho listrado (pedido da dona,
 * 2026-11-02 — o cinza ralo de antes passava por horário livre).
 *
 * Dois tons: `empresa` (ninguém atende — mais forte) e a jornada da pessoa
 * (ela não atende, outra pode). O corte com a parte aberta ganha uma linha
 * cheia, que é o que se lê de longe: "daqui para cima não dá". Sem eventos de
 * ponteiro, para o arrasto continuar passando por cima e quem recusa ser a
 * regra (`shared/remarcar.js`), não o desenho.
 */
export function FaixasFechadas({ faixas, empresa = false, deMin, ateMin, topo, minPorPx }) {
  return faixas.map(f => {
    const corte = f.ini > deMin && f.fim >= ateMin ? ' corte-cima'
      : f.ini <= deMin && f.fim < ateMin ? ' corte-baixo' : '';
    const altura = (f.fim - f.ini) / minPorPx;
    return (
      <div key={(empresa ? 'e' : 'p') + f.ini} aria-hidden="true" title={f.motivo}
           className={'fechado' + (empresa ? ' empresa' : '') + corte}
           style={{ top: topo + (f.ini - deMin) / minPorPx, height: altura }}>
        {altura >= 30 && <span className="fechado-rotulo">{f.motivo}</span>}
      </div>
    );
  });
}

/** A linha vermelha do horário de agora, só no dia de hoje e só dentro da grade. */
export function LinhaDoAgora({ minAgora, deMin, ateMin, topo, minPorPx }) {
  if (minAgora < deMin || minAgora > ateMin) return null;
  return <div className="agora-linha" aria-hidden="true" style={{ top: topo + (minAgora - deMin) / minPorPx }} />;
}

/**
 * Grade de um dia, uma coluna por profissional.
 *
 * Serve duas telas com regras diferentes: no Resumo é só para olhar (a versão
 * "de relance" da agenda), na Agenda o bloco abre o atendimento. Quem decide é
 * `aoTocar`: sem ele, os blocos não são clicáveis — é a diferença entre ver e
 * mexer, e ela fica visível em quem chama, não escondida aqui dentro.
 */
/**
 * A classe do bloco a partir do status.
 *
 * Vive aqui e é importada pela grade semanal do `App.jsx` porque as duas
 * precisam concordar: o mesmo atendimento muda de tela e não pode mudar de cor.
 * `em_atendimento` é o que a grade cheia tem de distinguir sem leitura — quem
 * está na cadeira agora contra quem já foi embora.
 */
export const classeDoBloco = (status, proxima = false) =>
  'appt'
  // "A confirmar" e "confirmado" eram o mesmo bloco: na grade cheia não dava
  // para ver de quem ainda falta a resposta.
  + (status === 'agendado' ? ' pendente' : '')
  + (status === 'concluido' ? ' done' : '')
  + (status === 'falta' ? ' falta' : '')
  // Não é `.pendente`: essa classe já é do "a confirmar", logo acima.
  + (status === 'pendente' ? ' sem-marca' : '')
  + (status === 'em_atendimento' ? ' agora' : '')
  + (proxima ? ' proxima' : '');

/**
 * O selo dentro do bloco: "Agora" na cadeira, "Próxima" na seguinte. Texto e
 * não só cor, porque a cor do bloco já é de quem atende.
 */
export const SeloDoBloco = ({ status, proxima }) => (
  status === 'em_atendimento' ? <span className="appt-selo agora">Agora</span>
    : proxima ? <span className="appt-selo proxima">Próxima</span> : null
);

export default function GradeDoDia({ colunas, agendamentos, clientes, servicos, staff = [], aoTocar,
                                     data, bloqueios = [],
                                     arrasto = null, arrastado = null, aoPegar = null }) {
  const minAgora = useMinutoAgora();
  const ehHoje = data === hojeISO();
  const proximas = ehHoje ? proximasDoDia(agendamentos, data, minAgora) : new Set();
  // No celular cabem duas colunas, e quem está atendendo agora podia ficar
  // fora da tela — justo a coluna que se abre a grade para ver. Ao abrir o
  // dia, a faixa rola até ela; rola só a faixa, nunca a página.
  const moldura = useRef(null);
  const naCadeira = agendamentos.find(a => a.status === 'em_atendimento')?.prof;
  useEffect(() => {
    const cols = moldura.current?.querySelector('.eq-cols');
    const alvo = naCadeira && moldura.current?.querySelector(`[data-prof="${naCadeira}"]`);
    if (!cols || !alvo || cols.scrollWidth <= cols.clientWidth) return;
    cols.scrollLeft += alvo.getBoundingClientRect().left - cols.getBoundingClientRect().left - 8;
  }, [data, naCadeira]);

  if (colunas.length === 0) {
    return <p className="rs-vazio">Nenhum profissional ativo.</p>;
  }

  // A grade se estica para caber o que existe, em vez de recortar em 8h–20h:
  // quem marcava às 7h ficava com `top` negativo e sumia atrás do
  // `overflow: hidden` da moldura, enquanto os contadores lá em cima
  // continuavam contando o atendimento invisível.
  const [H_INI, H_FIM] = faixaDeHoras(agendamentos);
  const altura = (H_FIM - H_INI) * PX_H + TOPO * 2;
  const janela = { deMin: H_INI * 60, ateMin: H_FIM * 60, topo: TOPO, minPorPx: MIN_POR_PX };
  // A empresa fechada é da equipe ativa inteira, não só das colunas à vista:
  // filtrar numa pessoa não pode fazer a empresa "abrir" mais tarde.
  const daEmpresa = fechadoDaEmpresa({ equipe: staff, data, deMin: janela.deMin, ateMin: janela.ateMin });

  return (
    <div className="eq-timeline" ref={moldura}>
      {/* A faixa que carrega na beirada. Enquanto o dedo fica ali ela enche, e
          a cada volta o dia vira — mesmo aviso, mesma animação da semana; o que
          muda é o tamanho do passo, que é de quem chamou. Sem ela a agenda pula
          sozinha e parece defeito. */}
      {arrasto?.lado && (
        <div className={'ag-borda dia ' + (arrasto.lado < 0 ? 'esq' : 'dir')} aria-hidden="true">
          {arrasto.lado < 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </div>
      )}
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
              {/* `data-dia` e `data-prof` são o que o arraste lê para saber
                  onde o dedo está — ver `useArrastar.js`. Aqui a coluna é uma
                  pessoa, então soltar na coluna ao lado é trocar quem atende. */}
              <div className="eq-colbody" style={{ height: altura }}
                   data-dia={data} data-prof={p.id}>
                {Array.from({ length: (H_FIM - H_INI) * 2 + 1 }, (_, i) => (
                  <div key={i} className={'linha' + (i % 2 ? ' meia' : '')}
                       style={{ top: TOPO + i * PX_H / 2 }} />
                ))}

                {/* Fora da jornada, e o bloqueio por cima: os dois dizem "não
                    dá para marcar aqui", que é o que se pergunta olhando um
                    buraco na grade. O bloqueio ainda diz por quê. Sempre, e
                    não só com uma pessoa escolhida: aqui cada coluna é uma
                    pessoa, então a jornada de cada uma é dela e de mais
                    ninguém. */}
                <FaixasFechadas faixas={daEmpresa} empresa {...janela} />
                <FaixasFechadas {...janela}
                  faixas={semAs(fechadoNoDia({ profissional: p, data, deMin: janela.deMin, ateMin: janela.ateMin }), daEmpresa)} />
                {ehHoje && <LinhaDoAgora minAgora={minAgora} {...janela} />}
                {bloqueios.filter(b => !b.profissionalId || b.profissionalId === p.id).map(b => (
                  <div key={b.id} className={'bloqueio' + (b.profissionalId ? '' : ' empresa')} style={{
                         top: TOPO + (toMin(b.horaIni) - H_INI * 60) / MIN_POR_PX,
                         height: Math.max((toMin(b.horaFim) - toMin(b.horaIni)) / MIN_POR_PX, 16),
                       }}>
                    <span>{b.motivo || 'Bloqueado'}</span>
                  </div>
                ))}

                {/* A sombra do arrasto: o próprio atendimento, esmaecido, na
                    coluna de quem vai receber. */}
                {arrasto?.hora && arrasto.prof === p.id && (() => {
                  const a = arrastado;
                  if (!a) return null;
                  const c = clientes.find(x => x.id === a.cliente);
                  const s = servicos.find(x => x.id === a.servico);
                  const dono = staff.find(x => x.id === a.prof);
                  return (
                    <div className={'appt sombra' + (arrasto.ok ? '' : ' nao')}
                         style={{
                           top: TOPO + (toMin(arrasto.hora) - H_INI * 60) / MIN_POR_PX,
                           height: Math.max(arrasto.dur / MIN_POR_PX - 2, 22),
                           left: 3, right: 3,
                           background: (dono?.cor || '#999') + '1f',
                           borderLeftColor: dono?.cor || '#999',
                         }}>
                      <b><span className="t">{arrasto.hora}</span> {c?.nome.split(' ')[0]}</b>
                      {s?.nome}
                    </div>
                  );
                })()}

                {meus.map(({ a, ini, fim, faixa, faixas }) => {
                  const c = clientes.find(x => x.id === a.cliente);
                  const s = servicos.find(x => x.id === a.servico);
                  const largura = 100 / faixas;
                  const Bloco = (aoTocar || aoPegar) ? 'button' : 'div';
                  const puxando = arrasto?.id === a.id;
                  return (
                    <Bloco key={a.id}
                         {...(aoPegar ? { type: 'button', onPointerDown: e => aoPegar(e, a) }
                           : aoTocar ? { type: 'button', onClick: () => aoTocar(a) } : {})}
                         className={classeDoBloco(a.status, proximas.has(a.id)) + (puxando ? ' puxando' : '')}
                         style={{
                           top: TOPO + (ini - H_INI * 60) / MIN_POR_PX,
                           height: Math.max((fim - ini) / MIN_POR_PX - 2, 22),
                           left: `calc(${faixa * largura}% + 3px)`,
                           width: `calc(${largura}% - 6px)`,
                           right: 'auto',
                           background: (p.cor || '#999') + '1f',
                           borderLeftColor: p.cor || '#999',
                         }}>
                      {/* Hora e nome na mesma linha: o bloco de 30 min só tem
                          altura para uma, e ela precisa dizer quando e quem. */}
                      <SeloDoBloco status={a.status} proxima={proximas.has(a.id)} />
                      <b><span className="t">{a.hora}</span> {c?.nome.split(' ')[0]}</b>
                      {s?.nome}
                      {a.status === 'agendado' && <span className="so-leitor"> · a confirmar</span>}
                    </Bloco>
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
