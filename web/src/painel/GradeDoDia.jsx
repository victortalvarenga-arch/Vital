import { ChevronLeft, ChevronRight } from 'lucide-react';
import { emFaixas, faixaDeHoras, iniciais, toMin } from '../shared/tempo.js';
import { fechadoNoDia } from '../shared/jornada.js';

const PX_H = 34, TOPO = 8;
const MIN_POR_PX = 60 / PX_H;

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
export const classeDoBloco = status =>
  'appt'
  + (status === 'concluido' ? ' done' : '')
  + (status === 'falta' ? ' falta' : '')
  + (status === 'em_atendimento' ? ' agora' : '');

export default function GradeDoDia({ colunas, agendamentos, clientes, servicos, staff = [], aoTocar,
                                     data, bloqueios = [], mostrarFechado = false,
                                     arrasto = null, arrastado = null, aoPegar = null }) {
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
                    buraco na grade. O bloqueio ainda diz por quê. */}
                {mostrarFechado && fechadoNoDia({
                  profissional: p, data, deMin: H_INI * 60, ateMin: H_FIM * 60,
                }).map(f => (
                  <div key={f.ini} className="fechado" title={f.motivo} aria-hidden="true"
                       style={{ top: TOPO + (f.ini - H_INI * 60) / MIN_POR_PX,
                                height: (f.fim - f.ini) / MIN_POR_PX }} />
                ))}
                {bloqueios.filter(b => !b.profissionalId || b.profissionalId === p.id).map(b => (
                  <div key={b.id} className="bloqueio" style={{
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
                      <b>{c?.nome.split(' ')[0]}</b>
                      <span className="t">{arrasto.hora}</span> · {s?.nome}
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
                         className={classeDoBloco(a.status) + (puxando ? ' puxando' : '')}
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
