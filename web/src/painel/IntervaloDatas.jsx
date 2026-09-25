import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { intervaloPorExtenso } from '../shared/periodo.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const pad = n => String(n).padStart(2, '0');
const iso = (ano, mes, dia) => `${ano}-${pad(mes)}-${pad(dia)}`;

/** Os dias de um mês em semanas de domingo a sábado, com `null` nos vazios do começo. */
function celulasDoMes(ano, mes) {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return [
    ...Array(primeiro).fill(null),
    ...Array.from({ length: total }, (_, i) => iso(ano, mes, i + 1)),
  ];
}

/**
 * Escolher de que dia a que dia: um calendário, dois toques.
 *
 * O primeiro toque marca o início, o segundo o fim (se vier antes do início,
 * trocam de lugar sozinhos). Um terceiro recomeça. Só "Aplicar" muda o período
 * da tela — abrir e fechar sem aplicar não mexe em nada, e dá para desistir.
 *
 * Feito à mão, sem biblioteca de datas: são quarenta linhas, a tela é
 * mobile-first (cada dia tem 44px de toque) e nenhuma dependência sabe que o
 * calendário do painel começa no domingo e que o futuro não se escolhe.
 */
export default function IntervaloDatas({ de, ate, hoje, aoAplicar, aoFechar }) {
  const [ini, setIni] = useState(de || null);
  const [fim, setFim] = useState(de && ate && de !== ate ? ate : null);
  const [ano, setAno] = useState(Number((de || hoje).slice(0, 4)));
  const [mes, setMes] = useState(Number((de || hoje).slice(5, 7)));
  const raiz = useRef(null);

  useEffect(() => {
    const fora = e => { if (!raiz.current?.contains(e.target)) aoFechar(); };
    const esc = e => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aoFechar]);

  const [anoHoje, mesHoje] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  const noMesAtual = ano === anoHoje && mes === mesHoje;

  const andar = passo => {
    const total = ano * 12 + (mes - 1) + passo;
    setAno(Math.floor(total / 12));
    setMes((total % 12) + 1);
  };

  const tocar = dia => {
    if (!ini || fim) { setIni(dia); setFim(null); return; }
    if (dia < ini) { setFim(ini); setIni(dia); } else setFim(dia);
  };

  // Um toque só vale um dia só: quem quer olhar "ontem" não precisa de dois.
  const fimEfetivo = fim || ini;

  return (
    <div ref={raiz} className="dr card" role="dialog" aria-label="Escolher período">
      <div className="dr-topo">
        <button type="button" className="fin-seta" aria-label="Mês anterior" onClick={() => andar(-1)}>
          <ChevronLeft size={16} />
        </button>
        <b className="dr-mes">{MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1)} {ano}</b>
        <button type="button" className="fin-seta" aria-label="Próximo mês"
                disabled={noMesAtual} onClick={() => andar(1)}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="dr-grade" role="grid">
        {SEMANA.map((d, i) => <span key={i} className="dr-sem" aria-hidden="true">{d}</span>)}
        {celulasDoMes(ano, mes).map((dia, i) => {
          if (!dia) return <span key={`v${i}`} />;
          const futuro = dia > hoje;
          const extremo = dia === ini || dia === fimEfetivo;
          const dentro = ini && fimEfetivo && dia > ini && dia < fimEfetivo;
          return (
            <button key={dia} type="button" disabled={futuro}
                    aria-pressed={extremo}
                    aria-label={intervaloPorExtenso(dia, dia, hoje)}
                    className={'dr-dia' + (extremo ? ' ponta' : '') + (dentro ? ' dentro' : '')
                      + (dia === hoje ? ' hoje' : '')}
                    onClick={() => tocar(dia)}>
              {Number(dia.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="dr-rodape">
        <span className="dr-escolha">
          {ini ? intervaloPorExtenso(ini, fimEfetivo, hoje) : 'Toque no primeiro dia'}
          {ini && !fim && <small> · toque no último dia, ou aplique só este</small>}
        </span>
        <div className="dr-botoes">
          <button type="button" className="btn btn-g btn-s" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="btn btn-p btn-s" disabled={!ini}
                  onClick={() => aoAplicar({ de: ini, ate: fimEfetivo })}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}
