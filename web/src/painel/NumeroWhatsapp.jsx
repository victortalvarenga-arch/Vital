import { useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { Campo } from './Base.jsx';

/**
 * O número de WhatsApp desta empresa, para as mensagens saírem sozinhas.
 *
 * Por enquanto a dona cola o id do número e o token que tira da Meta; quando a
 * Vital tiver o cadastro incorporado (ROADMAP, Bloco 12), um botão entra no
 * lugar do formulário e o resto desta tela continua igual. Só o dono chega
 * aqui: a rota é `exige('site')`, e o token nunca volta para a tela.
 */
export default function NumeroWhatsapp({ aviso, aoMudar }) {
  const [info, setInfo] = useState(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = async () => {
    try {
      const contas = await api.conexoes();
      setInfo(contas.find(c => c.provedor === 'whatsapp') || null);
      setFalhou(false);
    } catch { setFalhou(true); }
  };
  useEffect(() => { carregar(); }, []);

  const mudou = () => { carregar(); aoMudar(); };

  const verificar = async () => {
    try { await api.sincronizarConexao('whatsapp'); aviso('Número conferido'); }
    catch (erro) { aviso(erro.message); }
    mudou();
  };
  const desconectar = async () => {
    if (!window.confirm('Desconectar o número? As mensagens voltam a ser enviadas uma a uma, pelo link.')) return;
    try { await api.desconectar('whatsapp'); aviso('Número desconectado'); }
    catch (erro) { aviso(erro.message); }
    mudou();
  };

  if (falhou) return <div className="rs-falha">Não deu para carregar o número agora. Recarregue a página.</div>;
  if (!info) return null;

  if (!info.conectado && !info.disponivel) {
    return (
      <div className="cx">
        <p className="cx-txt">Conecte o número da empresa para as mensagens saírem sozinhas.</p>
        <p className="cs-dica">Em breve: a Vital está liberando esta conexão.</p>
      </div>
    );
  }

  return (
    <>
      {info.conectado && (
        <div className={'cx' + (info.situacao === 'erro' ? ' cx-falha' : '')}>
          <div className="cx-cab">
            <span className="cx-ponto" aria-hidden="true" />
            <div>
              <b>{info.conta || 'Número conectado'}</b>
              <span className="cs-dica">
                {info.situacao === 'erro'
                  ? 'Com problema: as mensagens voltaram a sair pelo link.'
                  : 'As mensagens saem sozinhas por este número.'}
              </span>
            </div>
          </div>
          {info.situacao === 'erro' && <p className="cx-erro">{info.erro}</p>}
          <div className="cx-btns">
            {info.situacao === 'ok' && (
              <button className="btn btn-g btn-s" onClick={verificar}>
                <RefreshCw size={14} aria-hidden="true" /> Conferir agora
              </button>
            )}
            <button className="btn btn-g btn-s btn-erro" onClick={desconectar}>Desconectar</button>
          </div>
        </div>
      )}
      {(!info.conectado || info.situacao === 'erro') && (
        <Formulario denovo={info.conectado} aviso={aviso} aoConectar={mudou} />
      )}
    </>
  );
}

function Formulario({ denovo, aviso, aoConectar }) {
  const [f, setF] = useState({ phoneId: '', token: '' });
  const [erro, setErro] = useState(null);       // { campo, texto }
  const [indo, setIndo] = useState(false);
  const campos = { phoneId: useRef(null), token: useRef(null) };

  const falhar = (campo, texto) => {
    setErro({ campo, texto });
    campos[campo]?.current?.focus();
  };

  const conectar = async () => {
    if (indo) return;
    if (!/^\d+$/.test(f.phoneId.trim())) return falhar('phoneId', 'Cole o id do número: só dígitos, sem espaço nem +55.');
    if (!f.token.trim()) return falhar('token', 'Cole o token de acesso.');
    setErro(null);
    setIndo(true);
    try {
      await api.conectarWhatsapp(f.phoneId, f.token);
      aviso('WhatsApp conectado');
      aoConectar();
    } catch (e) {
      // A recusa da Meta quase sempre é o token, e é onde o erro fica mais útil.
      falhar('token', e.message);
    } finally {
      setIndo(false);
    }
  };

  const erroDe = campo => (erro?.campo === campo ? erro.texto : '');
  const ligar = campo => ({
    ref: campos[campo],
    'aria-invalid': erroDe(campo) ? true : undefined,
    'aria-describedby': erroDe(campo) ? `wz-erro-${campo}` : undefined,
  });

  return (
    <div className="cx">
      <p className="cx-txt">
        {denovo ? 'Cole os dados de novo para voltar a enviar sozinho.'
          : 'Conecte o número da empresa para as mensagens saírem sozinhas. Enquanto não conectar, cada uma é enviada pelo link, na fila.'}
      </p>
      <p className="cs-dica">Os dois dados ficam no painel do WhatsApp Business, na Meta. O token é guardado cifrado e não aparece mais depois de salvo.</p>
      <div className="wz-campos">
        <Campo label="ID do número">
          <input inputMode="numeric" autoComplete="off" value={f.phoneId} {...ligar('phoneId')}
                 onChange={e => setF(v => ({ ...v, phoneId: e.target.value }))} />
        </Campo>
        {erroDe('phoneId') && <p id="wz-erro-phoneId" className="cx-erro">{erroDe('phoneId')}</p>}
        <Campo label="Token de acesso">
          <input type="password" autoComplete="off" value={f.token} {...ligar('token')}
                 onChange={e => setF(v => ({ ...v, token: e.target.value }))} />
        </Campo>
        {erroDe('token') && <p id="wz-erro-token" className="cx-erro">{erroDe('token')}</p>}
      </div>
      <button className="btn btn-p btn-s" onClick={conectar}>
        <Link2 size={14} aria-hidden="true" /> {indo ? 'Conferindo com a Meta…' : 'Conectar número'}
      </button>
    </div>
  );
}
