import { useEffect, useRef, useState } from 'react';
import { podeRemarcar } from '../shared/remarcar.js';
import { toHora } from '../shared/tempo.js';

/* ── arrastar para remarcar ──────────────────────────────────────────────── *
 *
 * Ponteiro, não mouse: o mesmo código atende dedo e cursor, e o painel vai
 * virar app. No toque, o arrasto só começa depois de segurar — sem isso ele
 * brigaria com a rolagem da página, e a agenda ficaria impossível de percorrer
 * no celular.
 *
 * Quem decide se o horário novo vale continua sendo o servidor: ele confere
 * conflito e jornada dentro da mesma transação que grava. Aqui é só a
 * intenção — e é por isso que soltar em cima de outro atendimento devolve erro
 * em vez de sobrescrever.
 *
 * O motor mora fora das telas porque são três grades com a mesma mecânica e
 * geometrias diferentes: a semana (coluna é dia), o dia da Agenda e o dia do
 * Resumo (coluna é profissional). Duplicar isto significaria três cópias de um
 * código que já custou quatro defeitos difíceis — o relógio da borda batendo
 * sozinho, o `pointercancel` da virada, a sombra que sumia, o `setPointerCapture`
 * que derrubava o clique. Uma cópia, um conserto.
 */

const BORDA = 46;        // faixa de "está na beirada", em px
const SEGURAR = 320;     // toque: tempo até o arrasto começar
const PRIMEIRO = 750;    // borda: espera antes do primeiro salto
const SEGUINTES = 1100;

/**
 * @param faixa    [primeira hora, última hora] desenhadas
 * @param regua    [px por hora, folga do topo] — a semana é mais alta que o dia
 * @param grade    seletor do container que delimita a beirada e prende o ponteiro
 * @param virarPagina  o que fazer ao segurar na borda (−1 / +1). Sem isto, não
 *                     há borda: é o caso do Resumo, que mostra um dia só.
 * @param aoSoltar   recebe `{ a, data, hora, prof }` quando o destino vale
 * @param aoTocar    o que fazer quando não houve arrasto nenhum (é um clique)
 */
export function useArrastar({
  agendamentos, bloqueios = [], servicos = [], staff = [], agora,
  passo = 30, faixa, regua, grade = '.agenda', virarPagina = null,
  aoSoltar, aoTocar, aviso,
}) {
  const [arrasto, setArrasto] = useState(null);
  const encerrarRef = useRef(null);

  // Trocar de tela no meio do arrasto deixaria o relógio da borda batendo
  // sozinho, e a agenda andando sem ninguém segurando nada.
  useEffect(() => () => encerrarRef.current?.(), []);

  /** O que a tela sabe dizer sobre um destino, enquanto o dedo está em cima. */
  const conferir = (a, para) => podeRemarcar({
    agendamento: a,
    para,
    profissional: staff.find(p => p.id === (para.prof || a.prof)),
    servico: servicos.find(s => s.id === a.servico),
    agendamentos, bloqueios, agora,
  });

  const aoPegar = (e, a) => {
    // Atendimento que já aconteceu não se remarca; mudar isso é pelo detalhe.
    if (a.status === 'concluido' || a.status === 'falta') { aoTocar?.(a); return; }

    // Duas coisas para o arrasto sobreviver à virada de página, que desmonta o
    // bloco arrastado (ele fica no dia que passou):
    //
    // 1. Os ouvintes vão na JANELA, não no bloco — no bloco, morriam com ele, e
    //    o relógio da borda seguia empurrando a agenda para sempre, sem deixar
    //    voltar.
    // 2. O ponteiro é preso na GRADE, não no bloco. O navegador prende sozinho
    //    em quem recebeu o toque e, quando esse elemento sai do DOM, dispara
    //    `pointercancel` — o arrasto acabava sozinho na primeira virada, a
    //    sombra sumia e soltar não perguntava nada.
    // Em try: prender o ponteiro é melhoria, não requisito. Quando o navegador
    // recusa (ponteiro já solto, evento sintético), a exceção subia do
    // `onPointerDown` e derrubava o clique inteiro — o atendimento nem abria.
    try { e.currentTarget.closest(grade)?.setPointerCapture(e.pointerId); } catch { /* segue sem */ }

    const inicio = { x: e.clientX, y: e.clientY };
    const toque = e.pointerType === 'touch';
    let ativo = false;
    let destino = null;
    // Virar a página segurando na beirada. `lado` guarda em qual borda o dedo
    // está parado; o relógio dispara enquanto continuar lá.
    let lado = null;
    let relogio = null;

    const pararBorda = () => { if (relogio) clearTimeout(relogio); relogio = null; lado = null; };

    const espera = toque
      ? setTimeout(() => { ativo = true; setArrasto({ id: a.id }); }, SEGURAR)
      : null;

    const encerrar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', encerrar);
      if (espera) clearTimeout(espera);
      pararBorda();
      setArrasto(null);
    };

    const mover = ev => {
      const andou = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
      if (!ativo) {
        // No toque, mexer antes de segurar é rolagem: desiste do arrasto.
        if (toque) { if (andou > 8) encerrar(); return; }
        if (andou < 5) return;
        ativo = true;
      }

      // Segurar perto da borda anda no período — é o que permite levar alguém
      // para a semana que vem sem soltar o dedo. O primeiro salto só acontece
      // 750ms depois de chegar ali: passar raspando não vira a agenda, e sair
      // da faixa para o relógio na hora.
      if (virarPagina) {
        const r = document.querySelector(grade)?.getBoundingClientRect();
        const perto = r && (ev.clientX < r.left + BORDA ? -1
          : ev.clientX > r.right - BORDA ? 1 : null);
        if (perto !== lado) {
          pararBorda();
          lado = perto;
          // O primeiro salto espera mais que os seguintes: quem encosta de
          // passagem não vira a agenda, e quem fica ali atravessa o mês sem
          // pressa. Relógio que se remarca, e não `setInterval`, porque os dois
          // tempos são diferentes.
          if (perto) {
            const bater = quanto => {
              relogio = setTimeout(() => { virarPagina(perto); bater(SEGUINTES); }, quanto);
            };
            bater(PRIMEIRO);
          }
        }
      }

      destino = ondeCaiu(ev.clientX, ev.clientY, a, passo, faixa, regua);
      setArrasto(destino
        ? { id: a.id, dur: a.duracao, lado, ...destino, ...conferir(a, destino) }
        : { id: a.id, dur: a.duracao, lado });
    };

    const soltar = () => {
      const alvoFinal = destino;
      const arrastou = ativo;
      encerrar();
      if (!arrastou) { aoTocar?.(a); return; }          // não saiu do lugar: é um toque
      if (!alvoFinal) return;

      const veredito = conferir(a, alvoFinal);
      if (veredito.igual) return;                       // voltou para o mesmo lugar
      // Recusa da tela é aviso, não silêncio: soltar num lugar impossível e
      // nada acontecer faz parecer que o arrasto está quebrado.
      if (!veredito.ok) { aviso?.(`Não dá: ${veredito.motivo}.`); return; }
      aoSoltar({ a, ...alvoFinal });
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', encerrar);
    encerrarRef.current = encerrar;
  };

  return { arrasto, aoPegar, conferir };
}

/**
 * Onde o ponteiro está, dentro da grade: que coluna e que horário.
 *
 * Usa `elementsFromPoint` em vez de medir a grade por conta própria: assim a
 * conta continua certa com a semana rolando na horizontal, com a página rolando
 * na vertical e com qualquer largura de coluna — nada disso precisa ser
 * previsto aqui.
 *
 * A coluna se identifica sozinha: `data-dia` na semana, `data-dia` mais
 * `data-prof` no dia. É o que deixa a mesma função servir às duas grades sem
 * saber qual está desenhada.
 */
function ondeCaiu(x, y, a, passo, [H_INI, H_FIM], [PX_H, TOPO]) {
  const alvo = document.elementsFromPoint(x, y).find(el => el.dataset?.dia);
  if (!alvo) return null;

  const r = alvo.getBoundingClientRect();
  const bruto = H_INI * 60 + (y - r.top - TOPO) * (60 / PX_H);
  const snap = Math.round(bruto / passo) * passo;
  // Não deixa o atendimento nascer antes da abertura nem terminar depois do
  // fim da grade — arrastar para fora não pode virar horário impossível.
  const min = Math.min(Math.max(snap, H_INI * 60), H_FIM * 60 - a.duracao);
  return { data: alvo.dataset.dia, hora: toHora(min), prof: alvo.dataset.prof || a.prof };
}

