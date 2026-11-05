import { useEffect, useState } from 'react';
import { Check, UserX, Wallet, X } from 'lucide-react';
import { confirmarTodos, mudarSituacao } from './fluxo.js';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import { hojeISO, toMin } from '../shared/tempo.js';


/**
 * Agendamentos: quem veio, quem faltou, quem cancelou.
 *
 * Existe por causa do fechamento automático. Passado o horário sem ninguém
 * marcar, o atendimento fica "sem marcação" (`pendente`, ver
 * `jobs/fechamento.js`) até alguém dizer se a cliente veio. Quem faltou se
 * marca aqui, uma a uma; o resto se confirma em lote, pelo botão no fim da lista
 * ou pelo "todos vieram" do Resumo.
 *
 * **Marcar falta ou cancelado tira do caixa e do CRM.** O atendimento sai do
 * recebido, some da divisão por forma de pagamento, deixa de contar como
 * "último atendimento" da cliente e não dispara mais mensagem de
 * pós-atendimento. Cancelar ainda devolve o horário para a agenda.
 *
 * Toda correção feita aqui vai para o registro com o nome de quem fez — é a
 * contrapartida de o sistema fechar sozinho: o dono precisa conseguir ver quem
 * desfez, quando e de qual estado para qual.
 *
 * A lista vem do servidor a cada troca de filtro, não de `dados.agendamentos`:
 * o bootstrap do painel carrega só 120 dias, e um mês mais antigo apareceria
 * vazio como se nada tivesse acontecido.
 */


/**
 * Cinco estados na tela, seis no banco.
 *
 * `confirmado` existe porque a cliente responde ao WhatsApp, mas para quem
 * opera é a mesma coisa que `agendado`: tem hora marcada e ainda não foi
 * atendida. Duas abas dizendo isso seriam duas abas para conferir toda vez.
 * O filtro "Agendado" pede os dois ao servidor.
 *
 * `em_atendimento` tem aba própria: é o único estado que responde "quem está
 * aqui agora", e é isso que se pergunta a uma lista no meio do dia.
 */
const ESTADOS = {
  agendado: { rotulo: 'A confirmar', tom: 'aguarda', busca: 'agendado' },
  confirmado: { rotulo: 'Confirmado', tom: 'confirmado', busca: 'confirmado' },
  em_atendimento: { rotulo: 'Em atendimento', tom: 'agora', busca: 'em_atendimento' },
  // Passou da hora e ninguém marcou (migration 034). Todos os dias até hoje,
  // como "A receber": é a lista que o "Alguém faltou" do Resumo abre, e o
  // aviso de lá junta pendências de qualquer dia.
  pendente: { rotulo: 'Sem marcação', tom: 'aguarda', busca: 'pendente', todosOsDias: true },
  concluido: { rotulo: 'Atendido', tom: 'feito', busca: 'concluido' },
  falta: { rotulo: 'Faltou', tom: 'falta', busca: 'falta' },
  cancelado: { rotulo: 'Cancelado', tom: 'ruim', busca: 'cancelado' },
  // Não é estado do atendimento, é do dinheiro: atendida e ainda não paga.
  // Olha todos os dias até hoje, e não o período da Agenda — é o que o aviso
  // de "pagamento pendente" do Resumo conta.
  receber: { rotulo: 'A receber', tom: 'aguarda', busca: 'concluido', todosOsDias: true },
};

/** Como o dinheiro do atendimento aparece na linha. */
const PAGAMENTO = { pago: 'Pago', parcial: 'Entrada', aberto: 'A pagar' };

/** O estado do banco, traduzido para o que a tela mostra. */
const comoAparece = status => ESTADOS[status] || { rotulo: status, tom: 'aguarda' };

export default function Agendamentos({ dados, acao, poderes, de, ate, pessoas = [], filtroInicial = '', aoAbrir, irPara }) {
  const { staff, clientes, servicos } = dados;

  const [estado, setEstado] = useState(filtroInicial);
  const hoje = hojeISO();
  const todos = ESTADOS[estado]?.todosOsDias;
  // "Atendida" e "Faltou" só depois da hora marcada, como na gaveta: às 12h a
  // das 14h30 ainda não foi atendida nem faltou.
  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  const jaComecou = a => a.data < hoje || (a.data === hoje && toMin(a.hora) <= agoraMin);
  const [lista, setLista] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [versao, setVersao] = useState(0);

  // O período e as pessoas vêm da Agenda, que é quem manda nas setas agora. Só
  // o filtro de estado é daqui — é a pergunta desta lista, e não das outras.
  //
  // O servidor recorta uma pessoa por vez; com duas ou três marcadas, pede-se
  // tudo e o recorte acontece aqui. A lista de um período cabe na memória, e
  // três chamadas para juntar na tela seriam três chances de divergir.
  useEffect(() => {
    let vivo = true;
    setLista(null);
    setFalhou(false);
    api.listarAgendamentos({ de: todos ? '2000-01-01' : de, ate: todos ? hoje : ate, status: ESTADOS[estado]?.busca })
      .then(l => { if (vivo) setLista(l); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [de, ate, estado, versao, todos, hoje]);

  // `acao` recarrega o estado global do painel; `versao` recarrega esta lista,
  // que o estado global não conhece. O desfazer do aviso passa por aqui também.
  const acaoDaLista = async (fn, msg) => { const ok = await acao(fn, msg); setVersao(v => v + 1); return ok; };
  // A mesma mudança da gaveta: aviso com o nome e Desfazer, no lugar da caixa
  // do navegador (que ainda mostrava a data em "2026-10-29").
  const mudar = (a, status) => mudarSituacao({ acao: acaoDaLista, agendamentos: lista || [], clientes, irPara }, a.id, status);

  const visiveis = (lista || [])
    .filter(a => pessoas.length === 0 || pessoas.includes(a.prof))
    // Presumido não é "a receber": o sistema supôs que entrou, só não foi
    // registrado. Tem linha própria no caixa, e não cobra ninguém.
    .filter(a => estado !== 'receber' || (a.pagamento?.status !== 'pago' && !a.pagamento?.presumido));

  return (
    <>
      <div className="ag-filtros">
        <span className="ag-resumo">
          {/* Um total só por tela: o dinheiro do período já está no topo da
              Agenda, e um segundo valor aqui, com outra base, parecia outro número. */}
          {!lista ? 'Carregando…'
            : todos && estado === 'pendente' ? `${visiveis.length} sem marcação, de qualquer dia até hoje`
            : todos ? `${visiveis.length} a receber, de qualquer dia até hoje`
            : `${visiveis.length} no período`}
        </span>
        <div className="chips">
          <button className={'chip' + (estado === '' ? ' on' : '')} onClick={() => setEstado('')}>Todos</button>
          {Object.entries(ESTADOS).map(([k, e]) => (
            <button key={k} className={'chip' + (estado === k ? ' on' : '')}
                    onClick={() => setEstado(k)}>{e.rotulo}</button>
          ))}
        </div>
      </div>

      {falhou && (
        <div className="rs-falha">
          Não deu para carregar os agendamentos. Se a tela ficou muito tempo aberta,
          a sessão pode ter expirado — recarregue a página.
        </div>
      )}

      {lista && visiveis.length === 0 && (
        <p className="rs-vazio">Nenhum atendimento neste período com esses filtros.</p>
      )}

      {lista && visiveis.length > 0 && (
        <div className="card ag-tabela-env">
          <table className="ag-tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Cliente</th>
                <th>Serviço</th>
                {poderes.verDeTodos && <th>Profissional</th>}
                <th className="num">Valor</th>
                <th>Estado</th>
                <th>Pagamento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visiveis.map(a => {
                const c = clientes.find(x => x.id === a.cliente);
                const s = servicos.find(x => x.id === a.servico);
                const p = staff.find(x => x.id === a.prof);
                const e = comoAparece(a.status);
                return (
                  <tr key={a.id} className={a.status === 'falta' || a.status === 'cancelado' ? 'ag-fora' : ''}>
                    <td className="mono ag-quando">{a.data.slice(8)}/{a.data.slice(5, 7)} <b>{a.hora}</b></td>
                    <td>{c?.nome || '—'}</td>
                    <td>{s?.nome || '—'}</td>
                    {poderes.verDeTodos && <td>{p?.nome.split(' ')[0] || '—'}</td>}
                    <td className="num mono">{brl(a.valor)}</td>
                    <td><span className={'ag-estado ' + e.tom}>{e.rotulo}</span></td>
                    {/* O dinheiro tem coluna própria: "Atendido" sozinho não dizia
                        se pagou, e a Recepção dizia — pareciam se contradizer. */}
                    <td>{a.pagamento?.presumido && ['pendente', 'concluido'].includes(a.status)
                      ? <span className="ag-pag presumido">Presumido</span>
                      // Pago aparece antes de concluir: "—" num atendimento já
                      // quitado parecia falta de informação. Falta e cancelado
                      // ficam de fora porque esse dinheiro não conta no caixa.
                      : a.status === 'concluido' || (a.pagamento?.status === 'pago' && !['falta', 'cancelado'].includes(a.status))
                      ? <span className={'ag-pag ' + (a.pagamento?.status || 'aberto')}>{PAGAMENTO[a.pagamento?.status] || 'A pagar'}</span>
                      : '—'}</td>
                    {/* Só o que faz sentido naquele estado: antes, "atendida"
                        aparecia em cancelado e em atendimento de amanhã, e falta
                        e cancelar apareciam no que já foi atendido e pago. O
                        resto mora na gaveta, que o "Abrir" mostra. */}
                    <td className="ag-acoes">
                      {aoAbrir && a.status === 'concluido' && a.pagamento?.status !== 'pago' && (
                        <button className="btn btn-p btn-s" onClick={() => aoAbrir(a)}>
                          <Wallet size={14} aria-hidden="true" /> Receber
                        </button>
                      )}
                      {(a.status === 'em_atendimento' || a.status === 'pendente'
                        || (['agendado', 'confirmado'].includes(a.status) && jaComecou(a))) && (
                        <button className="btn btn-g btn-s" onClick={() => mudar(a, 'concluido')}>
                          <Check size={14} aria-hidden="true" /> Atendida
                        </button>
                      )}
                      {(a.status === 'pendente' || (['agendado', 'confirmado'].includes(a.status) && jaComecou(a))) && (
                        <button className="btn btn-g btn-s" onClick={() => mudar(a, 'falta')}>
                          <UserX size={14} aria-hidden="true" /> Faltou
                        </button>
                      )}
                      {['agendado', 'confirmado'].includes(a.status) && (
                        <button className="btn btn-g btn-s btn-erro" onClick={() => mudar(a, 'cancelado')}>
                          <X size={14} aria-hidden="true" /> Cancelar
                        </button>
                      )}
                      {aoAbrir && <button className="btn btn-g btn-s" onClick={() => aoAbrir(a)}>Abrir</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Embaixo de propósito: primeiro se marca quem faltou, linha a linha, e
          o que sobra na lista se confirma de uma vez. Só o que está na tela:
          com pessoas filtradas, confirma as delas. */}
      {estado === 'pendente' && visiveis.length > 0 && (
        <div className="ag-confirmar-todos">
          <p>Marque antes quem faltou. Os que ficarem aqui viram atendidos, e o pagamento continua estimado até ser registrado.</p>
          <button type="button" className="btn btn-p"
                  onClick={() => confirmarTodos({ acao: acaoDaLista }, visiveis.map(a => a.id))}>
            <Check size={16} aria-hidden="true" /> Confirmar todos ({visiveis.length})
          </button>
        </div>
      )}
    </>
  );
}
