import { useMemo, useState } from 'react';
import { ImageOff, Plus, Tag, Trash2, Upload } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { prepararImagem } from '../shared/imagem.js';
import { brl } from '../shared/formato.js';

/**
 * Promoções: pacote de serviços com preço fechado.
 *
 * Quem atende também cria — foi decisão do negócio, e por isso esta tela não
 * tem guarda de papel: é a pessoa no balcão que sabe qual serviço está parado e
 * vale empurrar junto.
 *
 * A economia nunca é digitada. A empresa escolhe os serviços e o preço do
 * pacote; a conta aparece sozinha enquanto ela mexe, porque é esse número que
 * vira o argumento de venda na tela da cliente.
 */
export default function Combos({ dados, acao, aviso }) {
  const [edit, setEdit] = useState(null);
  const combos = dados.combos || [];

  const remover = async c => {
    if (!confirm(`Tirar "${c.nome}" do ar?\n\nOs agendamentos já vendidos continuam valendo.`)) return;
    await acao(() => api.removerCombo(c.id), 'Promoção arquivada');
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Promoções</h2>
          <div className="sub">Pacotes com preço melhor que a soma dos avulsos</div>
        </div>
        <button className="btn btn-p btn-s" onClick={() => setEdit(vazio())}>
          <Plus size={16} /> Nova promoção
        </button>
      </div>

      {combos.length === 0 && (
        <div className="card" style={{ padding: 34, textAlign: 'center' }}>
          <p className="p-fraco" style={{ marginBottom: 6 }}>Nenhuma promoção cadastrada.</p>
          <p className="add-ajuda" style={{ margin: 0 }}>
            Combo serve para vender o serviço parado junto do que já tem procura.
          </p>
        </div>
      )}

      <div className="list">
        {combos.map(c => (
          <div key={c.id} className={'li combo-li' + (fora(c) ? ' off' : '')}>
            <span className="combo-selo"><Tag size={15} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">
                {c.nome}
                {situacao(c) && <span className="combo-tag">{situacao(c)}</span>}
              </div>
              <div className="mt">
                <span>{c.servicos.map(s => s.nome).join(' + ')}</span>
                <span>{c.duracao} min</span>
                {c.validoAte && <span>até {c.validoAte.split('-').reverse().join('/')}</span>}
              </div>
            </div>
            <div className="combo-preco">
              <span className="combo-cheio">{brl(c.precoCheio)}</span>
              <b className="mono">{brl(c.preco)}</b>
            </div>
            <button className="btn btn-g btn-s" onClick={() => setEdit(paraForm(c))}>Editar</button>
          </div>
        ))}
      </div>

      {edit && (
        <Editar
          f0={edit} servicos={dados.servicos.filter(s => s.ativo)}
          fechar={() => setEdit(null)} aviso={aviso}
          aoSalvar={async f => {
            const ok = await acao(
              () => api.salvarCombo(f),
              f.id ? 'Promoção atualizada' : 'Promoção criada'
            );
            if (ok) setEdit(null);
            return ok;
          }}
          aoRemover={edit.id ? () => remover(edit) : null}
        />
      )}
    </>
  );
}

const vazio = () => ({ nome: '', descricao: '', preco: '', servicosIds: [], validoAte: '', foto: '', ativo: true });

const paraForm = c => ({
  id: c.id, nome: c.nome, descricao: c.descricao || '', preco: String(c.preco),
  servicosIds: c.servicos.map(s => s.id), validoAte: c.validoAte || '',
  foto: c.foto || '', ativo: c.ativo,
});

const fora = c => !c.ativo || c.vencido;
const situacao = c => (!c.ativo ? 'arquivada' : c.vencido ? 'vencida' : '');

function Editar({ f0, servicos, fechar, aoSalvar, aoRemover, aviso }) {
  const [f, setF] = useState(f0);
  const [ocupado, setOcupado] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const muda = patch => setF(v => ({ ...v, ...patch }));

  // Mesma trilha das fotos de serviço: encolhe no navegador antes de subir, e
  // o nome do arquivo é decidido pelo servidor.
  const enviarFoto = async e => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setSubindo(true);
    try {
      const { url } = await api.enviarImagem(await prepararImagem(arquivo, { largura: 900 }), 'combo');
      muda({ foto: url });
    } catch (erro) { aviso(erro.message); }
    finally { setSubindo(false); }
  };

  // A mesma conta que o servidor faz, para a empresa ver o resultado enquanto
  // decide o preço. Quem manda continua sendo o servidor: ele recusa pacote
  // sem vantagem, e a tela aqui só evita a viagem.
  const conta = useMemo(() => {
    const escolhidos = servicos.filter(s => f.servicosIds.includes(s.id));
    const cheio = escolhidos.reduce((n, s) => n + Number(s.preco), 0);
    const preco = Number(String(f.preco).replace(',', '.'));
    const duracao = escolhidos.reduce((n, s) => n + s.duracao + (s.intervalo || 0), 0);
    return {
      cheio, duracao, escolhidos,
      economia: Number.isFinite(preco) && preco > 0 ? cheio - preco : null,
    };
  }, [f.servicosIds, f.preco, servicos]);

  const alternar = id => muda({
    servicosIds: f.servicosIds.includes(id)
      ? f.servicosIds.filter(x => x !== id)
      : [...f.servicosIds, id],
  });

  const enviar = async e => {
    e.preventDefault();
    if (f.servicosIds.length < 2) return aviso('Escolha ao menos dois serviços.');
    if (!(conta.economia > 0)) return aviso(`O pacote precisa custar menos que ${brl(conta.cheio)}.`);
    setOcupado(true);
    if (!(await aoSalvar({ ...f, preco: Number(String(f.preco).replace(',', '.')) }))) setOcupado(false);
  };

  return (
    <div className="ovl" onClick={fechar}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={enviar}>
        <h2 style={{ fontSize: 24, marginBottom: 18 }}>
          {f.id ? f.nome : 'Nova promoção'}
        </h2>

        <div className="mfield">
          <label htmlFor="cb-nome">Nome da promoção</label>
          <input id="cb-nome" required value={f.nome} placeholder="Dia de princesa"
                 onChange={e => muda({ nome: e.target.value })} />
        </div>

        <div className="mfield">
          <label>O que entra no pacote</label>
          <div className="chips chips-rolagem">
            {servicos.map(s => (
              <button key={s.id} type="button"
                      className={'chip chip-cat' + (f.servicosIds.includes(s.id) ? ' on' : '')}
                      onClick={() => alternar(s.id)}>
                {s.nome} <span className="chip-n">{brl(s.preco)}</span>
              </button>
            ))}
          </div>
          <span className="add-ajuda" style={{ marginTop: 6, display: 'block' }}>
            {f.servicosIds.length < 2
              ? 'Ao menos dois — pacote de um serviço só é o avulso com outro nome.'
              : `A cliente faz nesta ordem, ${conta.duracao} min no total, com a mesma profissional.`}
          </span>
        </div>

        <div className="mfield">
          <label htmlFor="cb-preco">Preço do pacote</label>
          <input id="cb-preco" required inputMode="decimal" value={f.preco}
                 placeholder="0,00" onChange={e => muda({ preco: e.target.value })} />
        </div>

        {/* O argumento de venda, calculado — não digitado. */}
        {conta.escolhidos.length >= 2 && (
          <div className={'combo-conta' + (conta.economia > 0 ? ' ok' : ' ruim')}>
            <div><span>Avulso</span><b className="mono">{brl(conta.cheio)}</b></div>
            <div>
              <span>{conta.economia > 0 ? 'A cliente economiza' : 'Sem vantagem'}</span>
              <b className="mono">
                {conta.economia > 0
                  ? brl(conta.economia)
                  : 'o pacote precisa custar menos'}
              </b>
            </div>
          </div>
        )}

        <div className="mfield">
          <label htmlFor="cb-ate">Válida até</label>
          <input id="cb-ate" type="date" value={f.validoAte}
                 onChange={e => muda({ validoAte: e.target.value })} />
          <span className="add-ajuda" style={{ marginTop: 5 }}>
            Em branco, fica no ar até você arquivar. Com data, some do site
            sozinha no dia seguinte — promoção de Natal não pode aparecer em março.
          </span>
        </div>

        <div className="mfield">
          <label>Foto</label>
          <div className="cb-foto">
            {f.foto
              ? <img src={f.foto} alt="" />
              : <span className="cb-foto-vazia"><ImageOff size={18} /></span>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label className="btn btn-g btn-s" style={{ cursor: 'pointer' }}>
                <Upload size={15} /> {subindo ? 'Enviando…' : f.foto ? 'Trocar' : 'Escolher'}
                <input type="file" accept="image/*" hidden onChange={enviarFoto} disabled={subindo} />
              </label>
              {f.foto && (
                <button type="button" className="btn btn-g btn-s" onClick={() => muda({ foto: '' })}>
                  Remover
                </button>
              )}
            </div>
          </div>
          <span className="add-ajuda" style={{ marginTop: 5 }}>
            Sem foto, o cartão da promoção mostra só o texto — funciona, mas
            chama menos atenção que os serviços em volta.
          </span>
        </div>

        <div className="mfield">
          <label htmlFor="cb-desc">Chamada (opcional)</label>
          <input id="cb-desc" value={f.descricao} maxLength={120}
                 placeholder="Cuide do rosto inteiro num horário só"
                 onChange={e => muda({ descricao: e.target.value })} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : f.id ? 'Salvar' : 'Criar promoção'}
          </button>
          <button className="btn btn-g" type="button" onClick={fechar}>Cancelar</button>
          {aoRemover && (
            <button className="btn btn-g" type="button" style={{ color: '#8A2B2B' }}
                    title="Tirar do ar" onClick={aoRemover}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
