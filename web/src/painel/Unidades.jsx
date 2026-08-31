import { useState } from 'react';
import { MapPin, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Unidades: os endereços em que o negócio atende.
 *
 * A tabela existia desde o começo e nada a usava — uma empresa com duas lojas
 * conseguia cadastrá-las por SQL e mais nada.
 *
 * **A unidade é de quem atende, não do serviço.** É a profissional que ocupa
 * uma cadeira num endereço; o serviço é oferecido onde houver alguém que o
 * faça. Por isso o vínculo se escolhe na ficha da pessoa, e aqui só se mostra
 * quem já está em cada lugar.
 *
 * Quem está sem unidade atende em qualquer uma. É o estado de toda a equipe de
 * antes desta tela existir, e o que impede que cadastrar a primeira unidade
 * faça a equipe sumir do site.
 */
export default function Unidades({ dados, acao, aviso }) {
  const [edit, setEdit] = useState(null);
  const unidades = dados.unidades || [];
  const semUnidade = dados.staff.filter(p => p.ativo && !p.unidadeId);

  const arquivar = async u => {
    if (!confirm(`Tirar "${u.nome}" do ar?\n\nOs atendimentos que aconteceram lá continuam no histórico.`)) return;
    try {
      const r = await api.removerUnidade(u.id);
      await acao(async () => {}, 'Unidade arquivada');
      if (r.semUnidade?.length) {
        aviso(`${r.semUnidade.join(', ')} ficou sem unidade — escolha outra na ficha.`);
      }
      setEdit(null);
    } catch (e) { aviso(e.message); }
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Unidades</h2>
          <div className="sub">Os endereços em que vocês atendem</div>
        </div>
        <button className="btn btn-p btn-s" onClick={() => setEdit(vazia())}>
          <Plus size={16} /> Nova unidade
        </button>
      </div>

      {unidades.length === 0 && (
        <div className="card" style={{ padding: 34, textAlign: 'center' }}>
          <p className="p-fraco" style={{ marginBottom: 6 }}>Nenhuma unidade cadastrada.</p>
          <p className="add-ajuda" style={{ margin: 0 }}>
            Com uma loja só, não precisa: o sistema funciona igual. Cadastre quando
            houver um segundo endereço — aí a cliente escolhe onde quer ser atendida.
          </p>
        </div>
      )}

      <div className="list">
        {unidades.map(u => {
          const equipe = dados.staff.filter(p => p.ativo && p.unidadeId === u.id);
          return (
            <div key={u.id} className={'li und' + (u.ativo ? '' : ' off')}>
              <span className="und-marca"><MapPin size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">
                  {u.nome}
                  {!u.ativo && <span className="und-tag">arquivada</span>}
                </div>
                <div className="mt">
                  {u.endereco && <span>{u.endereco}</span>}
                  <span>
                    <Users size={12} style={{ verticalAlign: -2 }} />{' '}
                    {equipe.length === 0
                      ? 'ninguém vinculado'
                      : equipe.map(p => p.nome.split(' ')[0]).join(', ')}
                  </span>
                </div>
              </div>
              <button className="btn btn-g btn-s" onClick={() => setEdit({ ...u })}>Editar</button>
            </div>
          );
        })}
      </div>

      {unidades.some(u => u.ativo) && semUnidade.length > 0 && (
        <p className="add-ajuda" style={{ marginTop: 14 }}>
          {semUnidade.map(p => p.nome.split(' ')[0]).join(', ')}{' '}
          {semUnidade.length === 1 ? 'está' : 'estão'} sem unidade e{' '}
          {semUnidade.length === 1 ? 'aparece' : 'aparecem'} em todas. Se atende num
          endereço só, escolha a unidade na ficha em Profissionais.
        </p>
      )}

      {edit && (
        <Editar
          u={edit} fechar={() => setEdit(null)} aviso={aviso}
          aoSalvar={async f => {
            const ok = await acao(() => api.salvarUnidade(f), f.id ? 'Unidade salva' : 'Unidade criada');
            if (ok) setEdit(null);
            return ok;
          }}
          aoArquivar={edit.id && edit.ativo ? () => arquivar(edit) : null}
        />
      )}
    </>
  );
}

const vazia = () => ({ nome: '', endereco: '', fone: '', mapa: '', ativo: true, ordem: 0 });

function Editar({ u, fechar, aoSalvar, aoArquivar, aviso }) {
  const [f, setF] = useState(u);
  const [ocupado, setOcupado] = useState(false);
  const muda = patch => setF(v => ({ ...v, ...patch }));

  const enviar = async e => {
    e.preventDefault();
    if (f.mapa && !/^https?:\/\//.test(f.mapa)) return aviso('O link do mapa precisa começar com http.');
    setOcupado(true);
    if (!(await aoSalvar(f))) setOcupado(false);
  };

  return (
    <div className="ovl" onClick={fechar}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={enviar}>
        <h2 style={{ fontSize: 24, marginBottom: 18 }}>{f.id ? f.nome : 'Nova unidade'}</h2>

        <div className="mfield">
          <label htmlFor="un-nome">Nome</label>
          <input id="un-nome" required autoFocus value={f.nome} placeholder="Centro"
                 onChange={e => muda({ nome: e.target.value })} />
          <span className="add-ajuda" style={{ marginTop: 5 }}>
            É como a cliente vai ver na hora de escolher onde quer ser atendida.
          </span>
        </div>

        <div className="mfield">
          <label htmlFor="un-end">Endereço</label>
          <input id="un-end" value={f.endereco} placeholder="Rua XV de Novembro, 100"
                 onChange={e => muda({ endereco: e.target.value })} />
        </div>

        <div className="mrow">
          <div className="mfield">
            <label htmlFor="un-fone">Telefone</label>
            <input id="un-fone" inputMode="tel" value={f.fone}
                   onChange={e => muda({ fone: e.target.value })} />
          </div>
          <div className="mfield">
            <label htmlFor="un-ordem">Ordem na lista</label>
            <input id="un-ordem" type="number" value={f.ordem}
                   onChange={e => muda({ ordem: +e.target.value })} />
          </div>
        </div>

        <div className="mfield">
          <label htmlFor="un-mapa">Link do mapa</label>
          <input id="un-mapa" value={f.mapa} placeholder="https://maps.google.com/?q=…"
                 onChange={e => muda({ mapa: e.target.value })} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : f.id ? 'Salvar' : 'Criar unidade'}
          </button>
          <button className="btn btn-g" type="button" onClick={fechar}>Cancelar</button>
          {aoArquivar && (
            <button className="btn btn-g btn-erro" type="button"
                    title="Tirar do ar" onClick={aoArquivar}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
