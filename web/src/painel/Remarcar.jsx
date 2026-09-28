import { ArrowRight } from 'lucide-react';
import { Modal } from './Base.jsx';
import { api } from '../shared/painel-api.js';
import { fmtData } from '../shared/tempo.js';

/**
 * "Remarcar?" — a pergunta que fecha um arrasto.
 *
 * Modal e não gaveta: o arrasto já acabou, e o que falta é parar e confirmar
 * (ver "Abrir coisa por cima da agenda é gaveta" em `ARQUITETURA.md`).
 *
 * Vive fora do `App.jsx` porque três grades arrastam — a semana, o dia da
 * Agenda e o dia do Resumo — e a pergunta é a mesma nas três. O de/para é o
 * conteúdo inteiro: quem arrastou já sabe o que quis fazer, só precisa ver se
 * acertou o alvo.
 */
export default function Remarcar({ alvo, clientes, servicos, staff, acao, aoFechar }) {
  const { a, data, hora, prof } = alvo;
  const trocouDeMao = prof && prof !== a.prof;
  const de = staff.find(p => p.id === a.prof);
  const para = staff.find(p => p.id === prof);

  return (
    <Modal onClose={aoFechar}>
      <h2 style={{ fontSize: 22, marginBottom: 6 }}>Remarcar?</h2>
      <p className="rm-quem">
        {clientes.find(c => c.id === a.cliente)?.nome || 'A cliente'}
        {' · '}{servicos.find(s => s.id === a.servico)?.nome}
      </p>
      <div className="rm-de-para">
        <div>
          <span className="eyebrow">De</span>
          <b>{fmtData(a.data)}</b>
          <i>{a.hora}{trocouDeMao && ` · ${primeiroNome(de)}`}</i>
        </div>
        <ArrowRight size={18} />
        <div className="rm-novo">
          <span className="eyebrow">Para</span>
          <b>{fmtData(data)}</b>
          <i>{hora}{trocouDeMao && ` · ${primeiroNome(para)}`}</i>
        </div>
      </div>
      <p className="rm-nota">A cliente não é avisada automaticamente — a mensagem sai pela fila.</p>
      <div className="rm-botoes">
        <button className="btn btn-g" onClick={aoFechar}>Cancelar</button>
        <button className="btn btn-p" onClick={async () => {
          aoFechar();
          // `profissionalId` só vai quando muda de mão: a rota confere conflito
          // e permissão para a agenda de destino, e mandar o mesmo de sempre
          // faria toda remarcação parecer uma troca no registro.
          await acao(
            () => api.atualizarAgendamento(a.id, {
              data, hora, ...(trocouDeMao ? { profissionalId: prof } : {}),
            }),
            trocouDeMao
              ? `Remarcado para ${primeiroNome(para)}, ${fmtData(data)} às ${hora}`
              : `Remarcado para ${fmtData(data)} às ${hora}`
          );
        }}>Remarcar</button>
      </div>
    </Modal>
  );
}

const primeiroNome = p => (p?.nome || '—').split(' ')[0];
