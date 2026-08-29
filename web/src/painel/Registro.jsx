import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * O que aconteceu no painel, e quem fez.
 *
 * A pergunta que esta tela existe para responder é sempre a mesma e sempre a
 * mesma urgência: "sumiu o horário da Maria, quem mexeu?". Por isso a linha
 * começa pela frase pronta — não por código, id ou nome de rota — e o resto
 * (quem, quando, o que mudou) vem em volta.
 *
 * Funcionário vê o próprio rastro; dono vê o de todos. O recorte é do servidor.
 */

/** Agrupamentos que fazem sentido procurar, e o rótulo de cada um. */
const FILTROS = [
  ['', 'Tudo'],
  ['agendamento', 'Agenda'],
  ['cliente', 'Clientes'],
  ['servico', 'Serviços'],
  ['acesso', 'Acessos'],
  ['bloqueio', 'Bloqueios'],
  ['config', 'Configuração'],
];

/** Cor por família de ação: o olho acha antes de ler. */
const TOM = {
  'agendamento.cancelado': 'ruim',
  'agendamento.apagado': 'ruim',
  'cliente.apagado': 'ruim',
  'servico.apagado': 'ruim',
  'acesso.removido': 'ruim',
  'profissional.apagada': 'ruim',
  'agendamento.pago': 'bom',
  'agendamento.criado': 'bom',
  'agendamento.combo': 'bom',
  'cliente.criado': 'bom',
};

export default function Registro({ dados, aviso }) {
  const [linhas, setLinhas] = useState(null);
  const [filtro, setFiltro] = useState('');

  const carregar = useCallback(async () => {
    setLinhas(null);
    try { setLinhas(await api.logs(filtro)); }
    catch (e) { aviso(e.message); setLinhas([]); }
  }, [filtro, aviso]);
  useEffect(() => { carregar(); }, [carregar]);

  // Agrupado por dia: quem procura sabe mais ou menos quando foi, e uma lista
  // corrida de trezentas linhas não ajuda a achar nada.
  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const l of linhas || []) {
      const dia = new Date(l.quando).toLocaleDateString('pt-BR');
      if (!mapa.has(dia)) mapa.set(dia, []);
      mapa.get(dia).push(l);
    }
    return [...mapa];
  }, [linhas]);

  return (
    <>
      <div className="head">
        <div>
          <h2>Registro</h2>
          <div className="sub">
            {dados.eu?.papel === 'dono'
              ? 'Tudo que a equipe fez no painel'
              : 'O que você fez no painel'}
          </div>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 16 }}>
        {FILTROS.map(([k, rotulo]) => (
          <button key={k} className={'chip' + (filtro === k ? ' on' : '')}
                  onClick={() => setFiltro(k)}>{rotulo}</button>
        ))}
      </div>

      {linhas === null && <p className="p-fraco" style={{ padding: 20 }}>Carregando…</p>}

      {linhas?.length === 0 && (
        <div className="card" style={{ padding: 34, textAlign: 'center' }}>
          <ScrollText size={26} style={{ color: 'var(--muted)' }} />
          <p className="p-fraco" style={{ margin: '10px 0 0' }}>
            Nada registrado ainda{filtro ? ' nesse filtro' : ''}.
          </p>
        </div>
      )}

      {porDia.map(([dia, doDia]) => (
        <section key={dia} className="reg-dia">
          <h3 className="reg-dia-t">{dia}</h3>
          {doDia.map(l => (
            <article key={l.id} className={'reg' + (TOM[l.acao] ? ' ' + TOM[l.acao] : '')}>
              <span className="reg-hora mono">
                {new Date(l.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="reg-txt">
                <p className="reg-frase">
                  <b>{l.usuario}</b> {l.resumo}
                </p>
                {/* O antes e o depois, só dos campos que mudaram. */}
                {Object.keys(l.detalhe || {}).length > 0 && (
                  <p className="reg-detalhe">
                    {Object.entries(l.detalhe).map(([campo, valor]) => (
                      <span key={campo}>
                        {campo}:{' '}
                        {Array.isArray(valor) && valor.length === 2
                          ? <>{String(valor[0]) || '—'} → <b>{String(valor[1]) || '—'}</b></>
                          : String(valor)}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
