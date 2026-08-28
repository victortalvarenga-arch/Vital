import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, User as UserIcon } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Quem entra no painel e com qual papel.
 *
 * Dois papéis, de propósito: dono vê o negócio inteiro, funcionário vê o que é
 * dele — a própria agenda e a própria produção. Um meio-termo existia e saiu,
 * porque estúdio pequeno não tem essa pessoa e cada papel a mais é uma regra a
 * manter coerente entre tela e rota.
 */
export default function Usuarios({ dados, eu, aviso }) {
  const [lista, setLista] = useState(null);
  const [edit, setEdit] = useState(null);

  const carregar = useCallback(async () => {
    try { setLista(await api.usuarios()); }
    catch (e) { aviso(e.message); setLista([]); }
  }, [aviso]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async u => {
    try {
      await api.salvarUsuario(u);
      await carregar();
      setEdit(null);
      return true;
    } catch (e) { aviso(e.message); return false; }
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Acesso ao painel</h2>
          <div className="sub">Quem entra, com qual senha e vendo o quê</div>
        </div>
        <button className="btn btn-p btn-s"
                onClick={() => setEdit({ nome: '', email: '', senha: '', papel: 'funcionario', profissionalId: '' })}>
          <Plus size={16} /> Nova pessoa
        </button>
      </div>

      {lista === null && <p className="p-fraco" style={{ padding: 20 }}>Carregando…</p>}

      {lista?.map(u => {
        const prof = dados.staff.find(p => p.id === u.profissionalId);
        return (
          <div key={u.id} className={'card usr' + (u.ativo ? '' : ' off')}>
            <span className={'usr-marca ' + u.papel}>
              {u.papel === 'dono' ? <ShieldCheck size={17} /> : <UserIcon size={17} />}
            </span>
            <div className="usr-txt">
              <div className="usr-nome">
                {u.nome}
                {u.id === eu.id && <span className="usr-voce">você</span>}
                {!u.ativo && <span className="usr-off">desativado</span>}
              </div>
              <div className="usr-sub">
                {u.email} · {u.papel === 'dono' ? 'vê tudo do negócio' : `vê o que é de ${prof?.nome || '—'}`}
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
          aoSalvar={salvar} fechar={() => setEdit(null)}
        />
      )}
    </>
  );
}

function EditarUsuario({ u, staff, eu, aoSalvar, fechar }) {
  const [f, setF] = useState({ ...u });
  const [ocupado, setOcupado] = useState(false);
  const novo = !u.id;
  const souEu = u.id === eu.id;

  const enviar = async e => {
    e.preventDefault();
    setOcupado(true);
    const corpo = { ...f };
    // Senha em branco na edição significa "não mexer", não "apagar".
    if (!novo && !corpo.senha) delete corpo.senha;
    if (!(await aoSalvar(corpo))) setOcupado(false);
  };

  return (
    <div className="ovl" onClick={fechar}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={enviar}>
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
          </div>
        )}

        <div className="mfield">
          <label htmlFor="u-senha">{novo ? 'Senha' : 'Nova senha'}</label>
          <input id="u-senha" type="password" minLength={8} required={novo}
                 autoComplete="new-password" value={f.senha || ''}
                 placeholder={novo ? '' : 'deixe vazio para manter a atual'}
                 onChange={e => setF(v => ({ ...v, senha: e.target.value }))} />
          <span className="add-ajuda" style={{ marginTop: 5 }}>
            {novo
              ? 'Ao menos 8 caracteres. Passe para a pessoa e peça que troque.'
              : 'Trocar a senha encerra as sessões abertas desta pessoa.'}
          </span>
        </div>

        <div className="mfield">
          <label>Vê o quê</label>
          <div className="chips">
            {[
              ['dono', 'Tudo do negócio'],
              ['funcionario', 'Só o que é dela'],
            ].map(([valor, rotulo]) => (
              <button key={valor} type="button"
                      className={'chip' + (f.papel === valor ? ' on' : '')}
                      disabled={souEu}
                      onClick={() => setF(v => ({ ...v, papel: valor }))}>
                {rotulo}
              </button>
            ))}
          </div>
          <span className="add-ajuda" style={{ marginTop: 6 }}>
            {souEu
              ? 'Você não pode mudar o próprio acesso — sem dono, ninguém volta a promover.'
              : f.papel === 'dono'
                ? 'Agenda de todos, financeiro completo, cadastros e o site.'
                : 'A própria agenda e a própria produção. Não vê o caixa da empresa.'}
          </span>
        </div>

        {f.papel === 'funcionario' && (
          <div className="mfield">
            <label htmlFor="u-prof">Quem é na equipe</label>
            <select id="u-prof" required value={f.profissionalId || ''}
                    onChange={e => setF(v => ({ ...v, profissionalId: e.target.value }))}>
              <option value="">Escolha…</option>
              {staff.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <span className="add-ajuda" style={{ marginTop: 5 }}>
              É por aqui que o sistema sabe qual agenda e qual produção são dela.
            </span>
          </div>
        )}

        {!novo && !souEu && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Switch on={f.ativo} onChange={() => setF(v => ({ ...v, ativo: !v.ativo }))} />
            <span style={{ fontSize: 14 }}>
              Pode entrar {!f.ativo && <span style={{ color: 'var(--muted)' }}>— desativado não faz login</span>}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : novo ? 'Criar acesso' : 'Salvar'}
          </button>
          <button className="btn btn-g" type="button" onClick={fechar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

const Switch = ({ on, onChange }) => (
  <button type="button" className={'sw' + (on ? ' on' : '')} onClick={onChange}
          role="switch" aria-checked={on}>
    <span />
  </button>
);
