import { Clock } from 'lucide-react';
import { brl } from '../shared/formato.js';
import { iniciais, toHora, toMin } from '../shared/tempo.js';

/**
 * O dia inteiro em uma coluna, por horário — a tela de quem atende o balcão.
 *
 * A grade por profissional responde "como está a agenda da Bia"; esta responde
 * "quem é a próxima", que é a pergunta de quem recebe quem chega. Por isso é
 * uma lista, e não colunas: quem está no balcão lê de cima para baixo e não
 * precisa cruzar três colunas para descobrir quem vem às 14h.
 *
 * Sempre o dia inteiro, sem escala de semana ou mês: recepção de semana não
 * existe.
 */
export default function Recepcao({ agendamentos, clientes, servicos, staff, aoTocar }) {
  const lista = [...agendamentos].sort((a, b) => a.hora.localeCompare(b.hora));

  if (lista.length === 0) {
    return <p className="rs-vazio" style={{ padding: 24 }}>Nenhum atendimento neste dia.</p>;
  }

  const agora = new Date();
  const minAgora = agora.getHours() * 60 + agora.getMinutes();

  return (
    <div className="card rc">
      {lista.map((a, i) => {
        const c = clientes.find(x => x.id === a.cliente);
        const s = servicos.find(x => x.id === a.servico);
        const p = staff.find(x => x.id === a.prof);
        const fim = toMin(a.hora) + a.duracao;
        const passou = fim <= minAgora;
        // A linha que separa o que já passou do que vem: quem está no balcão
        // procura "a próxima", e essa é a informação que a lista some quando
        // todas as linhas se parecem.
        const primeiroFuturo = !passou && (i === 0
          || toMin(lista[i - 1].hora) + lista[i - 1].duracao <= minAgora);

        return (
          <div key={a.id}>
            {primeiroFuturo && lista.some(x => toMin(x.hora) + x.duracao <= minAgora) && (
              <div className="rc-agora"><span>agora</span></div>
            )}
            <button type="button" className={'rc-linha' + (passou ? ' passou' : '')}
                    onClick={() => aoTocar(a)}>
              <span className="rc-hora mono">
                {a.hora}
                <i>{toHora(fim)}</i>
              </span>
              <span className="avatar rc-foto" style={{ background: p?.cor || '#999' }}>
                {p ? iniciais(p.nome) : '?'}
              </span>
              <span className="rc-quem">
                <b>{c?.nome || 'Cliente'}</b>
                <i>{s?.nome}{p ? ` · ${p.nome.split(' ')[0]}` : ''}</i>
              </span>
              {/* Um selo só, e o mais urgente: quem está no balcão precisa saber
                  quem ainda não confirmou, não quem já pagou. Os dois juntos
                  ('pago' e 'a confirmar') pareciam contradição. */}
              <span className="rc-fim">
                <b className="mono">{brl(a.valor)}</b>
                {a.status === 'falta' ? <i className="rc-falta">faltou</i>
                  : a.status === 'em_atendimento' ? <i className="rc-agora">na cadeira</i>
                  : a.status === 'agendado' ? <i className="rc-pendente">a confirmar</i>
                  : a.pagamento?.status === 'pago' ? <i className="rc-pago">pago</i>
                  : a.pagamento?.status === 'parcial' ? <i className="rc-pendente">entrada</i> : null}
              </span>
            </button>
          </div>
        );
      })}
      <div className="rc-rodape">
        <span><Clock size={13} /> {lista.length} no dia</span>
        <b className="mono">{brl(lista.reduce((s, a) => s + a.valor, 0))}</b>
      </div>
    </div>
  );
}
