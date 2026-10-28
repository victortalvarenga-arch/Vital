import { useEffect, useRef, useState } from 'react';
import { Bot, Check, RotateCcw, Send, ShieldCheck, TriangleAlert, UserRound, X } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { Switch } from './Base.jsx';

/**
 * Atendente por IA: o que ela sabe, como ela fala, e um lugar para conversar
 * com ela como se fosse uma cliente antes de ligar no WhatsApp.
 *
 * O teste é a IA de verdade, com as mesmas regras e a mesma revisão do
 * atendimento — mas em simulação: o que ela "agenda" passa por todas as
 * conferências da agenda e não grava nada. É aqui que a dona vê, antes de
 * qualquer cliente, o que a revisão barra e quando a conversa vai para a
 * equipe.
 *
 * No modo sombra, cada resposta chega como sugestão: aprovar é o que a faria
 * sair no WhatsApp; descartar faz a conversa seguir como se ela nunca tivesse
 * sido dita.
 */

export default function Atendente({ aviso }) {
  const [cfg, setCfg] = useState(null);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [conversa, setConversa] = useState(null);
  const [texto, setTexto] = useState('');
  const [fone, setFone] = useState('');
  const [pensando, setPensando] = useState(false);
  const fim = useRef(null);

  useEffect(() => {
    api.atendente().then(c => { setCfg(c); setRascunho(c.instrucoes || ''); }).catch(e => aviso(e.message));
    api.conversaDeTeste().then(setConversa).catch(() => {});
  }, [aviso]);

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [conversa?.mensagens?.length, pensando]);

  const salvar = async patch => {
    setSalvando(true);
    try { setCfg(await api.salvarAtendente(patch)); }
    catch (e) { aviso(e.message); }
    finally { setSalvando(false); }
  };

  const enviar = async () => {
    const t = texto.trim();
    if (!t || pensando) return;
    setTexto('');
    // Mostra a mensagem na hora; a resposta da IA leva alguns segundos.
    setConversa(c => ({ ...(c || { estado: 'ia' }), mensagens: [...(c?.mensagens || []), { id: 'nova', autor: 'cliente', texto: t, revisao: {} }] }));
    setPensando(true);
    try { setConversa(await api.falarComAtendente({ texto: t, fone })); }
    catch (e) { aviso(e.message); setConversa(await api.conversaDeTeste().catch(() => null)); }
    finally { setPensando(false); }
  };

  const agir = async fn => {
    try { setConversa(await fn()); } catch (e) { aviso(e.message); }
  };

  if (!cfg) return null;
  const mudouInstrucoes = rascunho.trim() !== (cfg.instrucoes || '');

  return (
    <>
      <div className="head">
        <div>
          <h2>Atendente IA</h2>
          <div className="sub">Responde e agenda pelo WhatsApp, 24 horas, com as regras da sua clínica</div>
        </div>
      </div>

      {!cfg.chave && (
        <div className="atd-aviso">
          <TriangleAlert size={16} aria-hidden="true" />
          A chave da Anthropic ainda não está configurada no servidor. Dá para preparar tudo aqui, mas o teste só responde depois dela.
        </div>
      )}

      <div className="atd-grade">
        <section className="card atd-config">
          <div className="atd-linha">
            <div>
              <b>Atendimento no WhatsApp</b>
              <p>Liga quando o número da clínica for conectado. Até lá, use o teste desta página.</p>
            </div>
            <Switch on={cfg.ligado} rotulo="Atendimento no WhatsApp" onChange={() => salvar({ ligado: !cfg.ligado })} />
          </div>

          <div className="atd-modos" role="radiogroup" aria-label="Como a IA responde">
            {[
              ['sombra', 'Sugerir', 'Cada resposta espera a equipe aprovar. Bom para começar.'],
              ['automatico', 'Responder sozinha', 'Responde na hora. A revisão continua valendo.'],
            ].map(([valor, titulo, desc]) => (
              <button key={valor} role="radio" aria-checked={cfg.modo === valor}
                      className={'atd-modo' + (cfg.modo === valor ? ' on' : '')}
                      onClick={() => cfg.modo !== valor && salvar({ modo: valor })}>
                <b>{titulo}</b><span>{desc}</span>
              </button>
            ))}
          </div>

          <label className="atd-rotulo" htmlFor="atd-instrucoes">O que a IA precisa saber</label>
          <textarea id="atd-instrucoes" rows={9} maxLength={4000} value={rascunho}
                    placeholder={'Ex.: política de cancelamento, formas de pagamento, cuidados antes e depois, se tem estacionamento.\n\nPreços, serviços e horários ela já consulta sozinha no sistema.'}
                    onChange={e => setRascunho(e.target.value)} />
          <div className="atd-rodape">
            <span className="atd-conta">{rascunho.length}/4000</span>
            <button className="btn btn-p btn-s" disabled={!mudouInstrucoes || salvando}
                    onClick={() => salvar({ instrucoes: rascunho })}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>

          <div className="atd-regras">
            <div className="atd-regras-t"><ShieldCheck size={15} aria-hidden="true" /> O que ela nunca faz</div>
            <ul>
              <li>Inventar preço, horário ou data — tudo vem do sistema</li>
              <li>Dizer que agendou sem ter agendado</li>
              <li>Diagnosticar, indicar procedimento ou falar de remédio</li>
              <li>Prometer resultado ou dizer que não dói</li>
              <li>Fingir que é uma pessoa</li>
            </ul>
            <p>Reação depois de procedimento, reclamação ou pedido para falar com alguém vão direto para a equipe.</p>
          </div>
        </section>

        <section className="card atd-chat">
          <div className="atd-chat-topo">
            <div>
              <b>Converse como se fosse uma cliente</b>
              <span>Simulação: nada entra na agenda.</span>
            </div>
            <button className="btn btn-g btn-s" onClick={() => agir(api.recomecarTeste)} disabled={pensando}>
              <RotateCcw size={14} /> Recomeçar
            </button>
          </div>
          <input className="atd-fone" value={fone} type="tel" inputMode="tel" aria-label="WhatsApp de quem escreve, opcional"
                 placeholder="WhatsApp de quem escreve (opcional, para testar como cliente cadastrada)"
                 onChange={e => setFone(e.target.value)} />

          <div className="atd-msgs">
            {!conversa?.mensagens?.length && (
              <p className="atd-vazio">Escreva como uma cliente escreveria: "oi, quanto custa a limpeza de pele?" ou "tem horário sábado de manhã?"</p>
            )}
            {(conversa?.mensagens || []).map(m => (
              <Mensagem key={m.id} m={m}
                        aoAprovar={() => agir(() => api.aprovarResposta(m.id))}
                        aoDescartar={() => agir(() => api.descartarResposta(m.id))} />
            ))}
            {pensando && <div className="atd-msg ia"><div className="atd-balao atd-digitando"><i /><i /><i /></div></div>}
            {conversa?.estado === 'equipe' && (
              <div className="atd-equipe">
                <UserRound size={15} aria-hidden="true" />
                <span>Com a equipe{conversa.motivo ? ` · ${conversa.motivo.rotulo}` : ''}. A IA não responde mais nesta conversa.</span>
                <button className="btn btn-g btn-s" onClick={() => agir(() => api.devolverParaIA(conversa.id))}>Devolver para a IA</button>
              </div>
            )}
            <div ref={fim} />
          </div>

          <div className="atd-escrever">
            <input value={texto} aria-label="Mensagem da cliente" placeholder="Mensagem da cliente…" disabled={pensando}
                   onChange={e => setTexto(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') enviar(); }} />
            <button className="btn btn-p" onClick={enviar} disabled={!texto.trim() || pensando} aria-label="Enviar">
              <Send size={16} />
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function Mensagem({ m, aoAprovar, aoDescartar }) {
  const daIA = m.autor !== 'cliente';
  const r = m.revisao || {};
  return (
    <div className={'atd-msg ' + (daIA ? 'ia' : 'cliente') + (m.status === 'descartada' ? ' descartada' : '')}>
      {daIA && <span className="atd-autor"><Bot size={13} aria-hidden="true" /> Assistente</span>}
      <div className="atd-balao">{m.texto}</div>
      {daIA && (r.regras?.length > 0 || r.equipe || r.tentativas > 1) && (
        <div className="atd-revisao">
          {r.tentativas > 1 && !r.seguro && <span>Corrigida pela revisão antes de sair</span>}
          {r.seguro && <span>Texto fixo da clínica — a IA não respondeu</span>}
          {(r.regras || []).map(x => <span key={x.codigo} className="atd-regra">{x.rotulo}</span>)}
          {r.equipe && <span className="atd-regra">{r.equipe.rotulo}</span>}
        </div>
      )}
      {m.status === 'sugerida' && (
        <div className="atd-acoes">
          <button className="btn btn-p btn-s" onClick={aoAprovar}><Check size={14} /> Aprovar</button>
          <button className="btn btn-g btn-s" onClick={aoDescartar}><X size={14} /> Descartar</button>
        </div>
      )}
      {m.status === 'descartada' && <span className="atd-status">Descartada</span>}
    </div>
  );
}
