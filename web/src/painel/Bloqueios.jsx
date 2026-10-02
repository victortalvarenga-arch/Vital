import { useEffect, useState } from 'react';
import {
  CalendarDays, CalendarOff, Clock, Lock, MoreVertical, Plus, Repeat, Search, TriangleAlert, X,
} from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { Campo, Gaveta } from './Base.jsx';
import CampoData from './CampoData.jsx';
import { addDias, hojeISO, DIAS, MESES } from '../shared/tempo.js';

/**
 * Horários fechados: almoço, folga, feriado, férias, reforma.
 *
 * É o outro lado da jornada. A jornada diz quando se atende em geral; o
 * bloqueio diz quando, excepcionalmente, não se atende — e o motor de horários
 * consulta os dois antes de oferecer qualquer vaga à cliente.
 *
 * ---------------------------------------------------------------------------
 * Três jeitos de ler a mesma tabela
 * ---------------------------------------------------------------------------
 * O banco só conhece ocorrências: uma linha por data, irmãs ligadas por
 * `serie` (migration 013). Não existe coluna de "tipo" nem de "recorrente" — e
 * não precisa: a forma das datas diz o que a pessoa quis.
 *
 *   - uma data só           → avulso ("reunião na quinta");
 *   - dias seguidos, o dia todo → período ("férias de 5 a 15");
 *   - qualquer outra série  → recorrente ("almoço de segunda a sexta").
 *
 * Período e recorrente aparecem em lugares diferentes porque se gerenciam
 * diferente: férias se olham como uma coisa só, com começo e fim; o almoço de
 * todo dia é uma regra que fica valendo, e some do meio dos "próximos" para
 * não afogar a lista com uma linha por dia útil.
 *
 * "Dia inteiro" também é deduzido: o bloqueio cobre a jornada de quem ele
 * fecha naquele dia. Escrever "09:00–19:00" para quem atende das 9 às 19 é
 * fazer a pessoa conferir uma conta que a tela sabe fazer.
 *
 * ---------------------------------------------------------------------------
 * O formulário
 * ---------------------------------------------------------------------------
 * Quem, de que data a que data, de que hora a que hora — e só se a pessoa
 * pedir repetição ele cresce: dias da semana e quando termina, no modelo de
 * agenda que todo celular já ensinou.
 *
 * **A tela calcula as datas e as manda prontas** (`datas: [...]`), em vez de
 * mandar a regra para o servidor expandir. É o que garante que o que foi criado
 * é exatamente o que ela viu na prévia antes de clicar.
 *
 * Bloquear **não desmarca ninguém**. Se já havia cliente no horário, a tela
 * avisa quem é — furar a agenda de alguém sem avisar seria pior que o conflito.
 */

const SEMANA = [
  [1, 'seg'], [2, 'ter'], [3, 'qua'], [4, 'qui'], [5, 'sex'], [6, 'sáb'], [0, 'dom'],
];

const PERIODOS = [
  ['7d', 'Próximos 7 dias'],
  ['mes', 'Este mês'],
  ['3m', 'Próximos 3 meses'],
  ['tudo', 'Todo o período'],
];

export default function Bloqueios({ dados, aviso, poderes }) {
  const { staff } = dados;
  const eu = dados.eu?.profissionalId || '';
  const hoje = hojeISO();

  const [lista, setLista] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [versao, setVersao] = useState(0);
  const [conflitos, setConflitos] = useState(null);
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState(null);

  const [busca, setBusca] = useState('');
  const [filtroQuem, setFiltroQuem] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [periodo, setPeriodo] = useState('mes');

  const ate = addDias(hoje, 365);
  useEffect(() => {
    let vivo = true;
    setFalhou(false);
    api.bloqueios(hoje, ate)
      .then(l => { if (vivo) setLista(l); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [versao]);

  const remover = async (b, serie) => {
    const quantas = serie ? lista.filter(x => x.serie === b.serie).length : 1;
    if (!confirm(serie
      ? `Liberar as ${quantas} datas deste bloqueio?`
      : `Liberar ${fmtData(b.data)}, das ${b.horaIni} às ${b.horaFim}?`)) return;
    try {
      await api.removerBloqueio(b.id, { serie });
      setAberto(null);
      setVersao(v => v + 1);
    } catch (e) {
      aviso(e.message || 'Não deu para liberar.');
    }
  };

  const nomeDe = id => id ? (staff.find(p => p.id === id)?.nome || 'Profissional removida') : 'Todos os profissionais';

  // Dia inteiro = cobre a jornada de cada pessoa que o bloqueio fecha, em cada
  // data. Dia sem jornada não conta contra: a pessoa já não atenderia.
  const diaInteiro = (b, datas) => {
    const pessoas = b.profissionalId
      ? [staff.find(p => p.id === b.profissionalId)].filter(Boolean)
      : staff.filter(p => p.ativo);
    return datas.every(d => pessoas.every(p => {
      const j = p.jornada?.[String(diaSemana(d))];
      return !j || (b.horaIni <= j[0] && b.horaFim >= j[1]);
    }));
  };

  const todas = lista || [];
  const grupos = agrupar(todas).map(g => {
    const datas = g.datas.map(b => b.data);
    return { ...g, forma: forma(datas, diaInteiro(g.primeiro, datas)) };
  });
  const formaDaSerie = new Map(grupos.filter(g => g.primeiro.serie).map(g => [g.primeiro.serie, g]));

  // Tipos são os motivos que a empresa já usou — nada de lista fixa.
  const tipos = [...new Map(todas.filter(b => b.motivo).map(b => [chave(b.motivo), b.motivo])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const temSemMotivo = todas.some(b => !b.motivo);

  const fimPeriodo = {
    '7d': addDias(hoje, 7), mes: hoje.slice(0, 7) + '-31', '3m': addDias(hoje, 90), tudo: '9999',
  }[periodo];

  const passa = (b, datas) => {
    // Bloqueio da equipe toda fecha a agenda de cada um — então aparece no
    // filtro de qualquer profissional.
    if (filtroQuem === '__todos' && b.profissionalId) return false;
    if (filtroQuem && filtroQuem !== '__todos' && b.profissionalId && b.profissionalId !== filtroQuem) return false;
    if (filtroTipo === '__sem' && b.motivo) return false;
    if (filtroTipo && filtroTipo !== '__sem' && chave(b.motivo || '') !== filtroTipo) return false;
    const q = chave(busca.trim());
    if (!q) return true;
    const texto = chave([
      nomeDe(b.profissionalId), b.motivo,
      ...datas.flatMap(d => [d, fmtData(d), diaMes(d), `${d.slice(8)}/${d.slice(5, 7)}`]),
    ].join(' '));
    return texto.includes(q);
  };

  /* ── números do topo: a foto da agenda, sem filtro ── */
  const deHoje = todas.filter(b => b.data === hoje);
  const proximos7 = todas.filter(b => b.data > hoje && b.data <= addDias(hoje, 7));
  const recorrentes = grupos.filter(g => g.forma === 'recorrente');
  const ativos = staff.filter(p => p.ativo);
  const comBloqueio = todas.some(b => !b.profissionalId)
    ? ativos.length
    : new Set(todas.map(b => b.profissionalId).filter(id => ativos.some(p => p.id === id))).size;

  /* ── as três listas ── */
  const cartoesHoje = deHoje
    .filter(b => passa(b, [b.data]))
    .sort((a, b) => a.horaIni.localeCompare(b.horaIni));

  const cartoesProximos = grupos
    .filter(g => g.forma !== 'recorrente' && g.primeiro.data > hoje && g.primeiro.data <= fimPeriodo)
    .filter(g => passa(g.primeiro, g.datas.map(b => b.data)));

  const linhasRecorrentes = recorrentes
    .filter(g => g.primeiro.data <= fimPeriodo)
    .filter(g => passa(g.primeiro, g.datas.map(b => b.data)));

  const alternar = k => setAberto(a => a === k ? null : k);

  return (
    <>
      <div className="head">
        <div>
          <h2>Fechar horários</h2>
          <div className="sub">
            {poderes.verDeTodos
              ? 'Gerencie folgas, pausas, férias e outros períodos indisponíveis dos profissionais.'
              : 'Folgas, pausas e outros períodos em que você não atende. Feriado da empresa quem marca é o dono.'}
          </div>
        </div>
        <button className="btn btn-p btn-s" onClick={() => setCriando(true)}>
          <Plus size={16} /> Novo bloqueio
        </button>
      </div>

      {criando && (
        <NovoBloqueio staff={staff} eu={eu} hoje={hoje} aviso={aviso} poderes={poderes}
                      motivos={tipos.map(([, nome]) => nome)}
                      fechar={() => setCriando(false)}
                      criado={avisos => {
                        setConflitos(avisos.length ? avisos : null);
                        setCriando(false);
                        setVersao(v => v + 1);
                      }} />
      )}

      {conflitos && (
        <div className="bl-conflito">
          <TriangleAlert size={16} aria-hidden="true" />
          <div>
            <b>Já havia cliente marcada nesse horário.</b> O bloqueio foi criado, mas
            ninguém foi desmarcado — remarque à mão e avise:
            <ul>
              {conflitos.map(c => (
                <li key={c.id}>{fmtData(c.data)} às {c.hora} · {c.cliente}</li>
              ))}
            </ul>
          </div>
          <button className="btn btn-g btn-s" onClick={() => setConflitos(null)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      )}

      {falhou && <div className="rs-falha">Não deu para carregar os horários fechados.</div>}

      <div className="stats bl-stats">
        <Numero rotulo="Bloqueios hoje" valor={lista && deHoje.length} sub="horários indisponíveis" />
        <Numero rotulo="Próximos bloqueios" valor={lista && proximos7.length} sub="nos próximos 7 dias" />
        <Numero rotulo="Bloqueios recorrentes" valor={lista && recorrentes.length} sub="em andamento" />
        {poderes.verDeTodos && (
          <Numero rotulo="Profissionais com bloqueios" valor={lista && comBloqueio}
                  sub={`de ${ativos.length} ${ativos.length === 1 ? 'profissional' : 'profissionais'}`} />
        )}
      </div>

      <div className="bl-busca">
        <Search size={16} aria-hidden="true" />
        <input placeholder="Buscar profissional, motivo ou data…" value={busca}
               onChange={e => setBusca(e.target.value)} aria-label="Buscar bloqueios" />
      </div>

      <div className="bl-filtros">
        {poderes.verDeTodos && (
          <select value={filtroQuem} onChange={e => setFiltroQuem(e.target.value)} aria-label="Profissional">
            <option value="">Todos os profissionais</option>
            <option value="__todos">Só os da equipe toda</option>
            {staff.filter(p => p.ativo).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {tipos.map(([k, nome]) => <option key={k} value={k}>{nome}</option>)}
          {temSemMotivo && <option value="__sem">Sem motivo</option>}
        </select>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período">
          {PERIODOS.map(([k, nome]) => <option key={k} value={k}>{nome}</option>)}
        </select>
      </div>

      <div className="bl-colunas">
        <section className="card bl-secao">
          <div className="eyebrow bl-secao-t">Bloqueios de hoje</div>
          {lista && cartoesHoje.length === 0 && <p className="rs-vazio">Nada fechado hoje.</p>}
          <div className="bl-cartoes">
            {cartoesHoje.map(b => {
              const g = b.serie ? formaDaSerie.get(b.serie) : null;
              const f = g?.forma || 'avulso';
              const inteiro = diaInteiro(b, [b.data]);
              return (
                <Cartao key={b.id} aberto={aberto === b.id} alternar={() => alternar(b.id)}
                        quando={inteiro ? 'Dia inteiro' : `${b.horaIni} — ${b.horaFim}`}
                        selo={f === 'recorrente' ? 'Recorrente' : f === 'periodo' ? 'Período' : 'Hoje'}
                        seloTom={f === 'recorrente' ? 'rec' : ''}
                        motivo={b.motivo} obs={b.obs} pessoa={nomeDe(b.profissionalId)}
                        Icone={f === 'recorrente' ? Repeat : CalendarDays}
                        rodape={f === 'recorrente' ? padrao(g.datas.map(x => x.data))
                          : f === 'periodo' ? `${faixaDatas(g.primeiro.data, g.datas.at(-1).data)}`
                          : 'Uma vez'}>
                  <button className="btn btn-g btn-s btn-erro" onClick={() => remover(b, false)}>
                    Liberar hoje
                  </button>
                  {g && g.datas.length > 1 && (
                    <button className="btn btn-g btn-s btn-erro" onClick={() => remover(b, true)}>
                      Liberar todas ({g.datas.length})
                    </button>
                  )}
                </Cartao>
              );
            })}
          </div>
        </section>

        <section className="card bl-secao">
          <div className="eyebrow bl-secao-t">Próximos bloqueios</div>
          {lista && cartoesProximos.length === 0 && (
            <p className="rs-vazio">Nenhum bloqueio avulso ou período neste intervalo.</p>
          )}
          <div className="bl-cartoes">
            {cartoesProximos.map(g => {
              const b = g.primeiro;
              const ultima = g.datas.at(-1).data;
              const inteiro = diaInteiro(b, g.datas.map(x => x.data));
              return (
                <Cartao key={g.chave} aberto={aberto === g.chave} alternar={() => alternar(g.chave)}
                        quando={faixaDatas(b.data, ultima)} selo={emQuantos(hoje, b.data)}
                        motivo={b.motivo} obs={b.obs} pessoa={nomeDe(b.profissionalId)}
                        Icone={inteiro ? CalendarDays : Clock}
                        rodape={inteiro ? 'Dia inteiro' : `${b.horaIni} — ${b.horaFim}`}>
                  <button className="btn btn-g btn-s btn-erro" onClick={() => remover(b, g.datas.length > 1)}>
                    {g.datas.length > 1 ? `Liberar os ${g.datas.length} dias` : 'Liberar'}
                  </button>
                </Cartao>
              );
            })}
          </div>
        </section>
      </div>

      <section className="card bl-secao">
        <div className="eyebrow bl-secao-t">Bloqueios recorrentes</div>
        {lista && linhasRecorrentes.length === 0 && (
          <p className="rs-vazio">Nenhum bloqueio que se repete. Monte um em “Novo bloqueio”, escolhendo os dias da semana e por quantas semanas vale.</p>
        )}
        <div className="bl-cartoes">
          {linhasRecorrentes.map(g => {
            const b = g.primeiro;
            const ultima = g.datas.at(-1).data;
            const inteiro = diaInteiro(b, g.datas.map(x => x.data));
            const comecou = b.data <= hoje;
            return (
              <div key={g.chave} className="bl-linha">
                <span className="bl-linha-ic" aria-hidden="true"><Repeat size={16} /></span>
                <div className="bl-linha-info">
                  <b>{b.motivo || 'Sem motivo'}</b>
                  <div className="bl-linha-meta">
                    {nomeDe(b.profissionalId)} · {padrao(g.datas.map(x => x.data))}
                    {' · '}{inteiro ? 'Dia inteiro' : <span className="mono">{b.horaIni} — {b.horaFim}</span>}
                  </div>
                  {b.obs && <div className="bl-obs">{b.obs}</div>}
                </div>
                <span className={'bl-ativo' + (comecou ? '' : ' futuro')}>
                  {comecou ? 'Ativo' : `Começa ${fmtCurto(b.data)}`} · até {fmtCurto(ultima)}
                </span>
                <button className="bl-mais" onClick={() => alternar(g.chave)}
                        aria-expanded={aberto === g.chave} aria-label="Mais ações">
                  <MoreVertical size={18} />
                </button>
                {aberto === g.chave && (
                  <div className="bl-acoes">
                    <span className="bl-acoes-dica">Toque numa data para liberar só ela:</span>
                    <div className="bl-datas">
                      {g.datas.map(x => (
                        <button key={x.id} className="bl-data" onClick={() => remover(x, false)}>
                          {fmtData(x.data)} <X size={11} />
                        </button>
                      ))}
                    </div>
                    <button className="btn btn-g btn-s btn-erro" onClick={() => remover(b, true)}>
                      Liberar todas ({g.datas.length})
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Numero({ rotulo, valor, sub }) {
  return (
    <div className="card stat">
      <span className="eyebrow">{rotulo}</span>
      <span className={'v' + (valor == null ? ' rs-esperando' : '')}>{valor ?? '—'}</span>
      <span className="bl-stat-sub">{sub}</span>
    </div>
  );
}

/** Um bloqueio em cartão. As ações ficam atrás do ⋮, abertas por toque — nada de hover. */
function Cartao({ aberto, alternar, quando, selo, seloTom, motivo, obs, pessoa, Icone, rodape, children }) {
  return (
    <div className="bl-cartao">
      <span className="bl-cadeado" aria-hidden="true"><Lock size={15} /></span>
      <div className="bl-cartao-corpo">
        <div className="bl-cartao-topo">
          <b className="bl-quando-t">{quando}</b>
          <span className={'bl-badge' + (seloTom ? ' ' + seloTom : '')}>{selo}</span>
        </div>
        <div className="bl-motivo-t">{motivo || 'Sem motivo'}</div>
        <div className="bl-pessoa">{pessoa}</div>
        <div className="bl-rodinha"><Icone size={13} aria-hidden="true" /> {rodape}</div>
        {obs && <div className="bl-obs">{obs}</div>}
      </div>
      <button className="bl-mais" onClick={alternar} aria-expanded={aberto} aria-label="Mais ações">
        <MoreVertical size={18} />
      </button>
      {aberto && <div className="bl-acoes">{children}</div>}
    </div>
  );
}

/**
 * O formulário de criação, numa gaveta — no celular sobe de baixo.
 *
 * Começa simples (quem, quando, motivo) e só cresce se a pessoa pedir
 * repetição: almoço de hoje não precisa ver campo de "termina em".
 *
 * Com repetição, a data final some: quem diz até quando vale é o "Termina".
 * Os dois juntos fariam a pessoa perguntar qual dos dois manda.
 */
function NovoBloqueio({ staff, eu, hoje, motivos, aviso, poderes, fechar, criado }) {
  const [quem, setQuem] = useState(poderes.verDeTodos ? '' : eu);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [horaIni, setHoraIni] = useState('12:00');
  const [horaFim, setHoraFim] = useState('13:00');
  const [inteiro, setInteiro] = useState(false);
  const [repetir, setRepetir] = useState('nao');
  const [diasSemana, setDiasSemana] = useState([]);
  const [termina, setTermina] = useState('data');
  const [ateData, setAteData] = useState(addDias(hoje, 90));
  const [vezes, setVezes] = useState(10);
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const mudarInicio = d => {
    setInicio(d);
    if (fim < d) setFim(d);
  };
  const mudarRepetir = r => {
    setRepetir(r);
    // Semanal sem dia marcado não fecha nada; começa pelo dia da data inicial.
    if (r === 'semanal' && !diasSemana.length) setDiasSemana([diaSemana(inicio)]);
  };
  const alternarDia = d => setDiasSemana(l => l.includes(d) ? l.filter(x => x !== d) : [...l, d]);

  const datas = gerarDatas({ inicio, fim, repetir, diasSemana, termina, ateData, vezes }, hoje);
  const problema =
    !inteiro && horaFim <= horaIni ? 'A hora final precisa ser depois da inicial.'
    : repetir === 'nao' && fim < inicio ? 'A data final é antes da inicial.'
    : repetir === 'semanal' && !diasSemana.length ? 'Escolha ao menos um dia da semana.'
    : repetir !== 'nao' && termina === 'data' && ateData < inicio ? 'A data de término é antes do início.'
    : datas.length > MAX_DATAS ? `Passa de ${MAX_DATAS} datas. Escolha um término mais próximo.`
    : !datas.length ? 'Nenhuma data cai nesse intervalo.'
    : null;

  const criar = async e => {
    e.preventDefault();
    if (problema) return aviso(problema);
    setSalvando(true);
    try {
      const r = await api.criarBloqueio({
        profissionalId: quem || null, motivo: motivo.trim(), obs: obs.trim(),
        // Dia inteiro vai como a faixa do dia todo, e não como bandeira: o
        // motor de horários já entende intervalo, e não precisa aprender nada.
        horaIni: inteiro ? '00:00' : horaIni, horaFim: inteiro ? '23:59' : horaFim,
        datas,
      });
      criado(r.jaAgendados || []);
    } catch (erro) {
      aviso(erro.message || 'Não deu para fechar o horário.');
      setSalvando(false);
    }
  };

  const minha = staff.find(p => p.id === eu);

  return (
    <Gaveta onClose={fechar} titulo="Fechar horário" largura={480}>
      <form onSubmit={criar} className="bl-novo">
        <h2>Fechar horário</h2>
        <p className="bl-novo-sub">Crie um período em que o profissional ficará indisponível.</p>

        <Campo label="Profissional">
          {poderes.verDeTodos ? (
            <select value={quem} onChange={e => setQuem(e.target.value)}>
              <option value="">Todos os profissionais</option>
              {staff.filter(p => p.ativo).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          ) : (
            // Funcionário fecha só a própria agenda — a rota também recusa o resto.
            <select value={eu} disabled><option value={eu}>{minha?.nome || 'Você'}</option></select>
          )}
        </Campo>

        <div className="mrow">
          <Campo label={repetir === 'nao' ? 'Data inicial' : 'Começa em'}>
            <CampoData valor={inicio} aoMudar={mudarInicio} min={hoje} />
          </Campo>
          {repetir === 'nao' && (
            <Campo label="Data final">
              <CampoData valor={fim} aoMudar={setFim} min={inicio} />
            </Campo>
          )}
        </div>

        <div className="mrow">
          <Campo label="Das">
            <input type="time" value={horaIni} disabled={inteiro} onChange={e => setHoraIni(e.target.value)} />
          </Campo>
          <Campo label="Até">
            <input type="time" value={horaFim} disabled={inteiro} onChange={e => setHoraFim(e.target.value)} />
          </Campo>
        </div>

        <label className={'bl-check' + (inteiro ? ' on' : '')}>
          <input type="checkbox" checked={inteiro} onChange={e => setInteiro(e.target.checked)} />
          <span>
            <b>Dia inteiro</b>
            <small>Bloqueia todo o período selecionado</small>
          </span>
        </label>

        <Campo label="Repetição">
          <select value={repetir} onChange={e => mudarRepetir(e.target.value)}>
            <option value="nao">Não repetir</option>
            <option value="diaria">Todos os dias</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal (todo dia {Number(inicio.slice(8))})</option>
          </select>
        </Campo>

        {repetir !== 'nao' && (
          <div className="bl-repeticao">
            {repetir === 'semanal' && (
              <Campo label="Repetir em">
                <div className="bl-dias" role="group" aria-label="Dias da semana">
                  {SEMANA.map(([d, nome]) => (
                    <button key={d} type="button" aria-pressed={diasSemana.includes(d)}
                            className={'bl-dia' + (diasSemana.includes(d) ? ' on' : '')}
                            onClick={() => alternarDia(d)}>{nome}</button>
                  ))}
                </div>
              </Campo>
            )}

            <Campo label="Termina">
              <div className="bl-termina" role="radiogroup">
                <label className="bl-opcao">
                  <input type="radio" name="termina" checked={termina === 'nunca'}
                         onChange={() => setTermina('nunca')} />
                  <span>Nunca</span>
                </label>
                {termina === 'nunca' && (
                  // Uma linha por data (ver ARQUITETURA.md) não deixa existir
                  // "para sempre": a tela diz até onde vai, em vez de fingir.
                  <small className="bl-opcao-dica">
                    Fecha os próximos 12 meses. Perto do fim, crie de novo.
                  </small>
                )}
                <label className="bl-opcao">
                  <input type="radio" name="termina" checked={termina === 'data'}
                         onChange={() => setTermina('data')} />
                  <span>Em uma data</span>
                </label>
                {termina === 'data' && (
                  <div className="bl-opcao-campo">
                    <CampoData valor={ateData} aoMudar={setAteData} min={inicio} />
                  </div>
                )}
                <label className="bl-opcao">
                  <input type="radio" name="termina" checked={termina === 'apos'}
                         onChange={() => setTermina('apos')} />
                  <span>Após</span>
                </label>
                {termina === 'apos' && (
                  <div className="bl-opcao-campo bl-apos">
                    <input type="number" min={1} max={MAX_DATAS} value={vezes}
                           onChange={e => setVezes(e.target.value)} aria-label="Ocorrências" />
                    <span>ocorrências</span>
                  </div>
                )}
              </div>
            </Campo>
          </div>
        )}

        <Campo label="Motivo">
          {/* Texto livre com os motivos que a empresa já usou como sugestão —
              é deles que sai o filtro de tipo da tela. */}
          <input list="bl-motivos" value={motivo} maxLength={200}
                 placeholder="Almoço, folga, férias…" onChange={e => setMotivo(e.target.value)} />
          <datalist id="bl-motivos">
            {motivos.map(m => <option key={m} value={m} />)}
          </datalist>
        </Campo>

        <Campo label="Observação">
          <textarea rows={3} value={obs} maxLength={500} placeholder="Opcional"
                    onChange={e => setObs(e.target.value)} />
        </Campo>

        <p className={'bl-resumo' + (problema ? ' ruim' : '')} aria-live="polite">
          {problema || resumo(datas, inteiro, horaIni, horaFim)}
        </p>

        <div className="bl-novo-botoes">
          <button type="button" className="btn btn-g" onClick={fechar}>Cancelar</button>
          <button type="submit" className="btn btn-p" disabled={salvando || Boolean(problema)}>
            <CalendarOff size={16} /> {salvando ? 'Fechando…' : 'Fechar horário'}
          </button>
        </div>
      </form>
    </Gaveta>
  );
}

// O mesmo teto do servidor (`routes/bloqueios.js`), que corta calado o que
// passar. Aqui a tela recusa antes, para nada ser criado pela metade.
const MAX_DATAS = 400;

/**
 * As datas que o formulário vai fechar — calculadas aqui e mandadas prontas,
 * para o que se cria ser exatamente o que o resumo mostrou.
 */
function gerarDatas({ inicio, fim, repetir, diasSemana, termina, ateData, vezes }, hoje) {
  const saida = [];
  if (repetir === 'nao') {
    for (let d = inicio; d <= fim && saida.length <= MAX_DATAS; d = addDias(d, 1)) saida.push(d);
    return saida.filter(d => d >= hoje);
  }
  if (repetir === 'semanal' && !diasSemana.length) return [];

  const limite = termina === 'data' ? ateData
    : termina === 'nunca' ? addDias(inicio, 364)
    : '9999-12-31';
  const quantas = termina === 'apos' ? Math.max(1, Number(vezes) || 1) : Infinity;
  // `<= MAX_DATAS` e não `<`: a 401ª data é o que avisa que passou do teto.
  const cabe = () => saida.length < quantas && saida.length <= MAX_DATAS;

  if (repetir === 'mensal') {
    for (let i = 0; cabe(); i++) {
      const d = maisMeses(inicio, i);
      if (d > limite) break;
      saida.push(d);
    }
  } else {
    for (let d = inicio; d <= limite && cabe(); d = addDias(d, 1)) {
      if (repetir === 'diaria' || diasSemana.includes(diaSemana(d))) saida.push(d);
    }
  }
  return saida.filter(d => d >= hoje);
}

/** Soma mês, não trinta dias — a mesma regra do `repetir.cada = 'mes'` do servidor. */
function maisMeses(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Fecha 20 datas, de 1 out a 26 out, das 12:00 às 13:00." */
function resumo(datas, inteiro, ini, fim) {
  const horas = inteiro ? 'o dia inteiro' : `das ${ini} às ${fim}`;
  if (datas.length === 1) return `Fecha ${fmtData(datas[0])}, ${horas}.`;
  return `Fecha ${datas.length} datas, de ${fmtCurto(datas[0])} a ${fmtCurto(datas.at(-1))}, ${horas}.`;
}

/** Junta as ocorrências de uma mesma criação; o avulso vira grupo de um. */
function agrupar(lista) {
  const porSerie = new Map();
  const saida = [];
  for (const b of lista) {
    if (!b.serie) { saida.push({ chave: b.id, primeiro: b, datas: [b] }); continue; }
    if (!porSerie.has(b.serie)) {
      const g = { chave: b.serie, primeiro: b, datas: [] };
      porSerie.set(b.serie, g);
      saida.push(g);
    }
    porSerie.get(b.serie).datas.push(b);
  }
  return saida;
}

/**
 * Avulso, período ou recorrente — ver o comentário do topo.
 *
 * Dias seguidos só são período quando fecham o dia inteiro: almoço de todo dia
 * também é uma sequência sem buraco, e é regra, não férias.
 */
function forma(datas, inteiro) {
  if (datas.length === 1) return 'avulso';
  const seguidos = datas.every((d, i) => i === 0 || d === addDias(datas[i - 1], 1));
  return seguidos && inteiro ? 'periodo' : 'recorrente';
}

const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const diaSemana = iso => new Date(iso + 'T12:00:00').getDay();
const maiuscula = s => s[0].toUpperCase() + s.slice(1);

/** "Segunda a sexta", "Todos os sábados", "Seg, Qua e Sex". */
function padrao(datas) {
  // Segunda primeiro, domingo por último: é como a semana de trabalho se lê.
  const dias = [...new Set(datas.map(diaSemana))].sort((a, b) => (a || 7) - (b || 7));
  const k = dias.join();
  if (dias.length === 7) return 'Todos os dias';
  if (k === '1,2,3,4,5') return 'Segunda a sexta';
  if (k === '1,2,3,4,5,6') return 'Segunda a sábado';
  if (dias.length === 1) {
    const d = dias[0];
    return (d === 0 || d === 6 ? 'Todos os ' : 'Todas as ') + NOMES_DIA[d] + 's';
  }
  const abrev = dias.map(d => maiuscula(DIAS[d]));
  return abrev.slice(0, -1).join(', ') + ' e ' + abrev.at(-1);
}

const fmtData = iso => {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
};
const fmtCurto = iso => `${Number(iso.slice(8))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const diaMes = iso => `${iso.slice(8)} de ${MESES_LONGOS[Number(iso.slice(5, 7)) - 1]}`;

/** "03 de outubro", "05 — 15 de outubro", "28 de setembro — 03 de outubro". */
function faixaDatas(de, ate) {
  if (de === ate) return diaMes(de);
  if (de.slice(0, 7) === ate.slice(0, 7)) return `${de.slice(8)} — ${diaMes(ate)}`;
  return `${diaMes(de)} — ${diaMes(ate)}`;
}

function emQuantos(hoje, data) {
  const n = Math.round((new Date(data + 'T12:00:00') - new Date(hoje + 'T12:00:00')) / 864e5);
  return n === 1 ? 'Amanhã' : `Em ${n} dias`;
}

/** Busca sem acento e sem caixa: "ferias" acha "Férias". */
const chave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
