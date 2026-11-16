import { ChevronRight } from 'lucide-react';
import { DIAS } from '../shared/tempo.js';
import { brl } from '../shared/formato.js';

/**
 * A semana da equipe inteira — como ocupação, não como agenda.
 *
 * A grade da semana gasta os dois eixos que tem: hora na vertical, dia na
 * horizontal. Quem atende é uma terceira dimensão, e ela não cabe. Enfiá-la
 * dentro da célula, dividindo a largura, é o que fazia três atendimentos na
 * mesma hora virarem três faixas de 40px com "P…" dentro — nem o nome da
 * cliente, nem de quem era o horário. Nenhum calendário grande entrega isso:
 * no Google, a coluna por pessoa existe só na visão Dia; no Square, quem
 * aparece é um filtro à parte ("só eu", "combinado", "lado a lado") e a coluna
 * por profissional só existe no lado a lado. A semana, em todos, é de uma
 * pessoa de cada vez.
 *
 * Então a Vital faz as duas coisas em vez de uma mal feita: **com uma
 * profissional escolhida**, a semana é a grade de sempre, hora a hora, com a
 * coluna inteira para cada bloco; **com a equipe toda**, é esta tela, que
 * responde a pergunta que se faz olhando uma semana adiante — "como está a
 * semana que vem?". Detalhe de quem atende quem é pergunta do dia, e a aba
 * Dia responde com uma coluna por pessoa.
 *
 * **Lista, e não sete colunas.** Chegou a ser desenhada em colunas, para
 * parecer um calendário (2026-11-16), e em colunas de 112px os sete dias não
 * cabem num celular: vira rolagem horizontal com três dias à vista, que é o
 * contrário de "a semana de relance". Em lista, os sete dias cabem na tela de
 * uma vez e cada linha ainda tem largura para dizer quem atendeu quantos.
 *
 * A barra compara os dias **entre si**: a mais larga é o dia mais cheio da
 * semana, e cada pedaço é o tempo de uma profissional, na cor dela. Minutos, e
 * não número de atendimentos: um alongamento de 150 minutos enche a agenda de
 * um jeito que três designs de 45 não enchem, e contar cabeças diria que a
 * tarde está livre.
 */
export default function SemanaResumo({ semana, agendamentos, staff, hoje, aoAbrirDia }) {
  const diaDaSemana = iso => new Date(iso + 'T12:00:00').getDay();

  const dias = semana.map(data => {
    const daqui = agendamentos.filter(a => a.data === data);
    const porPessoa = staff
      .map(p => {
        const dela = daqui.filter(a => a.prof === p.id);
        return { p, n: dela.length, min: dela.reduce((s, a) => s + a.duracao, 0) };
      })
      .filter(x => x.n > 0)
      .sort((a, b) => b.min - a.min);
    return {
      data,
      n: daqui.length,
      valor: daqui.reduce((s, a) => s + a.valor, 0),
      min: daqui.reduce((s, a) => s + a.duracao, 0),
      porPessoa,
      // Ninguém em jornada é dia fechado — "nenhum atendimento" num domingo
      // soa como agenda vazia, e o que houve foi a loja não abrir.
      aberta: staff.some(p => p.ativo && p.jornada?.[diaDaSemana(data)]),
    };
  });

  // O dia mais cheio da semana define a largura cheia. Sem um piso, uma semana
  // com um atendimento só desenharia esse dia como lotado.
  const pico = Math.max(...dias.map(d => d.min), 240);

  return (
    <div className="sm">
      <p className="sm-dica">
        A semana da equipe mostra o quanto cada dia está ocupado. Para ver hora a
        hora, escolha uma profissional no filtro acima — ou toque num dia.
      </p>

      <div className="card list">
        {dias.map(d => (
          <button key={d.data} type="button"
                  className={'li sm-dia' + (d.data === hoje ? ' hoje' : '')}
                  onClick={() => aoAbrirDia(d.data)}>
            <span className="sm-data">
              <span className="sm-nome">{DIAS[diaDaSemana(d.data)]}</span>
              <span className="sm-num">{d.data.slice(8)}</span>
            </span>

            <span className="sm-corpo">
              <span className="sm-numeros">
                {d.n === 0
                  ? <span className="sm-vazio">{d.aberta ? 'Nenhum atendimento' : 'Fechado'}</span>
                  : <>
                      <span>{d.n} {d.n === 1 ? 'atendimento' : 'atendimentos'}</span>
                      <span className="mono sm-valor">{brl(d.valor)}</span>
                    </>}
              </span>

              {/* Decorativa: tudo o que ela diz está escrito do lado, em
                  número e em nome. Leitor de tela lendo barra não ganha nada. */}
              {d.n > 0 && (
                <span className="sm-barra" aria-hidden="true"
                      style={{ width: `${Math.max(Math.round(100 * d.min / pico), 4)}%` }}>
                  {d.porPessoa.map(x => (
                    <span key={x.p.id} style={{ flexGrow: x.min, background: x.p.cor }} />
                  ))}
                </span>
              )}

              {d.porPessoa.length > 0 && (
                <span className="sm-quem">
                  {d.porPessoa.map(x => (
                    <span key={x.p.id} className="sm-quem-um">
                      <i style={{ background: x.p.cor }} aria-hidden="true" />
                      {x.p.nome.split(' ')[0]} {x.n}
                    </span>
                  ))}
                </span>
              )}
            </span>

            <ChevronRight size={16} className="sm-seta" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
