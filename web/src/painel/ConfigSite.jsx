import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Image, Trash2, Upload } from 'lucide-react';
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

      <Secao titulo="Identidade" ajuda="Nome e descrição que aparecem no topo do site.">
        <Texto rotulo="Nome do negócio" valor={cfg.nome} aoMudar={v => mudar('nome', v)} />
        <Texto rotulo="Slogan" valor={cfg.slogan} aoMudar={v => mudar('slogan', v)}
               dica="Uma linha curta abaixo do nome." />
        <Area rotulo="Sobre" valor={cfg.sobre} aoMudar={v => mudar('sobre', v)}
              dica="Um parágrafo sobre o negócio. Deixe vazio para não mostrar." />
      </Secao>

      <Secao titulo="Marca" ajuda="Cor e imagens. Mudam o site inteiro na hora.">
        <Cor rotulo="Cor principal" valor={cfg.marca?.corPrimaria}
             aoMudar={v => mudar('marca.corPrimaria', v)}
             dica="Usada nos botões e destaques." />
        <Imagem rotulo="Logo" uso="logo" valor={cfg.marca?.logo} largura={600}
                aoMudar={v => mudar('marca.logo', v)} aviso={aviso}
                dica="Quadrada fica melhor — aparece dentro de um círculo." />
        <Imagem rotulo="Capa" uso="capa" valor={cfg.marca?.capa} largura={1600}
                aoMudar={v => mudar('marca.capa', v)} aviso={aviso}
                dica="Faixa larga no topo. Sem capa, entra um degradê da cor principal." />
      </Secao>

      <Secao titulo="Textos" ajuda="As palavras dos botões e das mensagens do site.">
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
        <Texto rotulo="Link do mapa" valor={cfg.mapa} aoMudar={v => mudar('mapa', v)}
               dica="Cole o link do Google Maps. Vazio: o site monta a busca pelo endereço." />
        <Texto rotulo="WhatsApp" valor={cfg.whatsapp} aoMudar={v => mudar('whatsapp', v)}
               dica="Só números, com DDD." />
        <Texto rotulo="Instagram" valor={cfg.instagram} aoMudar={v => mudar('instagram', v)}
               dica="Só o nome do perfil, sem @." />
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

function Imagem({ rotulo, uso, valor, largura, aoMudar, dica, aviso }) {
  const entrada = useRef(null);
  const [subindo, setSubindo] = useState(false);

  const escolher = async e => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';           // deixa reescolher o mesmo arquivo depois
    if (!arquivo) return;
    setSubindo(true);
    try {
      // Reduz no navegador antes de subir: foto de celular tem 8 MB e vai
      // aparecer em 90px.
      const dataUrl = await prepararImagem(arquivo, { largura });
      const { url } = await api.enviarImagem(dataUrl, uso);
      aoMudar(url);
    } catch (erro) {
      aviso?.(erro.message);
    } finally {
      setSubindo(false);
    }
  };

  return (
    <Linha rotulo={rotulo} dica={dica}>
      <div className="cs-img">
        <div className="cs-img-previa">
          {valor ? <img src={valor} alt="" /> : <Image size={20} />}
        </div>
        <div className="cs-img-btns">
          <button className="btn btn-g btn-s" disabled={subindo} onClick={() => entrada.current?.click()}>
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
