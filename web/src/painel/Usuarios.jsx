import { useCallback, useEffect, useState } from 'react';
import { Modal, useJanela } from './Base.jsx';
import { Copy, Link2, MessageCircle, Plus, ShieldCheck, Trash2, User as UserIcon, Headset } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Quem entra no painel e com qual papel.
 *
 * Três papéis. Dona (ou sócia) vê o negócio inteiro; recepção vê a agenda de
 * todas e as clientes, sem o caixa nem a comissão de ninguém; profissional vê
 * o que é dela — a própria agenda e a própria produção. O que cada um pode de
 * verdade está em `PODERES` (`server/src/lib/auth.js`): esta tela só descreve.
 *
 * Cada pessoa tem o próprio e-mail e a própria senha, e o jeito bom de dar
 * acesso é o **convite**: a dona gera um link, manda pelo WhatsApp, e a pessoa
 * cria a senha dela. Digitar a senha pela pessoa continua existindo para quem
 * está lado a lado no balcão.
 */
export const PAPEIS = {
  dono: {
    nome: 'Dona ou sócia', curto: 'Dona',
    explica: 'Agenda de todas, financeiro completo, cadastros, o site e quem entra no painel. As mesmas permissões que as suas.',
    Icone: ShieldCheck,
  },
  recepcao: {
    nome: 'Recepção', curto: 'Recepção',
    explica: 'Agenda de todas, clientes e receber no balcão. Não vê o caixa da empresa, a comissão de ninguém, as fichas de saúde, nem mexe em serviços, equipe ou site.',
    Icone: Headset,
  },
  funcionario: {
    nome: 'Profissional', curto: 'Profissional',
    explica: 'A própria agenda e a própria produção e comissão. Não vê o caixa da empresa nem a agenda das colegas.',
    Icone: UserIcon,
  },
};

export default function Usuarios({ dados, eu, aviso, irPara }) {
  const [lista, setLista] = useState(null);
  const [edit, setEdit] = useState(null);
  // O link que acabou de sair, esperando ser copiado ou mandado.
  const [convite, setConvite] = useState(null);

  const carregar = useCallback(async () => {
    try { setLista(await api.usuarios()); }
    catch (e) { aviso(e.message); setLista([]); }
  }, [aviso]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async u => {
    try {
      const salvo = await api.salvarUsuario(u);
      await carregar();
      setEdit(null);
      if (salvo?.convite) setConvite({ nome: salvo.nome, link: salvo.convite });
      return true;
    } catch (e) { aviso(e.message); return false; }
  };

  const gerarLink = async u => {
    try {
      const r = await api.conviteDoUsuario(u.id);
      setEdit(null);
      setConvite({ nome: u.nome, link: r.convite });
    } catch (e) { aviso(e.message); }
  };

  const remover = async u => {
    // Apagar acesso é irreversível e a pessoa perde a entrada na hora; um
    // clique errado na lista não pode bastar.
    const pergunta = `Apagar o acesso de ${u.nome}?\n\n`
      + 'Ela perde a entrada no painel imediatamente. '
      + 'Os atendimentos e comissões dela continuam no sistema.';
    if (!confirm(pergunta)) return;
    try {
      await api.removerUsuario(u.id);
      await carregar();
      setEdit(null);
    } catch (e) { aviso(e.message); }
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Acesso ao painel</h2>
          <div className="sub">Cada pessoa com o próprio e-mail e senha, vendo só o que o papel dela permite</div>
        </div>
        <button className="btn btn-p btn-s"
                onClick={() => setEdit({ nome: '', email: '', senha: '', papel: 'funcionario', profissionalId: '', convite: true })}>
          <Plus size={16} /> Nova pessoa
        </button>
      </div>

      {lista === null && <p className="p-fraco" style={{ padding: 20 }}>Carregando…</p>}

      {lista?.map(u => {
        const prof = dados.staff.find(p => p.id === u.profissionalId);
        const papel = PAPEIS[u.papel] || PAPEIS.funcionario;
        return (
          <div key={u.id} className={'card usr' + (u.ativo ? '' : ' off')}>
            <span className={'usr-marca ' + u.papel}><papel.Icone size={17} /></span>
            <div className="usr-txt">
              <div className="usr-nome">
                {u.nome}
                <span className={'usr-papel ' + u.papel}>{papel.curto}</span>
                {u.id === eu.id && <span className="usr-voce">você</span>}
                {!u.ativo && <span className="usr-off">desativado</span>}
              </div>
              <div className="usr-sub">
                {u.email}
                {u.papel === 'funcionario' && ` · vê o que é de ${prof?.nome || '—'}`}
                {u.papel !== 'funcionario' && prof && ` · também atende como ${prof.nome.split(' ')[0]}`}
              </div>
            </div>
            <button className="btn btn-g btn-s" onClick={() => setEdit({ ...u, senha: '' })}>Editar</button>
          </div>
        );
      })}

      {lista?.length === 0 && <p className="p-fraco" style={{ padding: 20 }}>Ninguém cadastrado ainda.</p>}

      {edit && (
        <EditarUsuario
          u={edit} staff={dados.staff} eu={eu}
          comAcesso={new Set((lista || []).filter(x => x.id !== edit.id && x.profissionalId).map(x => x.profissionalId))}
          irParaEquipe={irPara && (() => { setEdit(null); irPara('equipe'); })}
          aoSalvar={salvar} aoRemover={remover} aoGerarLink={gerarLink} fechar={() => setEdit(null)}
        />
      )}

      {convite && (
        <LinkDeConvite {...convite} empresa={dados.config?.nome} aviso={aviso} fechar={() => setConvite(null)} />
      )}
    </>
  );
}

function EditarUsuario({ u, staff, eu, comAcesso, irParaEquipe, aoSalvar, aoRemover, aoGerarLink, fechar }) {
  const janela = useJanela(fechar);
  const [f, setF] = useState({ ...u });
  const [ocupado, setOcupado] = useState(false);
  const novo = !u.id;
  const souEu = u.id === eu.id;
  const comConvite = novo && f.convite;

  const enviar = async e => {
    e.preventDefault();
    setOcupado(true);
    const corpo = { ...f };
    // Senha em branco na edição significa "não mexer", não "apagar".
    if (!novo && !corpo.senha) delete corpo.senha;
    if (comConvite) delete corpo.senha;
    if (!novo) delete corpo.convite;
    if (!(await aoSalvar(corpo))) setOcupado(false);
  };

  return (
    <div className="ovl" onClick={fechar}>
      <form ref={janela} tabIndex={-1} role="dialog" aria-modal="true" className="modal" onClick={e => e.stopPropagation()} onSubmit={enviar}>
        <h2 style={{ fontSize: 24, marginBottom: 18 }}>
          {novo ? 'Nova pessoa no painel' : f.nome}
        </h2>

        <div className="mfield">
          <label htmlFor="u-nome">Nome</label>
          <input id="u-nome" required value={f.nome}
                 onChange={e => setF(v => ({ ...v, nome: e.target.value }))} />
        </div>

        {novo && (
          <div className="mfield">
            <label htmlFor="u-email">E-mail</label>
            <input id="u-email" type="email" required value={f.email}
                   onChange={e => setF(v => ({ ...v, email: e.target.value }))} />
            <span className="add-ajuda" style={{ marginTop: 5 }}>
              É com ele que a pessoa entra. Cada uma tem o seu: e-mail dividido é senha dividida.
            </span>
          </div>
        )}

        <div className="mfield" role="group" aria-labelledby="u-papel-t">
          <label id="u-papel-t">Papel</label>
          <div className="usr-papeis">
            {Object.entries(PAPEIS).map(([valor, p]) => (
              <button key={valor} type="button" aria-pressed={f.papel === valor}
                      className={'usr-opcao' + (f.papel === valor ? ' on' : '')}
                      disabled={souEu}
                      onClick={() => setF(v => ({ ...v, papel: valor }))}>
                <p.Icone size={17} aria-hidden="true" />
                <span><b>{p.nome}</b><i>{p.explica}</i></span>
              </button>
            ))}
          </div>
          {souEu && (
            <span className="add-ajuda" style={{ marginTop: 6 }}>
              Você não pode mudar o próprio acesso — sem dona, ninguém volta a promover.
            </span>
          )}
        </div>

        <div className="mfield">
          <label htmlFor="u-prof">
            {f.papel === 'funcionario' ? 'Quem é na equipe' : 'Também atende? (opcional)'}
          </label>
          <select id="u-prof" required={f.papel === 'funcionario'} value={f.profissionalId || ''}
                  onChange={e => setF(v => ({ ...v, profissionalId: e.target.value }))}>
            <option value="">{f.papel === 'funcionario' ? 'Escolha…' : 'Não atende'}</option>
            {staff.map(p => (
              <option key={p.id} value={p.id}>{p.nome}{comAcesso?.has(p.id) ? ' · já tem acesso' : ''}</option>
            ))}
          </select>
          <span className="add-ajuda" style={{ marginTop: 5 }}>
            {f.papel === 'funcionario'
              ? 'É por aqui que o sistema sabe qual agenda e qual produção são dela.'
              : 'Para a sócia que também atende: liga o acesso à agenda dela na equipe.'}
          </span>
          {/* A profissional (quem atende) e o acesso (o login) são duas coisas, e
              a primeira vem antes: sem ela cadastrada, a lista acima não a tem e
              a dona ficava sem saber por quê. */}
          {f.papel === 'funcionario' && (
            <p className="usr-ordem">
              Não está na lista? Cadastre-a primeiro em <b>Profissionais</b> — lá
              mesmo, na ficha dela, dá para mandar o link de acesso.
              {irParaEquipe && (
                <button type="button" className="btn btn-g btn-s" onClick={irParaEquipe}>
                  Ir para Profissionais
                </button>
              )}
            </p>
          )}
        </div>

        {novo && (
          <div className="mfield" role="group" aria-labelledby="u-senha-t">
            <label id="u-senha-t">Senha</label>
            <div className="chips">
              <button type="button" className={'chip' + (f.convite ? ' on' : '')} aria-pressed={!!f.convite}
                      onClick={() => setF(v => ({ ...v, convite: true }))}>
                Ela cria, por um link
              </button>
              <button type="button" className={'chip' + (!f.convite ? ' on' : '')} aria-pressed={!f.convite}
                      onClick={() => setF(v => ({ ...v, convite: false }))}>
                Eu digito agora
              </button>
            </div>
            <span className="add-ajuda" style={{ marginTop: 6 }}>
              {f.convite
                ? 'Você recebe um link para mandar pelo WhatsApp (vale por sete dias). Ela abre, cria a senha e entra — a senha nunca passa por você.'
                : 'Ao menos 8 caracteres. Passe para a pessoa e peça que troque.'}
            </span>
          </div>
        )}

        {(!novo || !f.convite) && (
          <div className="mfield">
            <label htmlFor="u-senha">{novo ? 'Senha inicial' : 'Nova senha'}</label>
            <input id="u-senha" type="password" minLength={8} required={novo}
                   autoComplete="new-password" value={f.senha || ''}
                   placeholder={novo ? '' : 'deixe vazio para manter a atual'}
                   onChange={e => setF(v => ({ ...v, senha: e.target.value }))} />
            {!novo && (
              <span className="add-ajuda" style={{ marginTop: 5 }}>
                Trocar a senha encerra as sessões abertas desta pessoa.
              </span>
            )}
          </div>
        )}

        {!novo && !souEu && f.ativo && (
          <button type="button" className="btn btn-g btn-s" style={{ marginBottom: 16 }}
                  onClick={() => aoGerarLink(u)}>
            <Link2 size={15} aria-hidden="true" /> Gerar link para ela criar a senha
          </button>
        )}

        {!novo && !souEu && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Switch on={f.ativo} rotulo="Acesso ativo" onChange={() => setF(v => ({ ...v, ativo: !v.ativo }))} />
            <span style={{ fontSize: 14 }}>
              Pode entrar {!f.ativo && <span style={{ color: 'var(--muted)' }}>— desativado não faz login</span>}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : comConvite ? 'Criar e gerar o link' : novo ? 'Criar acesso' : 'Salvar'}
          </button>
          <button className="btn btn-g" type="button" onClick={fechar}>Cancelar</button>
          {!novo && !souEu && (
            <button className="btn btn-g btn-erro" type="button"
                    title="Apagar acesso" aria-label="Apagar acesso" onClick={() => aoRemover(u)}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * O link que a dona manda para a pessoa. Aparece uma vez: o servidor guarda só
 * o hash, então fechar sem copiar é gerar outro depois (que invalida este).
 */
export function LinkDeConvite({ nome, link, empresa, aviso, fechar }) {
  const primeiro = (nome || '').split(' ')[0];
  const texto = `Oi, ${primeiro}! Este é o seu acesso ao painel${empresa ? ` de ${empresa}` : ''}. `
    + `Abra o link, crie a sua senha e entre com o seu e-mail: ${link}`;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); aviso?.('Link copiado'); }
    catch { /* sem área de transferência: o link continua à vista para copiar à mão */ }
  };
  return (
    <Modal onClose={fechar}>
      <h2 style={{ fontSize: 22, marginBottom: 6 }}>Link de {primeiro}</h2>
      <p className="usr-link-ajuda">
        Mande para ela. Vale por sete dias e uma vez só; depois de criar a senha, ela entra
        com o próprio e-mail. Se perder, gere outro em Editar.
      </p>
      <input className="usr-link" readOnly value={link} aria-label="Link do convite"
             onFocus={e => e.target.select()} />
      <div className="usr-link-botoes">
        <a className="btn btn-p" href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
           target="_blank" rel="noopener noreferrer">
          <MessageCircle size={16} aria-hidden="true" /> Mandar no WhatsApp
        </a>
        <button className="btn btn-g" type="button" onClick={copiar}>
          <Copy size={16} aria-hidden="true" /> Copiar
        </button>
      </div>
    </Modal>
  );
}

const Switch = ({ on, onChange, rotulo }) => (
  <button type="button" className={'sw' + (on ? ' on' : '')} onClick={onChange}
          role="switch" aria-checked={on} aria-label={rotulo}>
    <span />
  </button>
);
