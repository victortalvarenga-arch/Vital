import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Gift, ImageOff, MoreVertical, Plus, Search, Upload, X } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { prepararImagem } from '../shared/imagem.js';
import { brl } from '../shared/formato.js';
import { addDias, hojeISO } from '../shared/tempo.js';
import { quandoVale } from '../shared/promocao.js';
import { Campo, Gaveta } from './Base.jsx';
import CampoData from './CampoData.jsx';

/**
 * Promoções: pacote de serviços com preço fechado, com começo, dias da semana
 * e limite de vendas (migration 021).
 *
 * Quem atende também cria — foi decisão do negócio, e por isso esta tela não
 * tem guarda de papel: é a pessoa no balcão que sabe qual serviço está parado e
 * vale empurrar junto. Os números de dinheiro (receita, desconto) vêm do
 * servidor já recortados por `escopoDe`: o funcionário vê o que ele vendeu.
 *
 * A economia nunca é digitada. A empresa escolhe os serviços e dá o preço do
 * pacote ou o desconto em %; o outro número aparece sozinho, porque é ele que
 * vira o argumento de venda na tela da cliente.
 *
 * Situação de cada promoção vem pronta do servidor (`situacao`), para a tela e
 * a venda nunca discordarem sobre o que está no ar.
 */

const SITUACOES = {
  ativa: { rotulo: 'Ativa', tom: 'on' },
  agendada: { rotulo: 'Agendada', tom: 'espera' },
  pausada: { rotulo: 'Pausada', tom: 'off' },
  encerrada: { rotulo: 'Encerrada', tom: 'off' },
  esgotada: { rotulo: 'Esgotada', tom: 'off' },
};

const PERIODOS = {
  mes: { rotulo: 'Este mês', faixa: h => [h.slice(0, 7) + '-01', ultimoDia(h)] },
  '30d': { rotulo: 'Últimos 30 dias', faixa: h => [addDias(h, -29), h] },
  ano: { rotulo: 'Este ano', faixa: h => [h.slice(0, 4) + '-01-01', h.slice(0, 4) + '-12-31'] },
};

// Segunda primeiro, como a semana se lê no balcão.
const SEMANA = [[1, 'S'], [2, 'T'], [3, 'Q'], [4, 'Q'], [5, 'S'], [6, 'S'], [0, 'D']];
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export default function Combos({ dados, acao, aviso }) {
  const [edit, setEdit] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroServico, setFiltroServico] = useState('');
  const [periodo, setPeriodo] = useState('mes');
  const [desempenho, setDesempenho] = useState(null);
  const combos = dados.combos || [];
  const hoje = hojeISO();

  // Recarrega junto com a lista: vender ou cancelar muda os números.
  useEffect(() => {
    let vivo = true;
    const [de, ate] = PERIODOS[periodo].faixa(hoje);
    api.desempenhoCombos(de, ate)
      .then(r => { if (vivo) setDesempenho(r); })
      .catch(() => { if (vivo) setDesempenho({ total: null, porCombo: {} }); });
    return () => { vivo = false; };
  }, [periodo, combos]);

  const usosNoPeriodo = c => desempenho?.porCombo?.[c.id]?.usos || 0;

  const servicosEmPromocao = useMemo(() => {
    const m = new Map();
    for (const c of combos) for (const s of c.servicos) m.set(s.id, s.nome);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [combos]);

  const q = chave(busca.trim());
  const visiveis = combos.filter(c => {
    if (filtroStatus && !(filtroStatus === 'encerrada'
      ? ['encerrada', 'esgotada'].includes(c.situacao) : c.situacao === filtroStatus)) return false;
    if (filtroServico && !c.servicos.some(s => s.id === filtroServico)) return false;
    return !q || chave(`${c.nome} ${c.servicos.map(s => s.nome).join(' ')}`).includes(q);
  });
  const de = sit => visiveis.filter(c => sit.includes(c.situacao));
  const conta = sit => combos.filter(c => sit.includes(c.situacao)).length;

  const pausar = c => {
    setAberto(null);
    acao(() => api.salvarCombo({ ...paraForm(c), ativo: !c.ativo }), c.ativo ? 'Promoção pausada' : 'Promoção retomada');
  };
  const arquivar = async c => {
    setAberto(null);
    if (!confirm(`Arquivar "${c.nome}"?\n\nSai do site e desta lista. Os agendamentos já vendidos continuam valendo.`)) return;
    await acao(() => api.removerCombo(c.id), 'Promoção arquivada');
  };

  const menu = c => (
    <span className="pr-acoes">
      <button className="pr-mais" onClick={() => setAberto(a => a === c.id ? null : c.id)}
              aria-expanded={aberto === c.id} aria-label={`Ações de ${c.nome}`}>
        <MoreVertical size={18} />
      </button>
      {aberto === c.id && (
        <span className="pr-menu" role="menu">
          <button role="menuitem" onClick={() => { setAberto(null); setEdit(paraForm(c)); }}>Editar</button>
          <button role="menuitem" onClick={() => pausar(c)}>{c.ativo ? 'Pausar' : 'Retomar'}</button>
          <button role="menuitem" className="btn-erro" onClick={() => arquivar(c)}>Arquivar</button>
        </span>
      )}
    </span>
  );

  const linha = c => (
    <div key={c.id} className={'pr-linha' + (c.situacao === 'ativa' ? '' : ' fora')}>
      <span className="pr-ic" aria-hidden="true"><Gift size={17} /></span>
      <div className="pr-info">
        <div className="pr-topo">
          <button className="pr-nome" onClick={() => setEdit(paraForm(c))}>{c.nome}</button>
          <b className="pr-off">-{pctOff(c)}%</b>
        </div>
        <div className="pr-meta">
          {c.servicos.map(s => s.nome).join(' + ')}
          {' · '}<span className="mono">{brl(c.precoCheio)} → {brl(c.preco)}</span>
        </div>
        <div className="pr-meta">{quandoVale(c) || 'Todos os dias, sem prazo'}</div>
        <div className="pr-meta pr-uso">
          {usosNoPeriodo(c)} {usosNoPeriodo(c) === 1 ? 'utilização' : 'utilizações'} · {PERIODOS[periodo].rotulo.toLowerCase()}
          {c.limiteUsos != null && <> · <b>{c.usos} de {c.limiteUsos}</b> vagas usadas</>}
        </div>
      </div>
      <Selo c={c} />
      {menu(c)}
    </div>
  );

  const ativas = de(['ativa']);
  const proximas = de(['agendada']);
  const resto = de(['pausada', 'encerrada', 'esgotada']);
  const total = desempenho?.total;

  return (
    <>
      <div className="head">
        <div>
          <h2>Promoções</h2>
          <div className="sub">Crie e gerencie ofertas e condições especiais para seus clientes.</div>
        </div>
        <button className="btn btn-p btn-s" onClick={() => setEdit(vazio())}>
          <Plus size={16} /> Nova promoção
        </button>
      </div>

      <div className="stats pr-stats">
        <Numero rotulo="Promoções ativas" valor={conta(['ativa'])} sub="em andamento" />
        <Numero rotulo="Agendadas" valor={conta(['agendada'])} sub="próximas" />
        <Numero rotulo="Encerradas" valor={conta(['encerrada', 'esgotada'])} sub="prazo ou vagas no fim" />
        <Numero rotulo="Uso no período" valor={total ? total.usos : '—'}
                sub={`utilizações · ${PERIODOS[periodo].rotulo.toLowerCase()}`} />
      </div>

      <div className="card pr-filtros">
        <div className="pr-busca">
          <Search size={16} aria-hidden="true" />
          <input placeholder="Buscar promoção…" value={busca} onChange={e => setBusca(e.target.value)}
                 aria-label="Buscar promoção" />
        </div>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          <option value="ativa">Ativas</option>
          <option value="agendada">Agendadas</option>
          <option value="pausada">Pausadas</option>
          <option value="encerrada">Encerradas e esgotadas</option>
        </select>
        <select value={filtroServico} onChange={e => setFiltroServico(e.target.value)} aria-label="Serviço">
          <option value="">Todos os serviços</option>
          {servicosEmPromocao.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período dos números">
          {Object.entries(PERIODOS).map(([k, p]) => <option key={k} value={k}>{p.rotulo}</option>)}
        </select>
      </div>

      {combos.length === 0 && (
        <div className="card pr-vazio">
          <p>Nenhuma promoção cadastrada.</p>
          <p className="add-ajuda">Combo serve para vender o serviço parado junto do que já tem procura.</p>
        </div>
      )}

      {(ativas.length > 0 || (combos.length > 0 && !filtroStatus)) && (
        <section className="card pr-secao">
          <div className="eyebrow pr-secao-t">Promoções ativas</div>
          {ativas.length === 0 && <p className="rs-vazio">Nenhuma promoção no ar agora.</p>}
          <div className="pr-lista">{ativas.map(linha)}</div>
        </section>
      )}

      {proximas.length > 0 && (
        <section className="card pr-secao">
          <div className="eyebrow pr-secao-t">Próximas promoções</div>
          <div className="pr-cartoes">
            {proximas.map(c => (
              <div key={c.id} className="pr-cartao">
                <div className="pr-cartao-topo">
                  <span className="pr-ic" aria-hidden="true"><Gift size={16} /></span>
                  <button className="pr-nome" onClick={() => setEdit(paraForm(c))}>{c.nome}</button>
                  {menu(c)}
                </div>
                <p className="pr-cartao-oferta">{pctOff(c)}% OFF · <span className="mono">{brl(c.preco)}</span></p>
                <p className="pr-meta"><CalendarClock size={13} aria-hidden="true" /> {quandoVale(c)}</p>
                <Selo c={c} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card pr-secao">
        <div className="eyebrow pr-secao-t">Desempenho das promoções · {PERIODOS[periodo].rotulo.toLowerCase()}</div>
        <div className="stats">
          <Numero rotulo="Utilizações" valor={total ? total.usos : '—'} sub="vendas, sem as canceladas" />
          <Numero rotulo="Receita gerada" valor={total ? brl(total.receita) : '—'} sub="pelas promoções, sem faltas" />
          <Numero rotulo="Desconto concedido" valor={total ? brl(total.desconto) : '—'} sub="em descontos" />
        </div>
        {desempenho?.somenteMeu && <p className="add-ajuda pr-meu">Só os atendimentos que você fez.</p>}
      </section>

      {resto.length > 0 && (
        <details className="card pr-secao pr-resto" open={['pausada', 'encerrada'].includes(filtroStatus)}>
          <summary className="eyebrow pr-secao-t">Pausadas e encerradas ({resto.length})</summary>
          <div className="pr-lista">{resto.map(linha)}</div>
        </details>
      )}

      {edit && (
        <Editar
          f0={edit} servicos={dados.servicos.filter(s => s.ativo)}
          usos={combos.find(c => c.id === edit.id)?.usos || 0}
          fechar={() => setEdit(null)} aviso={aviso}
          aoSalvar={async f => {
            const ok = await acao(() => api.salvarCombo(f), f.id ? 'Promoção atualizada' : 'Promoção criada');
            if (ok) setEdit(null);
            return ok;
          }}
        />
      )}
    </>
  );
}

function Numero({ rotulo, valor, sub }) {
  return (
    <div className="card stat">
      <span className="eyebrow">{rotulo}</span>
      <span className="v">{valor}</span>
      <span className="pr-stat-sub">{sub}</span>
    </div>
  );
}

function Selo({ c }) {
  const s = SITUACOES[c.situacao] || SITUACOES.encerrada;
  return <span className={'pr-selo ' + s.tom}>{s.rotulo}</span>;
}

const vazio = () => ({
  nome: '', descricao: '', preco: '', servicosIds: [], validoDe: '', validoAte: '',
  diasSemana: [], limiteUsos: '', foto: '', ativo: true,
});

const paraForm = c => ({
  id: c.id, nome: c.nome, descricao: c.descricao || '', preco: String(c.preco),
  servicosIds: c.servicos.map(s => s.id), validoDe: c.validoDe || '', validoAte: c.validoAte || '',
  diasSemana: c.diasSemana || [], limiteUsos: c.limiteUsos ?? '', foto: c.foto || '', ativo: c.ativo,
});

const pctOff = c => (c.precoCheio > 0 ? Math.round((1 - c.preco / c.precoCheio) * 100) : 0);

function Editar({ f0, servicos, usos, fechar, aoSalvar, aviso }) {
  const [f, setF] = useState(f0);
  const [ocupado, setOcupado] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [limitar, setLimitar] = useState(f0.limiteUsos !== '' && f0.limiteUsos != null);
  // O que a pessoa digitou por último manda: preço ou percentual. O outro é
  // conta, e aparece pronto.
  const [pctTexto, setPctTexto] = useState('');
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
    const escolhidos = f.servicosIds.map(id => servicos.find(s => s.id === id)).filter(Boolean);
    const cheio = escolhidos.reduce((n, s) => n + Number(s.preco), 0);
    const preco = Number(String(f.preco).replace(',', '.'));
    const duracao = escolhidos.reduce((n, s) => n + s.duracao + (s.intervalo || 0), 0);
    return {
      cheio, duracao, escolhidos,
      economia: Number.isFinite(preco) && f.preco !== '' ? cheio - preco : null,
      pct: cheio > 0 && Number.isFinite(preco) && f.preco !== '' ? Math.round((1 - preco / cheio) * 1000) / 10 : null,
    };
  }, [f.servicosIds, f.preco, servicos]);

  const mudarPct = texto => {
    setPctTexto(texto);
    const p = Number(String(texto).replace(',', '.'));
    if (texto !== '' && Number.isFinite(p) && conta.cheio > 0) {
      muda({ preco: String(Math.round(conta.cheio * (1 - p / 100) * 100) / 100) });
    }
  };

  const alternar = id => muda({
    servicosIds: f.servicosIds.includes(id) ? f.servicosIds.filter(x => x !== id) : [...f.servicosIds, id],
  });
  const alternarDia = d => muda({
    diasSemana: f.diasSemana.includes(d) ? f.diasSemana.filter(x => x !== d) : [...f.diasSemana, d],
  });

  const problema =
    f.nome.trim().length < 2 ? 'Dê um nome à promoção.'
    : f.servicosIds.length < 2 ? 'Escolha ao menos dois serviços — pacote de um só é o avulso com outro nome.'
    : !(conta.economia > 0) ? `O pacote precisa custar menos que ${brl(conta.cheio)}.`
    : f.validoDe && f.validoAte && f.validoAte < f.validoDe ? 'A promoção termina antes de começar.'
    : limitar && !(Number(f.limiteUsos) >= 1) ? 'O limite precisa ser de ao menos 1 utilização.'
    : null;

  const enviar = async e => {
    e.preventDefault();
    if (problema) return aviso(problema);
    setOcupado(true);
    const ok = await aoSalvar({
      ...f,
      preco: Number(String(f.preco).replace(',', '.')),
      validoDe: f.validoDe || null, validoAte: f.validoAte || null,
      limiteUsos: limitar ? Number(f.limiteUsos) : null,
    });
    if (!ok) setOcupado(false);
  };

  const pctMostrado = pctTexto !== '' ? pctTexto : (conta.pct != null && conta.pct > 0 ? String(conta.pct).replace('.', ',') : '');

  return (
    <Gaveta onClose={fechar} titulo={f.id ? 'Editar promoção' : 'Nova promoção'} largura={500}>
      <form className="pr-form" onSubmit={enviar}>
        <h2>{f.id ? 'Editar promoção' : 'Nova promoção'}</h2>
        <p className="pr-form-sub">Um pacote de serviços por um preço melhor que a soma dos avulsos.</p>

        <Campo label="Nome da promoção">
          <input value={f.nome} placeholder="Ex.: Terça da beleza" onChange={e => muda({ nome: e.target.value })} />
        </Campo>

        <Campo label="Serviços participantes">
          <div className="pr-servicos">
            {servicos.map(s => {
              const on = f.servicosIds.includes(s.id);
              return (
                <label key={s.id} className={'pr-servico' + (on ? ' on' : '')}>
                  <input type="checkbox" checked={on} onChange={() => { setPctTexto(''); alternar(s.id); }} />
                  <span className="pr-servico-nome">{s.nome}</span>
                  <span className="mono pr-servico-preco">{brl(s.preco)}</span>
                </label>
              );
            })}
          </div>
          <p className="add-ajuda">
            {f.servicosIds.length < 2
              ? 'Ao menos dois.'
              : `A cliente faz na ordem em que você marcou, ${conta.duracao} min no total, com a mesma profissional.`}
          </p>
        </Campo>

        <div className="mrow">
          <Campo label="Preço do pacote">
            <span className="campo-pre">
              <i>R$</i>
              <input inputMode="decimal" value={f.preco} placeholder="0,00"
                     onChange={e => { setPctTexto(''); muda({ preco: e.target.value }); }} />
            </span>
          </Campo>
          <Campo label="Ou o desconto">
            <span className="campo-pct">
              <input inputMode="decimal" value={pctMostrado} placeholder="0"
                     disabled={conta.cheio === 0} onChange={e => mudarPct(e.target.value)} />
              <i>%</i>
            </span>
          </Campo>
        </div>

        {/* O argumento de venda, calculado — não digitado. */}
        {conta.escolhidos.length >= 2 && (
          <div className={'combo-conta' + (conta.economia > 0 ? ' ok' : ' ruim')}>
            <div><span>Avulso</span><b className="mono">{brl(conta.cheio)}</b></div>
            <div>
              <span>{conta.economia > 0 ? 'A cliente economiza' : 'Sem vantagem'}</span>
              <b className="mono">{conta.economia > 0 ? brl(conta.economia) : 'o pacote precisa custar menos'}</b>
            </div>
          </div>
        )}

        <Campo label="Período">
          <div className="pr-periodo">
            <DataOpcional valor={f.validoDe} aoMudar={d => muda({ validoDe: d })} rotulo="Começa" />
            <span className="pr-seta" aria-hidden="true">→</span>
            <DataOpcional valor={f.validoAte} aoMudar={d => muda({ validoAte: d })} rotulo="Termina" min={f.validoDe || undefined} />
          </div>
          <p className="add-ajuda">
            Vale para atendimentos nessas datas. Sem começo, já está no ar; sem
            fim, fica até você pausar ou arquivar. Com começo no futuro, a
            promoção fica agendada e só aparece no site quando o dia chegar.
          </p>
        </Campo>

        <Campo label="Dias da semana">
          <div className="pr-dias" role="group" aria-label="Dias da semana">
            {SEMANA.map(([d, letra]) => (
              <button key={d} type="button" aria-pressed={f.diasSemana.includes(d)}
                      aria-label={NOME_DIA[d]}
                      className={'pr-dia' + (f.diasSemana.includes(d) ? ' on' : '')}
                      onClick={() => alternarDia(d)}>{letra}</button>
            ))}
          </div>
          <p className="add-ajuda">
            {f.diasSemana.length === 0 || f.diasSemana.length === 7
              ? 'Nenhum marcado: vale todo dia.'
              : `Vale só para atendimentos ${quandoVale({ diasSemana: f.diasSemana }).toLowerCase()}. O site só oferece esses dias.`}
          </p>
        </Campo>

        <Campo label="Limite de utilizações">
          <div className="pr-limite" role="radiogroup">
            <label className="pr-opcao">
              <input type="radio" name="limite" checked={!limitar} onChange={() => setLimitar(false)} />
              <span>Ilimitado</span>
            </label>
            <label className="pr-opcao">
              <input type="radio" name="limite" checked={limitar} onChange={() => setLimitar(true)} />
              <span>Limitar para</span>
              <input type="number" min={1} className="pr-limite-n" value={f.limiteUsos}
                     aria-label="Quantas utilizações"
                     onFocus={() => setLimitar(true)} onChange={e => muda({ limiteUsos: e.target.value })} />
              <span>utilizações</span>
            </label>
          </div>
          <p className="add-ajuda">
            Cada venda conta uma, canceladas não.{f.id ? ` Já vendidas: ${usos}.` : ''}
          </p>
        </Campo>

        <label className="pr-check">
          <input type="checkbox" checked={!!f.ativo} onChange={e => muda({ ativo: e.target.checked })} />
          <span><b>Promoção ativa</b><small>Desligada, fica pausada: sai do site sem perder nada</small></span>
        </label>

        <details className="sv-mais-campos">
          <summary>No site: foto e chamada</summary>
          <Campo label="Chamada (opcional)">
            <input value={f.descricao} maxLength={120} placeholder="Cuide do rosto inteiro num horário só"
                   onChange={e => muda({ descricao: e.target.value })} />
          </Campo>
          <Campo label="Foto">
            <div className="cb-foto">
              {f.foto ? <img src={f.foto} alt="" /> : <span className="cb-foto-vazia"><ImageOff size={18} /></span>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label className="btn btn-g btn-s" style={{ cursor: 'pointer' }}>
                  <Upload size={15} /> {subindo ? 'Enviando…' : f.foto ? 'Trocar' : 'Escolher'}
                  <input type="file" accept="image/*" hidden onChange={enviarFoto} disabled={subindo} />
                </label>
                {f.foto && (
                  <button type="button" className="btn btn-g btn-s" onClick={() => muda({ foto: '' })}>Remover</button>
                )}
              </div>
            </div>
            <p className="add-ajuda">
              Sem foto, o cartão da promoção mostra só o texto — funciona, mas
              chama menos atenção que os serviços em volta.
            </p>
          </Campo>
        </details>

        {problema && <p className="sv-problema" aria-live="polite">{problema}</p>}

        <div className="sv-botoes">
          <button className="btn btn-g" type="button" onClick={fechar}>Cancelar</button>
          <button className="btn btn-p" type="submit" disabled={ocupado || Boolean(problema)}>
            {ocupado ? 'Salvando…' : f.id ? 'Salvar alterações' : 'Criar promoção'}
          </button>
        </div>
      </form>
    </Gaveta>
  );
}

/** Data que pode ficar em branco — o `CampoData` sozinho não volta para vazio. */
function DataOpcional({ valor, aoMudar, rotulo, min }) {
  return (
    <div className="pr-data">
      <span className="pr-data-rotulo">{rotulo}</span>
      <CampoData valor={valor} aoMudar={aoMudar} min={min} />
      {valor
        ? <button type="button" className="pr-limpar" onClick={() => aoMudar('')}><X size={12} /> sem data</button>
        : <span className="pr-limpar vazio">sem data</span>}
    </div>
  );
}

function ultimoDia(iso) {
  const [a, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Busca sem acento e sem caixa. */
const chave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
