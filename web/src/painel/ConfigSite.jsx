import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Image, Link2, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { prepararImagem } from '../shared/imagem.js';

/**
 * Configuração do site da cliente.
 *
 * Tudo que a empresa muda sem programador mora aqui: identidade, marca, textos
 * e o que aparece ou não. Grava em `tenants.config`, o mesmo JSON que
 * `/api/publico/vitrine` lê — então salvar aqui muda o site na hora, sem
 * rebuild.
 */
export default function ConfigSite({ dados, acao, aviso }) {
  const [cfg, setCfg] = useState(dados.config);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Recarregou de fora (outra aba salvou, por exemplo): só aceita se não há
  // edição pendente, senão apagaria o que a pessoa está escrevendo.
  useEffect(() => { if (!sujo) setCfg(dados.config); }, [dados.config, sujo]);

  const mudar = (caminho, valor) => {
    setSujo(true);
    setCfg(c => {
      if (!caminho.includes('.')) return { ...c, [caminho]: valor };
      const [secao, chave] = caminho.split('.');
      return { ...c, [secao]: { ...c[secao], [chave]: valor } };
    });
  };

  const salvar = async () => {
    setSalvando(true);
    const ok = await acao(() => api.salvarConfig(cfg), 'Site atualizado');
    if (ok) setSujo(false);
    setSalvando(false);
  };

  const { contas, recarregarContas, retorno } = useConexoes();
  const insta = contas.find(c => c.provedor === 'instagram');
  const google = contas.find(c => c.provedor === 'google');
  // Uma ação de conexão muda a config no servidor (o job escreve nela); o
  // `acao` recarrega o painel, e aqui recarrega a situação das contas.
  const agirNaConta = async (fn, mensagem) => {
    const ok = await acao(fn, mensagem);
    await recarregarContas();
    return ok;
  };

  return (
    <div className="cs">
      <header className="cs-topo">
        <div>
          <h1>Site da cliente</h1>
          <p>O que está aqui é o que a cliente vê ao abrir o endereço do negócio.</p>
        </div>
        <div className="cs-acoes">
          <a className="btn btn-g btn-s" href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Abrir o site
          </a>
          <button className="btn btn-p btn-s" disabled={!sujo || salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : sujo ? 'Salvar alterações' : 'Tudo salvo'}
          </button>
        </div>
      </header>

      {retorno && <p className={'cx-retorno' + (retorno.ok ? '' : ' cx-retorno-falha')} role="status">{retorno.texto}</p>}

      <Secao titulo="Identidade" ajuda="Nome e descrição que aparecem no topo do site.">
        <Texto rotulo="Nome do negócio" valor={cfg.nome} aoMudar={v => mudar('nome', v)} />
        <Texto rotulo="Slogan" valor={cfg.slogan} aoMudar={v => mudar('slogan', v)}
               dica="Uma linha curta abaixo do nome." />
        <Area rotulo="Sobre" valor={cfg.sobre} aoMudar={v => mudar('sobre', v)}
              dica="Um parágrafo sobre o negócio. Deixe vazio para não mostrar." />
      </Secao>

      <Secao titulo="Marca" ajuda="Modelo, cor e imagens. Mudam o site inteiro na hora.">
        <Modelo valor={cfg.marca?.template} aoMudar={v => mudar('marca.template', v)} />
        <Cor rotulo="Cor principal" valor={cfg.marca?.corPrimaria}
             aoMudar={v => mudar('marca.corPrimaria', v)}
             dica="Usada nos botões e destaques, em qualquer modelo." />
        <Imagem rotulo="Logo" uso="logo" valor={cfg.marca?.logo} largura={600}
                aoMudar={v => mudar('marca.logo', v)} aviso={aviso}
                dica="Quadrada fica melhor — aparece dentro de um círculo." />
        <Imagem rotulo="Capa" uso="capa" valor={cfg.marca?.capa} largura={1600}
                aoMudar={v => mudar('marca.capa', v)} aviso={aviso}
                dica="Faixa larga no topo, opcional. Sem capa, o nome do negócio já abre a página." />
      </Secao>

      <Secao titulo="Textos" ajuda="As palavras dos botões e das mensagens do site.">
        <Area rotulo="Frase de abertura" valor={cfg.textos?.hero}
              aoMudar={v => mudar('textos.hero', v)}
              dica="A primeira frase, abaixo do nome. Funciona melhor quando fala de um
                    incômodo concreto de quem procura o serviço, e não do negócio em geral.
                    Vazia, o site usa a primeira frase do “Sobre”." />
        <Texto rotulo="Chamada principal" valor={cfg.textos?.chamada}
               aoMudar={v => mudar('textos.chamada', v)} dica="Ex.: Agende seu horário" />
        <Texto rotulo="Botão de cada serviço" valor={cfg.textos?.botaoAgendar}
               aoMudar={v => mudar('textos.botaoAgendar', v)} dica="Ex.: Agendar" />
        <Texto rotulo="Mensagem de confirmação" valor={cfg.textos?.confirmacao}
               aoMudar={v => mudar('textos.confirmacao', v)} />
        <Texto rotulo="Rodapé" valor={cfg.textos?.rodape}
               aoMudar={v => mudar('textos.rodape', v)} dica="Deixe vazio para usar o nome do negócio." />
      </Secao>

      <Secao titulo="Contato" ajuda="Aparece no topo e no rodapé, com link.">
        <Texto rotulo="Endereço" valor={cfg.endereco} aoMudar={v => mudar('endereco', v)} />
        <Texto rotulo="Cidade" valor={cfg.cidade} aoMudar={v => mudar('cidade', v)}
               dica="Só o nome da cidade. Entra no título da página e no cadastro que o Google lê —
                     é por cidade que as pessoas procuram serviço." />
        <Texto rotulo="Link do mapa" valor={cfg.mapa} aoMudar={v => mudar('mapa', v)}
               dica="Cole o link do Google Maps. Vazio: o site monta a busca pelo endereço." />
        <Texto rotulo="WhatsApp" valor={cfg.whatsapp} aoMudar={v => mudar('whatsapp', v)}
               dica="Só números, com DDD." />
      </Secao>

      <Secao titulo="Perguntas frequentes"
             ajuda="Viram uma seção no site, e o Google as usa para mostrar as respostas direto na busca.">
        <Perguntas lista={cfg.faq || []} aoMudar={v => mudar('faq', v)} />
      </Secao>

      <Secao titulo="Antes e depois"
             ajuda="No modelo Clínica, viram uma seção de resultados no site, com as duas fotos lado a lado. A seção só aparece com pelo menos um caso.">
        <AntesDepois lista={cfg.antesDepois || []} aoMudar={v => mudar('antesDepois', v)} aviso={aviso} />
      </Secao>

      <Secao titulo="Avaliações do Google"
             ajuda="No modelo Clínica, as avaliações da sua ficha no Google aparecem no site e se atualizam sozinhas, de hora em hora.">
        <Conexao info={google} nome="Google" agir={agirNaConta}
                 explica="Entre com a conta do Google que administra a ficha da empresa. O site mostra a nota, o total e as avaliações mais recentes de 4 e 5 estrelas, com link para todas." />
      </Secao>

      <Secao titulo="Instagram" ajuda="O perfil vai para o rodapé e, no modelo Clínica, ganha uma seção com as publicações.">
        <Conexao info={insta} nome="Instagram" agir={agirNaConta}
                 explica="Conecte a conta e as 6 publicações mais recentes entram no site sozinhas. Precisa ser conta profissional (comercial ou criador)." />
        {insta?.conectado ? (
          <PreviaPublicacoes lista={cfg.instagramPosts || []} />
        ) : (
          <>
            <Texto rotulo="Perfil" valor={cfg.instagram} aoMudar={v => mudar('instagram', v)}
                   dica="Só o nome do perfil, sem @." />
            <Publicacoes lista={cfg.instagramPosts || []} aoMudar={v => mudar('instagramPosts', v)} aviso={aviso} />
          </>
        )}
      </Secao>

      <Secao titulo="O que mostrar" ajuda="Cada item liga ou desliga um pedaço do site.">
        <Chave rotulo="Preço dos serviços" ligado={cfg.exibir?.preco !== false}
               aoMudar={v => mudar('exibir.preco', v)}
               dica="Desligado, todos aparecem como “Sob consulta”." />
        <Chave rotulo="Duração dos serviços" ligado={cfg.exibir?.duracao !== false}
               aoMudar={v => mudar('exibir.duracao', v)} />
        <Chave rotulo="Fotos dos serviços" ligado={cfg.exibir?.fotos !== false}
               aoMudar={v => mudar('exibir.fotos', v)} />
        <Chave rotulo="Separar por categoria" ligado={cfg.exibir?.categorias !== false}
               aoMudar={v => mudar('exibir.categorias', v)}
               dica="Ligado, a cliente escolhe a categoria antes de ver os serviços." />
        <Chave rotulo="Deixar escolher o profissional" ligado={cfg.exibir?.escolherProfissional !== false}
               aoMudar={v => mudar('exibir.escolherProfissional', v)}
               dica="Desligado, o sistema escolhe quem estiver livre." />
      </Secao>

      <Secao titulo="Agenda" ajuda="Regras que o site respeita ao oferecer horários.">
        <Numero rotulo="Dias à frente" valor={cfg.janelaDias} aoMudar={v => mudar('janelaDias', v)}
                dica="Até quando a cliente consegue agendar." />
        <Numero rotulo="Antecedência mínima (horas)" valor={cfg.antecedenciaHoras}
                aoMudar={v => mudar('antecedenciaHoras', v)}
                dica="Impede agendar para daqui a dez minutos." />
        <Numero rotulo="Intervalo da grade (minutos)" valor={cfg.passoAgenda}
                aoMudar={v => mudar('passoAgenda', v)}
                dica="De quanto em quanto tempo os horários são oferecidos." />
      </Secao>

      {sujo && (
        <div className="cs-barra">
          <span>Alterações não salvas</span>
          <button className="btn btn-p btn-s" disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── peças ── */

const Secao = ({ titulo, ajuda, children }) => (
  <section className="cs-sec">
    <div className="cs-sec-cab">
      <h2>{titulo}</h2>
      {ajuda && <p>{ajuda}</p>}
    </div>
    <div className="cs-campos">{children}</div>
  </section>
);

const Linha = ({ rotulo, dica, children }) => (
  <div className="cs-campo">
    <label>{rotulo}</label>
    {children}
    {dica && <span className="cs-dica">{dica}</span>}
  </div>
);

const Texto = ({ rotulo, valor, aoMudar, dica }) => (
  <Linha rotulo={rotulo} dica={dica}>
    <input value={valor ?? ''} onChange={e => aoMudar(e.target.value)} />
  </Linha>
);

const Area = ({ rotulo, valor, aoMudar, dica }) => (
  <Linha rotulo={rotulo} dica={dica}>
    <textarea rows={3} value={valor ?? ''} onChange={e => aoMudar(e.target.value)} />
  </Linha>
);

const Numero = ({ rotulo, valor, aoMudar, dica }) => (
  <Linha rotulo={rotulo} dica={dica}>
    <input type="number" min={0} value={valor ?? ''} onChange={e => aoMudar(+e.target.value)} />
  </Linha>
);

const Cor = ({ rotulo, valor, aoMudar, dica }) => (
  <Linha rotulo={rotulo} dica={dica}>
    <div className="cs-cor">
      <input type="color" value={valor || '#A32A4E'} onChange={e => aoMudar(e.target.value)} />
      <input className="mono" value={valor || ''} onChange={e => aoMudar(e.target.value)} />
    </div>
  </Linha>
);

// Nome e descrição de cada modelo — ver DESIGN.md para a identidade completa
// de cada um. A cor de marca é escolha da empresa em qualquer modelo; o que
// muda aqui é forma, tipografia e sombra.
const MODELOS = [
  { id: 'bandeja', nome: 'Bandeja', descricao: 'Sombra suave, foto em círculo — o modelo padrão.' },
  { id: 'quadro', nome: 'Quadro de Horários', descricao: 'Fundo escuro, números em fonte de dado, cantos retos.' },
  { id: 'caderneta', nome: 'Caderneta', descricao: 'Papel kraft com linhas de caderno, toque de caligrafia na confirmação.' },
  { id: 'clinica', nome: 'Clínica', descricao: 'Neutro e espaçoso, estética de clínica premium.' },
];

const Modelo = ({ valor, aoMudar }) => (
  <Linha rotulo="Modelo do site"
         dica="Muda a forma, a tipografia e a sombra do site inteiro — a cor acima continua sendo sua em qualquer um.">
    <div className="chips">
      {MODELOS.map(m => (
        <button key={m.id} type="button" title={m.descricao}
                className={'chip' + ((valor || 'bandeja') === m.id ? ' on' : '')}
                onClick={() => aoMudar(m.id)}>
          {m.nome}
        </button>
      ))}
    </div>
  </Linha>
);

const Chave = ({ rotulo, ligado, aoMudar, dica }) => (
  <div className="cs-chave">
    <button className={'sw' + (ligado ? ' on' : '')} onClick={() => aoMudar(!ligado)}
            role="switch" aria-checked={ligado} aria-label={rotulo}>
      <span />
    </button>
    <div>
      <div className="cs-chave-nome">{rotulo}</div>
      {dica && <span className="cs-dica">{dica}</span>}
    </div>
  </div>
);

/**
 * Escolher um arquivo, reduzir no navegador e subir. Devolve o que o botão
 * precisa: a ref do <input type=file>, se está subindo, e o handler.
 *
 * Reduz antes de subir porque foto de celular tem 8 MB e vai aparecer em
 * 90px (logo) ou 400px (publicação) — o servidor limita em 3 MB.
 */
function useEnviarImagem({ uso, largura, aoEnviar, aviso }) {
  const entrada = useRef(null);
  const [subindo, setSubindo] = useState(false);

  const escolher = async e => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';           // deixa reescolher o mesmo arquivo depois
    if (!arquivo) return;
    setSubindo(true);
    try {
      const dataUrl = await prepararImagem(arquivo, { largura });
      const { url } = await api.enviarImagem(dataUrl, uso);
      aoEnviar(url);
    } catch (erro) {
      aviso?.(erro.message);
    } finally {
      setSubindo(false);
    }
  };

  return { entrada, subindo, escolher, abrir: () => entrada.current?.click() };
}

function Imagem({ rotulo, uso, valor, largura, aoMudar, dica, aviso }) {
  const { entrada, subindo, escolher, abrir } = useEnviarImagem({ uso, largura, aoEnviar: aoMudar, aviso });

  return (
    <Linha rotulo={rotulo} dica={dica}>
      <div className="cs-img">
        <div className="cs-img-previa">
          {valor ? <img src={valor} alt="" /> : <Image size={20} />}
        </div>
        <div className="cs-img-btns">
          <button className="btn btn-g btn-s" disabled={subindo} onClick={abrir}>
            <Upload size={14} /> {subindo ? 'Enviando…' : valor ? 'Trocar' : 'Enviar'}
          </button>
          {valor && (
            <button className="btn btn-g btn-s" onClick={() => aoMudar('')} title="Remover">
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <input ref={entrada} type="file" accept="image/*" hidden onChange={escolher} />
      </div>
    </Linha>
  );
}

/**
 * As perguntas e respostas do site.
 *
 * Sem sugestão nossa de pergunta, de propósito: a dúvida que trava uma venda
 * é de cada ramo — "dói?" não serve a uma oficina, "quanto tempo dura?" não
 * serve a um consultório. Os exemplos abaixo são só o que cabe no campo
 * vazio, e falam de forma, não de assunto.
 */
function Perguntas({ lista, aoMudar }) {
  const trocar = (i, patch) => aoMudar(lista.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  const remover = i => aoMudar(lista.filter((_, n) => n !== i));
  const mover = (i, para) => {
    if (para < 0 || para >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[para]] = [nova[para], nova[i]];
    aoMudar(nova);
  };

  return (
    <Linha rotulo="Perguntas"
           dica="Comece pelas que você mais responde no WhatsApp — é o que faz alguém desistir
                 antes de agendar. A seção some do site quando não há nenhuma.">
      <div className="cs-faq">
        {lista.map((p, i) => (
          <div key={i} className="cs-faq-item">
            <input placeholder="A pergunta, como a cliente faria" value={p.pergunta || ''}
                   onChange={e => trocar(i, { pergunta: e.target.value })} />
            <textarea rows={3} placeholder="A resposta, curta e direta" value={p.resposta || ''}
                      onChange={e => trocar(i, { resposta: e.target.value })} />
            <div className="cs-faq-btns">
              {/* Lista vertical: a seta aponta para onde o item vai. */}
              <button className="btn btn-g btn-s" onClick={() => mover(i, i - 1)} disabled={i === 0}
                      aria-label="Mover para cima"><ChevronUp size={14} /></button>
              <button className="btn btn-g btn-s" onClick={() => mover(i, i + 1)} disabled={i === lista.length - 1}
                      aria-label="Mover para baixo"><ChevronDown size={14} /></button>
              <button className="btn btn-g btn-s" onClick={() => remover(i)} aria-label="Remover pergunta">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <button className="btn btn-g btn-s" onClick={() => aoMudar([...lista, { pergunta: '', resposta: '' }])}>
          <Plus size={14} /> Adicionar pergunta
        </button>
      </div>
    </Linha>
  );
}

/**
 * As publicações do Instagram que o site mostra — até 6, na ordem da lista.
 *
 * Cada uma é foto + link do post, escolhida e enviada pela empresa. É o
 * caminho de quem não conectou a conta — perfil pessoal, por exemplo, que a
 * Meta não deixa conectar. Conectada, a lista vem da conta e a tela vira
 * `PreviaPublicacoes`.
 */
const MAX_POSTS = 6;

function Publicacoes({ lista, aoMudar, aviso }) {
  const posts = lista.slice(0, MAX_POSTS);
  const trocar = (i, patch) => aoMudar(posts.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  const remover = i => aoMudar(posts.filter((_, n) => n !== i));
  const mover = (i, para) => {
    if (para < 0 || para >= posts.length) return;
    const nova = [...posts];
    [nova[i], nova[para]] = [nova[para], nova[i]];
    aoMudar(nova);
  };
  const { entrada, subindo, escolher, abrir } = useEnviarImagem({
    uso: 'instagram', largura: 1080, aviso,
    aoEnviar: url => aoMudar([...posts, { imagem: url, link: '' }]),
  });

  return (
    <Linha rotulo="Publicações"
           dica="Até 6, na ordem em que aparecem. Suba a foto e, se quiser, cole o link da publicação — sem link, o toque abre o perfil.">
      <div className="cs-posts">
        {posts.map((p, i) => (
          <div key={p.imagem + i} className="cs-post">
            <img src={p.imagem} alt="" />
            <input placeholder="Link do post" value={p.link || ''}
                   onChange={e => trocar(i, { link: e.target.value })} />
            <div className="cs-post-btns">
              <button className="btn btn-g btn-s" onClick={() => mover(i, i - 1)} disabled={i === 0}
                      aria-label="Mover para antes"><ChevronLeft size={14} /></button>
              <button className="btn btn-g btn-s" onClick={() => mover(i, i + 1)} disabled={i === posts.length - 1}
                      aria-label="Mover para depois"><ChevronRight size={14} /></button>
              <button className="btn btn-g btn-s" onClick={() => remover(i)} aria-label="Remover publicação">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {posts.length < MAX_POSTS && (
          <button className="cs-post cs-post-nova" disabled={subindo} onClick={abrir}>
            <Upload size={18} />
            <span>{subindo ? 'Enviando…' : `Adicionar foto (${posts.length}/${MAX_POSTS})`}</span>
          </button>
        )}
        <input ref={entrada} type="file" accept="image/*" hidden onChange={escolher} />
      </div>
    </Linha>
  );
}

/**
 * Casos de antes e depois: duas fotos, um título e a autorização da cliente.
 *
 * A autorização não é opcional nem enfeite: são fotos de rosto, publicadas num
 * site aberto, e a empresa responde por elas na LGPD. Por isso cada caso pede
 * quem autorizou, quando e como — e o servidor recusa salvar sem isso, porque
 * a tela se contorna. Quem registrou e quando, o servidor anota sozinho.
 */
function AntesDepois({ lista, aoMudar, aviso }) {
  const trocar = (i, patch) => aoMudar(lista.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  const autorizar = (i, patch) => trocar(i, { autorizacao: { ...(lista[i].autorizacao || {}), ...patch } });
  const remover = i => aoMudar(lista.filter((_, n) => n !== i));
  const mover = (i, para) => {
    if (para < 0 || para >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[para]] = [nova[para], nova[i]];
    aoMudar(nova);
  };

  return (
    <div className="cs-casos">
      <p className="cs-dica">
        Só publique com autorização por escrito da cliente — um termo assinado ou uma mensagem dela
        dizendo que pode. Guarde esse registro: se ela pedir para tirar, apague o caso aqui.
      </p>
      {lista.map((c, i) => (
        <div key={i} className="cs-caso">
          <div className="cs-caso-fotos">
            <Imagem rotulo="Antes" uso="antes-depois" valor={c.antes} largura={1200}
                    aoMudar={v => trocar(i, { antes: v })} aviso={aviso} />
            <Imagem rotulo="Depois" uso="antes-depois" valor={c.depois} largura={1200}
                    aoMudar={v => trocar(i, { depois: v })} aviso={aviso} />
          </div>
          <Texto rotulo="Título" valor={c.titulo} aoMudar={v => trocar(i, { titulo: v })}
                 dica="O nome do procedimento. Ex.: Limpeza de pele profunda" />
          <fieldset className="cs-caso-aut">
            <legend>Autorização da cliente</legend>
            <Texto rotulo="Quem autorizou" valor={c.autorizacao?.nome}
                   aoMudar={v => autorizar(i, { nome: v })} />
            <Linha rotulo="Data da autorização">
              <input type="date" value={c.autorizacao?.data || ''} max={new Date().toISOString().slice(0, 10)}
                     onChange={e => autorizar(i, { data: e.target.value })} />
            </Linha>
            <Texto rotulo="Como" valor={c.autorizacao?.como} aoMudar={v => autorizar(i, { como: v })}
                   dica="Ex.: termo assinado na recepção, mensagem no WhatsApp de 12/10." />
            {c.autorizacao?.registradoPor && (
              <span className="cs-dica">
                Registrado por {c.autorizacao.registradoPor} em {c.autorizacao.registradoEm?.split('-').reverse().join('/')}.
              </span>
            )}
          </fieldset>
          <div className="cs-faq-btns">
            <button className="btn btn-g btn-s" onClick={() => mover(i, i - 1)} disabled={i === 0}
                    aria-label="Mover para cima"><ChevronUp size={14} /></button>
            <button className="btn btn-g btn-s" onClick={() => mover(i, i + 1)} disabled={i === lista.length - 1}
                    aria-label="Mover para baixo"><ChevronDown size={14} /></button>
            <button className="btn btn-g btn-s" onClick={() => remover(i)} aria-label="Apagar caso">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-g btn-s" onClick={() => aoMudar([...lista, { antes: '', depois: '', titulo: '', autorizacao: {} }])}>
        <Plus size={14} /> Adicionar caso
      </button>
    </div>
  );
}

/* ── contas conectadas ── */

const RETORNOS = {
  ok: 'Conectado. O site já mostra o que veio da conta.',
  escolher: 'Conectado. Falta escolher qual ficha do Google aparece no site.',
  cancelado: 'Conexão cancelada — nada foi alterado.',
  erro: 'Não deu certo conectar. Veja o aviso abaixo e tente de novo.',
};

/**
 * A situação das contas, mais o recado de quem acabou de voltar do Google ou
 * da Meta. A volta chega como `?conexao=google&resultado=ok` na URL do painel;
 * o recado é lido uma vez e o parâmetro sai da barra, senão recarregar a
 * página repetiria "Conectado" para sempre.
 */
function useConexoes() {
  const [contas, setContas] = useState([]);
  const [retorno] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const resultado = q.get('resultado');
    if (!q.get('conexao') || !RETORNOS[resultado]) return null;
    q.delete('conexao');
    q.delete('resultado');
    const resto = q.toString();
    window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : '') + window.location.hash);
    return { ok: resultado === 'ok' || resultado === 'escolher', texto: RETORNOS[resultado] };
  });

  const recarregarContas = async () => {
    try { setContas(await api.conexoes()); } catch { /* a tela continua sem a seção de status */ }
  };
  useEffect(() => { recarregarContas(); }, []);

  return { contas, recarregarContas, retorno };
}

const quando = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : null;

/**
 * Um cartão por conta: desligado, pronto para conectar, conectado ou com
 * problema. O botão leva para a tela do próprio Google ou da Meta — a senha da
 * dona nunca passa por aqui.
 */
function Conexao({ info, nome, explica, agir }) {
  const [indo, setIndo] = useState(false);
  const [ficha, setFicha] = useState('');
  if (!info) return null;

  const conectar = async () => {
    setIndo(true);
    try {
      const { url } = await api.iniciarConexao(info.provedor, window.location.href);
      window.location.assign(url);
    } catch (erro) {
      setIndo(false);
      await agir(() => Promise.reject(erro));
    }
  };

  if (!info.disponivel) {
    return (
      <div className="cx">
        <p className="cx-txt">{explica}</p>
        <p className="cs-dica">A conexão com o {nome} ainda não foi ativada pela Vital.</p>
      </div>
    );
  }

  if (!info.conectado) {
    return (
      <div className="cx">
        <p className="cx-txt">{explica}</p>
        <button className="btn btn-p btn-s" disabled={indo} onClick={conectar}>
          <Link2 size={14} /> {indo ? 'Abrindo…' : `Conectar ${nome}`}
        </button>
      </div>
    );
  }

  const atualizado = quando(info.sincronizadoEm);
  return (
    <div className={'cx' + (info.situacao === 'erro' ? ' cx-falha' : '')}>
      <div className="cx-cab">
        <span className="cx-ponto" aria-hidden="true" />
        <div>
          <b>{info.conta || `Conta do ${nome}`}</b>
          <span className="cs-dica">
            {info.situacao === 'erro' ? 'Com problema'
              : info.situacao === 'escolher' ? 'Falta escolher a ficha'
              : atualizado ? `Atualizado em ${atualizado}` : 'Conectado'}
          </span>
        </div>
      </div>

      {info.situacao === 'erro' && <p className="cx-erro">{info.erro}</p>}

      {info.situacao === 'escolher' && (
        <div className="cx-ficha">
          <label htmlFor="cx-ficha">Qual ficha aparece no site?</label>
          <select id="cx-ficha" value={ficha} onChange={e => setFicha(e.target.value)}>
            <option value="">Escolha…</option>
            {info.fichas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <button className="btn btn-p btn-s" disabled={!ficha}
                  onClick={() => agir(() => api.escolherFichaGoogle(ficha), 'Ficha escolhida')}>
            Usar esta
          </button>
        </div>
      )}

      <div className="cx-btns">
        {info.situacao === 'erro' ? (
          <button className="btn btn-p btn-s" disabled={indo} onClick={conectar}>
            <Link2 size={14} /> Conectar de novo
          </button>
        ) : info.situacao === 'ok' && (
          <button className="btn btn-g btn-s"
                  onClick={() => agir(() => api.sincronizarConexao(info.provedor), 'Atualizado')}>
            <RefreshCw size={14} /> Atualizar agora
          </button>
        )}
        <button className="btn btn-g btn-s btn-erro"
                onClick={() => {
                  if (window.confirm(`Desconectar o ${nome}? O que veio da conta sai do site.`)) {
                    agir(() => api.desconectar(info.provedor), `${nome} desconectado`);
                  }
                }}>
          Desconectar
        </button>
      </div>
    </div>
  );
}

/** Com a conta conectada, a grade é a da conta: só se olha, não se edita. */
function PreviaPublicacoes({ lista }) {
  return (
    <Linha rotulo="Publicações no site"
           dica="Vêm da conta conectada e se atualizam sozinhas. Para escolher à mão, desconecte.">
      {lista.length ? (
        <div className="cs-posts">
          {lista.slice(0, MAX_POSTS).map((p, i) => (
            <a key={p.imagem + i} className="cs-post" href={p.link || undefined} target="_blank" rel="noreferrer">
              <img src={p.imagem} alt="" />
            </a>
          ))}
        </div>
      ) : (
        <p className="cs-dica">Nenhuma publicação ainda. Use “Atualizar agora” se acabou de conectar.</p>
      )}
    </Linha>
  );
}
