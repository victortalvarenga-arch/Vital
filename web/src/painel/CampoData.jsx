import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { comMascara, paraBR, paraISO } from '../shared/datas-br.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = n => String(n).padStart(2, '0');
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Os dias do mês em semanas de domingo a sábado, com `null` nos vazios. */
function celulasDoMes(ano, mes) {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return [
    ...Array(primeiro).fill(null),
    ...Array.from({ length: total }, (_, i) => `${ano}-${pad(mes)}-${pad(i + 1)}`),
  ];
}

/**
 * Campo de data em dd/mm/aaaa — escrito ou escolhido no calendário.
 *
 * O `<input type="date">` do navegador desenha no formato da LÍNGUA DO
 * NAVEGADOR, não da página: num Windows em inglês o mesmo campo mostra
 * 09/25/2026, e `lang="pt-BR"` não muda isso (testado). Numa tela onde se marca
 * horário, ler 09/25 como 9 de maio é um agendamento errado — por isso o campo
 * é nosso.
 *
 * Aceita digitar (as barras entram sozinhas) e escolher no calendário. Enquanto
 * a data não existe — 31/02, ano pela metade — o valor não sobe: quem digita
 * "3" não deve ver a tela recarregar horários para o ano 3.
 *
 * O valor de fora e de volta continua sendo `'YYYY-MM-DD'`, como o resto do
 * sistema; o formato brasileiro só existe na tela.
 */
export default function CampoData({ valor, aoMudar, min, id }) {
  const [texto, setTexto] = useState(paraBR(valor));
  const [aberto, setAberto] = useState(false);
  const [mesVisto, setMesVisto] = useState(valor || '');
  const raiz = useRef(null);

  // Mudou por fora (outra tela escolheu o dia): o texto acompanha. Digitando,
  // quem manda é o texto — senão a máscara brigaria com o valor a cada tecla.
  useEffect(() => { setTexto(paraBR(valor)); }, [valor]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = e => { if (!raiz.current?.contains(e.target)) setAberto(false); };
    const esc = e => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const digitar = e => {
    const t = comMascara(e.target.value);
    setTexto(t);
    const iso = paraISO(t);
    if (iso && (!min || iso >= min)) aoMudar(iso);
  };

  const base = (mesVisto || valor || new Date().toISOString().slice(0, 10));
  const [ano, mes] = base.split('-').map(Number);
  const andar = passo => {
    const total = ano * 12 + (mes - 1) + passo;
    setMesVisto(`${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`);
  };

  return (
    <div className="cd" ref={raiz}>
      <input id={id} type="text" inputMode="numeric" placeholder="dd/mm/aaaa"
             value={texto} onChange={digitar}
             aria-invalid={texto.length === 10 && !paraISO(texto) ? 'true' : undefined} />
      <button type="button" className="cd-abrir" aria-label="Escolher no calendário"
              aria-expanded={aberto}
              onClick={() => { setMesVisto(valor || ''); setAberto(v => !v); }}>
        <CalendarDays size={16} />
      </button>

      {aberto && (
        <div className="dr card cd-pop" role="dialog" aria-label="Escolher o dia">
          <div className="dr-topo">
            <button type="button" className="fin-seta" aria-label="Mês anterior"
                    onClick={() => andar(-1)}><ChevronLeft size={16} /></button>
            <b className="dr-mes">{MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1)} {ano}</b>
            <button type="button" className="fin-seta" aria-label="Próximo mês"
                    onClick={() => andar(1)}><ChevronRight size={16} /></button>
          </div>
          <div className="dr-grade" role="grid">
            {SEMANA.map((d, i) => <span key={i} className="dr-sem" aria-hidden="true">{d}</span>)}
            {celulasDoMes(ano, mes).map((dia, i) => {
              if (!dia) return <span key={`v${i}`} />;
              return (
                <button key={dia} type="button" disabled={min && dia < min}
                        aria-pressed={dia === valor}
                        className={'dr-dia' + (dia === valor ? ' ponta' : '')}
                        onClick={() => { aoMudar(dia); setAberto(false); }}>
                  {Number(dia.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
