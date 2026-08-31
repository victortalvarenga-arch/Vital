import { useEffect, useState } from 'react';
import { CalendarOff, Plus, Repeat, TriangleAlert, X } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { addDias, hojeISO } from '../shared/tempo.js';

/**
 * Horários fechados: almoço, folga, feriado, férias, reforma.
 *
 * É o outro lado da jornada. A jornada diz quando se atende em geral; o
 * bloqueio diz quando, excepcionalmente, não se atende — e o motor de horários
 * consulta os dois antes de oferecer qualquer vaga à cliente.
 *
 * ---------------------------------------------------------------------------
 * Monta primeiro, cria depois
 * ---------------------------------------------------------------------------
 * O primeiro desenho pedia uma data e uma repetição, e não dava conta do caso
 * mais comum de todos: "fecho segunda e quarta, das 8 às 10, pelas próximas
 * seis semanas". Isso eram dois bloqueios repetidos criados separadamente, e a
 * pessoa tinha de fazer a conta do calendário de cabeça duas vezes.
 *
 * Agora se monta uma lista — cada linha é um par de dias da semana e uma faixa
 * de horas — e a repetição vale para o conjunto, no fim. Só então se cria. É a
 * ordem em que a pessoa pensa: primeiro "quando eu não atendo", depois "por
 * quanto tempo isso vale".
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

export default function Bloqueios({ dados, aviso, poderes }) {
  const { staff } = dados;
  const eu = dados.eu?.profissionalId || '';
  const hoje = hojeISO();

  const [lista, setLista] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [versao, setVersao] = useState(0);
  const [conflitos, setConflitos] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const ate = addDias(hoje, 365);
  useEffect(() => {
    let vivo = true;
    setLista(null);
    setFalhou(false);
    api.bloqueios(hoje, ate)
      .then(l => { if (vivo) setLista(l); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [versao]);

  const [quem, setQuem] = useState(poderes.verDeTodos ? '' : eu);
  const [motivo, setMotivo] = useState('');
  const [semanas, setSemanas] = useState(1);
  const [inicio, setInicio] = useState(hoje);

  // A linha que está sendo montada, e as já adicionadas.
  const [dias, setDias] = useState([]);
  const [horaIni, setHoraIni] = useState('09:00');
  const [horaFim, setHoraFim] = useState('18:00');
  const [faixas, setFaixas] = useState([]);

  const alternarDia = d => setDias(l => l.includes(d) ? l.filter(x => x !== d) : [...l, d]);

  const adicionar = () => {
    if (!dias.length) return aviso('Escolha ao menos um dia da semana.');
    if (horaFim <= horaIni) return aviso('A hora de fim precisa ser depois da de início.');
    setFaixas(f => [...f, { dias: [...dias].sort(), horaIni, horaFim }]);
    setDias([]);
  };

  const datasDe = faixa => {
    // A partir do início, N semanas: cada dia da semana escolhido vira uma data
    // por semana. `addDias` até bater no dia certo evita conta de fuso.
    const saida = [];
    const base = new Date(inicio + 'T12:00:00');
    for (let s = 0; s < Number(semanas || 1); s++) {
      for (const d of faixa.dias) {
        const desloc = (d - base.getDay() + 7) % 7;
        const data = addDias(inicio, desloc + s * 7);
        if (data >= hoje) saida.push(data);
      }
    }
    return [...new Set(saida)].sort();
  };

  const totalDatas = faixas.reduce((n, f) => n + datasDe(f).length, 0);

  const criar = async () => {
    if (!faixas.length) return aviso('Adicione ao menos um horário.');
    setSalvando(true);
    try {
      const avisos = [];
      for (const f of faixas) {
        const r = await api.criarBloqueio({
          profissionalId: quem || null, motivo,
          horaIni: f.horaIni, horaFim: f.horaFim, datas: datasDe(f),
        });
        avisos.push(...(r.jaAgendados || []));
      }
      setConflitos(avisos.length ? avisos : null);
      setFaixas([]);
      setMotivo('');
      setVersao(v => v + 1);
    } catch (e) {
      aviso(e.message || 'Não deu para fechar o horário.');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (b, serie) => {
    const quantas = serie ? lista.filter(x => x.serie === b.serie).length : 1;
    if (!confirm(serie
      ? `Liberar as ${quantas} datas desta repetição?`
      : `Liberar ${fmt(b.data)}, das ${b.horaIni} às ${b.horaFim}?`)) return;
    try {
      await api.removerBloqueio(b.id, { serie });
      setVersao(v => v + 1);
    } catch (e) {
      aviso(e.message || 'Não deu para liberar.');
    }
  };

  const grupos = agrupar(lista || []);

  return (
    <>
      <div className="head">
        <div>
          <h2>Horários fechados</h2>
          <div className="sub">
            {poderes.verDeTodos
              ? 'Folga, feriado, férias — o que o site não pode oferecer'
              : 'A sua agenda. Feriado da empresa quem marca é o dono'}
          </div>
        </div>
      </div>

      <div className="card bl-form">
        <div className="bl-passo">
          <span className="bl-num-passo">1</span>
          <div className="bl-passo-corpo">
            <div className="bl-titulo">Quais dias e horas</div>
            <div className="bl-dias">
              {SEMANA.map(([d, nome]) => (
                <button key={d} type="button"
                        className={'bl-dia' + (dias.includes(d) ? ' on' : '')}
                        onClick={() => alternarDia(d)}>{nome}</button>
              ))}
            </div>
            <div className="bl-horas">
              <label>das <input type="time" value={horaIni} onChange={e => setHoraIni(e.target.value)} /></label>
              <label>até <input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} /></label>
              <button className="btn btn-g btn-s" onClick={adicionar}>
                <Plus size={15} /> Adicionar
              </button>
            </div>

            {faixas.length > 0 && (
              <div className="bl-faixas">
                {faixas.map((f, i) => (
                  <span key={i} className="bl-faixa">
                    {f.dias.map(d => SEMANA.find(([x]) => x === d)[1]).join(', ')}
                    {' · '}<b className="mono">{f.horaIni}–{f.horaFim}</b>
                    <button onClick={() => setFaixas(l => l.filter((_, n) => n !== i))}
                            aria-label="Tirar"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bl-passo">
          <span className="bl-num-passo">2</span>
          <div className="bl-passo-corpo">
            <div className="bl-titulo"><Repeat size={14} aria-hidden="true" /> Por quanto tempo</div>
            <div className="bl-horas">
              <label>a partir de <input type="date" value={inicio} min={hoje}
                                        onChange={e => setInicio(e.target.value)} /></label>
              <label>por
                <input className="bl-num" type="number" min={1} max={52} value={semanas}
                       onChange={e => setSemanas(e.target.value)} />
                {Number(semanas) === 1 ? 'semana' : 'semanas'}
              </label>
            </div>
          </div>
        </div>

        <div className="bl-passo">
          <span className="bl-num-passo">3</span>
          <div className="bl-passo-corpo">
            <div className="bl-titulo">De quem, e por quê</div>
            <div className="bl-horas">
              {poderes.verDeTodos && (
                <select value={quem} onChange={e => setQuem(e.target.value)}>
                  <option value="">A empresa toda</option>
                  {staff.filter(p => p.ativo).map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              )}
              <input className="bl-motivo-campo" value={motivo} maxLength={200}
                     placeholder="Motivo (opcional): férias, feriado…"
                     onChange={e => setMotivo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="bl-rodape">
          <span className="bl-previa">
            {faixas.length === 0
              ? 'Adicione um horário para continuar'
              : `${totalDatas} ${totalDatas === 1 ? 'data será fechada' : 'datas serão fechadas'}`}
          </span>
          <button className="btn btn-p" onClick={criar} disabled={!faixas.length || salvando}>
            <CalendarOff size={16} /> {salvando ? 'Fechando…' : 'Fechar horários'}
          </button>
        </div>
      </div>

      {conflitos && (
        <div className="bl-conflito">
          <TriangleAlert size={16} aria-hidden="true" />
          <div>
            <b>Já havia cliente marcada nesse horário.</b> O bloqueio foi criado, mas
            ninguém foi desmarcado — remarque à mão e avise:
            <ul>
              {conflitos.map(c => (
                <li key={c.id}>{fmt(c.data)} às {c.hora} · {c.cliente}</li>
              ))}
            </ul>
          </div>
          <button className="btn btn-g btn-s" onClick={() => setConflitos(null)}><X size={14} /></button>
        </div>
      )}

      {falhou && <div className="rs-falha">Não deu para carregar os horários fechados.</div>}
      {lista && grupos.length === 0 && (
        <p className="rs-vazio">Nenhum horário fechado daqui para a frente.</p>
      )}

      {grupos.map(g => {
        const p = staff.find(x => x.id === g.primeiro.profissionalId);
        return (
          <div key={g.chave} className="card bl-item">
            <div className="bl-item-info">
              <div className="bl-quando">
                <b>{fmt(g.primeiro.data)}</b>
                <span className="mono">{g.primeiro.horaIni}–{g.primeiro.horaFim}</span>
                {g.datas.length > 1 && (
                  <span className="bl-selo"><Repeat size={11} /> {g.datas.length}×</span>
                )}
              </div>
              <div className="bl-quem">
                {g.primeiro.profissionalId ? (p?.nome || 'profissional removida') : 'A empresa toda'}
                {g.primeiro.motivo && <span className="bl-motivo"> · {g.primeiro.motivo}</span>}
              </div>
              {g.datas.length > 1 && (
                <div className="bl-datas">
                  {g.datas.map(b => (
                    <button key={b.id} className="bl-data" title="Liberar só esta"
                            onClick={() => remover(b, false)}>
                      {fmt(b.data)} <X size={11} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-g btn-s btn-erro"
                    onClick={() => remover(g.primeiro, g.datas.length > 1)}>
              {g.datas.length > 1 ? 'Liberar todas' : 'Liberar'}
            </button>
          </div>
        );
      })}
    </>
  );
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

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmt = iso => {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
};
