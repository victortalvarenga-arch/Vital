import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, UserX, X } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import SeletorProfissional from './Seletor.jsx';
import { brl } from '../shared/formato.js';
import { hojeISO, intervaloDo } from '../shared/tempo.js';

/**
 * Agendamentos: quem veio, quem faltou, quem cancelou.
 *
 * Existe por causa do fechamento automático. Passado o horário, o atendimento
 * vira concluído e pago sozinho (ver `jobs/fechamento.js`) — o que resolve o
 * caso comum sem clique nenhum, mas exige um lugar onde a exceção se conserte.
 * Esta é a tela: uma lista do período, com o estado de cada um e três botões.
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

const ESCALAS = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']];

/**
 * Quatro estados na tela, cinco no banco.
 *
 * `confirmado` existe porque a cliente responde ao WhatsApp, mas para quem
 * opera é a mesma coisa que `agendado`: tem hora marcada e ainda não foi
 * atendida. Duas abas dizendo isso seriam duas abas para conferir toda vez.
 * O filtro "Agendado" pede os dois ao servidor.
 */
const ESTADOS = {
  agendado: { rotulo: 'Agendado', tom: 'aguarda', busca: 'agendado,confirmado' },
  concluido: { rotulo: 'Atendido', tom: 'feito', busca: 'concluido' },
  falta: { rotulo: 'Faltou', tom: 'ruim', busca: 'falta' },
  cancelado: { rotulo: 'Cancelado', tom: 'ruim', busca: 'cancelado' },
};

/** O estado do banco, traduzido para o que a tela mostra. */
const comoAparece = status =>
  ESTADOS[status === 'confirmado' ? 'agendado' : status]
  || { rotulo: status, tom: 'aguarda' };

export default function Agendamentos({ dados, acao, poderes }) {
  const { staff, clientes, servicos } = dados;
  const hoje = hojeISO();

  const [escala, setEscala] = useState('dia');
  const [desloc, setDesloc] = useState(0);
  const [quem, setQuem] = useState('');
  const [estado, setEstado] = useState('');
  const [lista, setLista] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [versao, setVersao] = useState(0);

  const { de, ate } = intervaloDo(escala, desloc);

  useEffect(() => {
    let vivo = true;
    setLista(null);
    setFalhou(false);
    api.listarAgendamentos({ de, ate, profissionalId: quem || undefined,
                             status: ESTADOS[estado]?.busca })
      .then(l => { if (vivo) setLista(l); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [de, ate, quem, estado, versao]);

  // `acao` recarrega o estado global do painel; `versao` recarrega esta lista,
  // que o estado global não conhece.
  const mudar = async (a, status) => {
    const nome = clientes.find(c => c.id === a.cliente)?.nome || 'a cliente';
    const verbo = status === 'falta' ? 'registrar falta de' : status === 'cancelado' ? 'cancelar o horário de' : 'marcar como atendida';
    if (!confirm(`Confirma ${verbo} ${nome}, ${a.data} às ${a.hora}?`)) return;
    await acao(() => api.atualizarAgendamento(a.id, { status }), 'Atendimento atualizado');
    setVersao(v => v + 1);
  };

  const total = (lista || [])
    .filter(a => a.status === 'concluido')
    .reduce((s, a) => s + Number(a.valor || 0), 0);

  return (
    <>
      <div className="head">
        <div>
          <h2>Agendamentos</h2>
          <div className="sub">
            {lista ? `${lista.length} no período · ${brl(total)} atendidos` : 'Carregando…'}
          </div>
        </div>
        <div className="rs-controles">
          <div className="chips">
            {ESCALAS.map(([k, nome]) => (
              <button key={k} className={'chip' + (escala === k ? ' on' : '')}
                      onClick={() => { setEscala(k); setDesloc(0); }}>{nome}</button>
            ))}
          </div>
          <div className="rs-nav">
            <button className="btn btn-g btn-s" title="Período anterior"
                    onClick={() => setDesloc(d => d - 1)}><ChevronLeft size={15} /></button>
            {desloc !== 0 && <button className="btn btn-g btn-s" onClick={() => setDesloc(0)}>Agora</button>}
            <button className="btn btn-g btn-s" title="Período seguinte"
                    onClick={() => setDesloc(d => d + 1)}><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      <div className="ag-filtros">
        <SeletorProfissional staff={staff} valor={quem} aoMudar={setQuem}
                             podeVerTodos={poderes.verDeTodos} rotuloTodos="Todos" />
        <div className="chips">
          <button className={'chip' + (estado === '' ? ' on' : '')} onClick={() => setEstado('')}>Todo estado</button>
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

      {lista && lista.length === 0 && (
        <p className="rs-vazio">Nenhum atendimento neste período com esses filtros.</p>
      )}

      {lista && lista.length > 0 && (
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
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map(a => {
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
                    <td className="ag-acoes">
                      {a.status !== 'concluido' && (
                        <button className="btn btn-g btn-s" title="Marcar como atendida"
                                onClick={() => mudar(a, 'concluido')}><Check size={14} /></button>
                      )}
                      {a.status !== 'falta' && (
                        <button className="btn btn-g btn-s" title="Registrar falta"
                                onClick={() => mudar(a, 'falta')}><UserX size={14} /></button>
                      )}
                      {a.status !== 'cancelado' && (
                        <button className="btn btn-g btn-s btn-erro" title="Cancelar e liberar o horário"
                                onClick={() => mudar(a, 'cancelado')}><X size={14} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
