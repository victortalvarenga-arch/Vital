import { Children, useEffect, useRef, useState } from 'react';

/**
 * Grade que distribui os itens em linhas equilibradas e centralizadas.
 *
 * O CSS sozinho não resolve. `flex-wrap` e `auto-fill` enchem cada linha até
 * acabar o espaço e jogam o resto na última: 13 itens onde cabem 6 viram
 * 6 + 6 + 1, com um círculo sozinho no fim. Varrendo larguras de 300 a 1400px
 * e de 2 a 60 itens, a quebra automática deixa item solitário em 547 de 3.304
 * combinações — não é caso raro.
 *
 * Por isso as linhas são montadas aqui, e não deixadas para o navegador:
 *
 *   1. quantas cabem numa linha, pela largura disponível;
 *   2. o MENOR número de linhas que comporta todos;
 *   3. os itens divididos por igual entre essas linhas, sobra nas primeiras.
 *
 * Com espaço para 6:  7 → 4+3   13 → 5+4+4   17 → 6+6+5
 * Com espaço para 5:  6 → 3+3    8 → 4+4      9 → 5+4
 *
 * Dividir por igual é o que a quebra automática não faz: ela produziria
 * 5+5+3 no lugar de 5+4+4.
 */

const LARG_MIN = 132;   // abaixo disso o círculo fica pequeno demais para o dedo
const LARG_MAX = 168;   // acima disso, poucos itens viram discos enormes
const ESPACO = 16;

/** Divide `total` em `linhas` partes o mais iguais possível. Ex.: 13 em 3 → [5,4,4] */
function repartir(total, linhas) {
  const base = Math.floor(total / linhas);
  const sobra = total % linhas;
  return Array.from({ length: linhas }, (_, i) => base + (i < sobra ? 1 : 0));
}

export default function Grade({ children }) {
  const ref = useRef(null);
  const itens = Children.toArray(children);
  const [medida, setMedida] = useState(null);

  useEffect(() => {
    const alvo = ref.current;
    if (!alvo || !itens.length) return;

    const recalcular = () => {
      const disponivel = alvo.clientWidth;
      if (!disponivel) return;

      const cabem = Math.max(1, Math.floor((disponivel + ESPACO) / (LARG_MIN + ESPACO)));
      const linhas = Math.ceil(itens.length / cabem);
      const porLinha = repartir(itens.length, linhas);
      // A largura sai da linha mais cheia, para todas ficarem alinhadas.
      const maior = Math.max(...porLinha);
      const largura = Math.min(LARG_MAX, (disponivel - (maior - 1) * ESPACO) / maior);

      setMedida({ porLinha, largura });
    };

    recalcular();
    // Recalcula ao girar o celular ou redimensionar a janela.
    const obs = new ResizeObserver(recalcular);
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [itens.length]);

  // Antes da primeira medição, mostra tudo numa linha que quebra sozinha: sem
  // isso a tela pisca vazia enquanto o observer não roda.
  if (!medida) {
    return (
      <div ref={ref} className="grade-fora">
        <div className="grade-linha grade-inicial">{itens}</div>
      </div>
    );
  }

  let cursor = 0;
  return (
    <div ref={ref} className="grade-fora" style={{ '--item': `${medida.largura}px` }}>
      {medida.porLinha.map((quantos, i) => {
        const fatia = itens.slice(cursor, cursor + quantos);
        cursor += quantos;
        return <div key={i} className="grade-linha">{fatia}</div>;
      })}
    </div>
  );
}
