import { iniciais } from '../shared/tempo.js';

const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** Quantas pessoas trabalham nesse dia da semana. Zero = a empresa fecha. */
const abertoEm = (iso, staff) => {
  const dow = String(new Date(`${iso}T12:00:00`).getDay());
  return staff.some(p => p.ativo && p.jornada?.[dow]);
};

/**
 * O mês inteiro, um quadrado por dia — a visão de quem está decidindo onde
 * encaixar alguém na semana que vem.
 *
 * Mostra **contagem**, não os atendimentos: trinta dias com seis blocos cada
 * não cabem numa tela, e tentar mostrar viraria texto ilegível. Tocar no dia
 * leva para a visão diária, que é onde estão os nomes — o mês responde "que dia
 * está cheio", o dia responde "quem vem".
 *
 * A semana começa na segunda, como a visão semanal: duas grades que começam em
 * dias diferentes na mesma tela fariam qualquer um contar errado.
 */
export default function GradeDoMes({ mes, agendamentos, hoje, staff, aoEscolherDia }) {
  const [ano, m] = mes.split('-').map(Number);
  const total = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const dias = Array.from({ length: total },
    (_, i) => `${ano}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);

  // Vazios do começo, contados a partir da segunda-feira.
  const antes = (new Date(`${dias[0]}T12:00:00`).getDay() + 6) % 7;

  const porDia = new Map();
  for (const a of agendamentos) {
    if (!porDia.has(a.data)) porDia.set(a.data, []);
    porDia.get(a.data).push(a);
  }

  return (
    <div className="gm">
      <div className="gm-semana" aria-hidden="true">
        {SEMANA.map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="gm-grade">
        {Array.from({ length: antes }, (_, i) => <span key={`v${i}`} className="gm-vazio" />)}
        {dias.map(dia => {
          const doDia = porDia.get(dia) || [];
          const fechado = !abertoEm(dia, staff);
          // Quem atende nesse dia, para a cor aparecer sem precisar de nome.
          const quem = [...new Set(doDia.map(a => a.prof))]
            .map(id => staff.find(p => p.id === id)).filter(Boolean).slice(0, 4);
          return (
            <button key={dia} type="button"
                    className={'gm-dia' + (dia === hoje ? ' hoje' : '') + (fechado ? ' fechado' : '')}
                    onClick={() => aoEscolherDia(dia)}>
              <span className="gm-num">{Number(dia.slice(8))}</span>
              {dia === hoje && <span className="gm-hoje">hoje</span>}
              {doDia.length > 0 ? (
                <>
                  <b className="gm-conta">{doDia.length}</b>
                  <span className="gm-rot">{doDia.length === 1 ? 'atend.' : 'atend.'}</span>
                  <span className="gm-fotos">
                    {quem.map(p => (
                      <i key={p.id} className="avatar gm-foto" style={{ background: p.cor }}>
                        {iniciais(p.nome)}
                      </i>
                    ))}
                  </span>
                </>
              ) : (
                <span className="gm-rot">{fechado ? 'fechado' : '—'}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
