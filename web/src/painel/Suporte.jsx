import { useEffect, useState } from 'react';
import { LifeBuoy, Mail, Send } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Suporte técnico: dois caminhos para falar com a Vital.
 *
 * **E-mail** para quem prefere, ou para quando o próprio painel é o problema —
 * se a pessoa não consegue entrar, o formulário daqui não adianta nada.
 *
 * **Chamado pelo aplicativo** para o resto, que é a maioria. Ele chega na
 * página da Vital já sabendo de qual empresa veio e quem escreveu, sem a
 * pessoa ter de contar — e é isso que separa um chamado útil de um e-mail
 * dizendo "não está funcionando".
 *
 * O chamado mora em `plataforma.tickets`, fora do Row-Level Security, porque
 * quem lê a fila é a nossa equipe atravessando empresas. O porquê inteiro está
 * na migration 014.
 */

const EMAIL = 'vital.automations@gmail.com';

const ESTADOS = {
  aberto: { rotulo: 'Aguardando', tom: 'aguarda' },
  respondido: { rotulo: 'Respondido', tom: 'feito' },
  fechado: { rotulo: 'Fechado', tom: 'ruim' },
};

export default function Suporte({ aviso }) {
  const [lista, setLista] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [versao, setVersao] = useState(0);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLista(null);
    setFalhou(false);
    api.chamados()
      .then(l => { if (vivo) setLista(l); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [versao]);

  const enviar = async () => {
    if (!assunto.trim()) return aviso('Escreva um assunto.');
    if (mensagem.trim().length < 10) return aviso('Conte o que aconteceu, com um pouco mais de detalhe.');
    setEnviando(true);
    try {
      await api.abrirChamado({ assunto, mensagem });
      setAssunto('');
      setMensagem('');
      setEnviado(true);
      setVersao(v => v + 1);
    } catch (e) {
      aviso(e.message || 'Não deu para enviar o chamado.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Suporte técnico</h2>
          <div className="sub">Alguma coisa não está funcionando? Fale com a gente</div>
        </div>
      </div>

      <div className="sup-canais">
        <div className="card sup-email">
          <Mail size={18} aria-hidden="true" />
          <div>
            <div className="sup-canal-titulo">Por e-mail</div>
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            {/* Vale dizer quando o e-mail é a única opção: painel que não abre
                não tem formulário para enviar nada. */}
            <p>Use este caminho se você não conseguir entrar no painel.</p>
          </div>
        </div>

        <div className="card sup-form">
          <div className="sup-canal-titulo"><LifeBuoy size={16} aria-hidden="true" /> Pelo aplicativo</div>
          <p className="sup-ajuda">
            O chamado chega para a nossa equipe já com o nome da sua empresa e o seu —
            você não precisa se identificar.
          </p>
          <input value={assunto} maxLength={120} placeholder="Assunto: o que aconteceu, em poucas palavras"
                 onChange={e => { setAssunto(e.target.value); setEnviado(false); }} />
          <textarea value={mensagem} rows={5} maxLength={4000}
                    placeholder="Conte com detalhe: em que tela, o que você clicou, o que apareceu."
                    onChange={e => { setMensagem(e.target.value); setEnviado(false); }} />
          <div className="sup-rodape">
            {enviado && <span className="sup-ok">Chamado enviado. Respondemos por aqui.</span>}
            <button className="btn btn-p" onClick={enviar} disabled={enviando}>
              <Send size={16} /> {enviando ? 'Enviando…' : 'Enviar chamado'}
            </button>
          </div>
        </div>
      </div>

      <div className="eyebrow sup-titulo-lista">Seus chamados</div>
      {falhou && <div className="rs-falha">Não deu para carregar seus chamados.</div>}
      {lista && lista.length === 0 && (
        <p className="rs-vazio">Você ainda não abriu nenhum chamado.</p>
      )}

      {(lista || []).map(t => {
        const e = ESTADOS[t.status] || ESTADOS.aberto;
        return (
          <div key={t.id} className="card sup-item">
            <div className="sup-item-topo">
              <b>{t.assunto}</b>
              <span className={'ag-estado ' + e.tom}>{e.rotulo}</span>
              <span className="sup-quando">{fmt(t.criadoEm)} · {t.autor}</span>
            </div>
            <p className="sup-msg">{t.mensagem}</p>
            {t.resposta && (
              <div className="sup-resposta">
                <div className="sup-canal-titulo">Resposta da Vital</div>
                <p>{t.resposta}</p>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

const fmt = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
