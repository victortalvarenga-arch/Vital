import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Primeira configuração: o que o negócio é, antes de ele existir na tela.
 *
 * Sem isto, a empresa recém-cadastrada cai num painel vazio que fala de
 * "profissional", "serviço" e "cliente" — palavras que uma clínica, um petshop
 * e uma oficina não usam do mesmo jeito. Empresa nenhuma nasce com catálogo de
 * outro ramo, de propósito, e o preço disso é que a primeira tela precisa
 * ensinar o caminho em vez de mostrar dados de mentira.
 *
 * São três perguntas e nenhuma delas é obrigatória de responder "certo": tudo
 * o que sai daqui é editável depois, em Configurações.
 */

/**
 * Sugestões de vocabulário por ramo.
 *
 * Não é lista fechada — o campo continua sendo texto livre, e ramo que não está
 * aqui simplesmente fica com as palavras genéricas. Existe porque preencher seis
 * campos de vocabulário na mão é o tipo de coisa que ninguém faz, e aí o produto
 * fala errado para sempre.
 */
const RAMOS = [
  { ramo: 'Salão de beleza', voc: { profissional: 'profissional', profissionais: 'profissionais' } },
  { ramo: 'Barbearia', voc: { profissional: 'barbeiro', profissionais: 'barbeiros', cliente: 'cliente', clientes: 'clientes' } },
  { ramo: 'Estética', voc: { profissional: 'profissional', profissionais: 'profissionais' } },
  { ramo: 'Clínica', voc: { profissional: 'especialista', profissionais: 'especialistas', servico: 'procedimento', servicos: 'procedimentos', cliente: 'paciente', clientes: 'pacientes' } },
  { ramo: 'Petshop', voc: { profissional: 'atendente', profissionais: 'atendentes', cliente: 'tutor', clientes: 'tutores' } },
  { ramo: 'Tatuagem', voc: { profissional: 'tatuador', profissionais: 'tatuadores', servico: 'trabalho', servicos: 'trabalhos' } },
  { ramo: 'Oficina', voc: { profissional: 'mecânico', profissionais: 'mecânicos', cliente: 'cliente', clientes: 'clientes', unidade: 'oficina', unidades: 'oficinas' } },
];

export default function Comecar({ config, aoConcluir }) {
  const [passo, setPasso] = useState(0);
  const [f, setF] = useState({
    nome: config?.nome && config.nome !== 'Meu negócio' ? config.nome : '',
    ramo: config?.ramo || '',
    voc: {},
    servico: { nome: '', preco: '', duracao: 60 },
    profissional: { nome: '' },
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const muda = patch => setF(v => ({ ...v, ...patch }));

  const escolherRamo = r => muda({ ramo: r.ramo, voc: r.voc });

  const concluir = async () => {
    setOcupado(true);
    setErro(null);
    try {
      await api.salvarConfig({
        nome: f.nome.trim() || 'Meu negócio',
        ramo: f.ramo,
        vocabulario: f.voc,
        configurado: true,
      });

      // Serviço e pessoa são opcionais: quem já sabe se virar pula, e quem não
      // sabe sai daqui com o sistema respondendo alguma coisa em vez de vazio.
      let profId = null;
      if (f.profissional.nome.trim()) {
        const criado = await api.salvarProfissional({
          nome: f.profissional.nome.trim(),
          jornada: Object.fromEntries([1, 2, 3, 4, 5].map(d => [d, ['09:00', '18:00']])),
          ativo: true, funcao: '', fone: '', comissao: 0,
        });
        profId = criado?.id || null;
      }
      if (f.servico.nome.trim()) {
        // Já vinculado a quem acabou de entrar: serviço sem ninguém que o
        // execute não aparece no site, e a empresa sairia daqui achando que
        // configurou e com a agenda vazia.
        await api.salvarServico({
          nome: f.servico.nome.trim(), cat: '', desc: '',
          preco: Number(String(f.servico.preco).replace(',', '.')) || 0,
          duracao: Number(f.servico.duracao) || 60, intervalo: 0,
          ativo: true, profs: profId ? [profId] : [],
        });
      }
      await aoConcluir();
    } catch (e) { setErro(e.message); setOcupado(false); }
  };

  const rotulo = (chave, padrao) => f.voc[chave] || padrao;

  const PASSOS = [
    {
      titulo: 'Como se chama o seu negócio?',
      ajuda: 'É o nome que aparece no site, nas mensagens e no topo do painel.',
      podeSeguir: f.nome.trim().length >= 2,
      corpo: (
        <div className="mfield">
          <label htmlFor="cm-nome">Nome</label>
          <input id="cm-nome" autoFocus value={f.nome} placeholder="Barbearia do João"
                 onChange={e => muda({ nome: e.target.value })} />
        </div>
      ),
    },
    {
      titulo: 'O que vocês fazem?',
      ajuda: 'Serve para o sistema usar as suas palavras. Dá para mudar tudo depois, e escrever outra se a sua não estiver aqui.',
      podeSeguir: true,
      corpo: (
        <>
          <div className="chips" style={{ marginBottom: 12 }}>
            {RAMOS.map(r => (
              <button key={r.ramo} type="button"
                      className={'chip chip-cat' + (f.ramo === r.ramo ? ' on' : '')}
                      onClick={() => escolherRamo(r)}>{r.ramo}</button>
            ))}
          </div>
          <div className="mfield">
            <label htmlFor="cm-ramo">Ou escreva o seu</label>
            <input id="cm-ramo" value={f.ramo}
                   placeholder="Ateliê, consultório, estúdio de dança…"
                   onChange={e => muda({ ramo: e.target.value })} />
          </div>
          {Object.keys(f.voc).length > 0 && (
            <p className="add-ajuda">
              O painel vai falar em <b>{rotulo('profissionais', 'profissionais')}</b>,{' '}
              <b>{rotulo('servicos', 'serviços')}</b> e <b>{rotulo('clientes', 'clientes')}</b>.
            </p>
          )}
        </>
      ),
    },
    {
      titulo: 'Vamos cadastrar o primeiro?',
      ajuda: 'Pode pular — os dois são opcionais e você cadastra o resto depois, com calma.',
      podeSeguir: true,
      corpo: (
        <>
          <div className="mfield">
            <label htmlFor="cm-prof">Quem atende</label>
            <input id="cm-prof" value={f.profissional.nome}
                   placeholder="Seu nome, se for você mesmo"
                   onChange={e => muda({ profissional: { nome: e.target.value } })} />
            <span className="add-ajuda" style={{ marginTop: 5 }}>
              Entra com jornada de segunda a sexta, das 9h às 18h. Ajuste em{' '}
              {rotulo('profissionais', 'Profissionais')}.
            </span>
          </div>
          <div className="mrow">
            <div className="mfield">
              <label htmlFor="cm-svc">Um {rotulo('servico', 'serviço')} que vocês fazem</label>
              <input id="cm-svc" value={f.servico.nome} placeholder="Corte"
                     onChange={e => muda({ servico: { ...f.servico, nome: e.target.value } })} />
            </div>
            <div className="mfield">
              <label htmlFor="cm-preco">Preço (R$)</label>
              <input id="cm-preco" inputMode="decimal" value={f.servico.preco} placeholder="0,00"
                     onChange={e => muda({ servico: { ...f.servico, preco: e.target.value } })} />
            </div>
            <div className="mfield">
              <label htmlFor="cm-dur">Duração (min)</label>
              <input id="cm-dur" type="number" step="5" value={f.servico.duracao}
                     onChange={e => muda({ servico: { ...f.servico, duracao: e.target.value } })} />
            </div>
          </div>
        </>
      ),
    },
  ];

  const atual = PASSOS[passo];
  const ultimo = passo === PASSOS.length - 1;

  return (
    <div className="p-centro">
      <div className="cm">
        <div className="cm-bolinhas" aria-hidden="true">
          {PASSOS.map((_, i) => <span key={i} className={'bolinha' + (i <= passo ? ' on' : '')} />)}
        </div>

        <h2 className="cm-titulo">{atual.titulo}</h2>
        <p className="cm-ajuda">{atual.ajuda}</p>

        <form onSubmit={e => { e.preventDefault(); ultimo ? concluir() : setPasso(p => p + 1); }}>
          {atual.corpo}

          {erro && <p className="cm-erro">{erro}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-p" style={{ flex: 1 }} type="submit"
                    disabled={ocupado || !atual.podeSeguir}>
              {ocupado ? 'Preparando…' : ultimo ? <>Começar a usar <Check size={16} /></> : <>Continuar <ArrowRight size={16} /></>}
            </button>
            {passo > 0 && (
              <button className="btn btn-g" type="button" onClick={() => setPasso(p => p - 1)}>
                Voltar
              </button>
            )}
          </div>
        </form>

        {ultimo && (
          <button className="cm-pular" type="button" onClick={concluir} disabled={ocupado}>
            Pular e cadastrar depois
          </button>
        )}
      </div>
    </div>
  );
}
